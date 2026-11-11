#!/usr/bin/env node
// anki-sync.mjs × flashcards.mjs 端到端测试（全量测试 B6）：node:test + node:assert，无第三方依赖。
// 一律不连真实 Anki：AnkiConnect 用测试里起的假 HTTP 服务，--url 指向它；绝不打开 collection.anki2。
// 全部文件都在 mkdtemp 临时目录；需要库副本的用例先 cp -R 到临时目录（不写库副本本身）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ANKI_SCRIPT = join(HERE, "anki-sync.mjs");
const FC_SCRIPT = join(HERE, "flashcards.mjs");
// 需要库副本的机器才有；没有就跳过相关用例（可用 XUEGEN_VAULT_COPY 覆盖）。
const VAULT_COPY = process.env.XUEGEN_VAULT_COPY ?? "/tmp/xg-e2e/vault/GJY";

const BLOCK = (front, back) => ["START", "Basic", front, `Back: ${back}`, "END"].join("\n");

// ---------------------------------------------------------------- 辅助

async function makeVault() {
  const dir = await mkdtemp(join(tmpdir(), "anki-full-test-"));
  await mkdir(join(dir, "wiki"), { recursive: true });
  return dir;
}

async function writeCard(vault, rel, text) {
  const file = join(vault, "wiki", "knowledge", "flashcards", rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
  return file;
}

/** 跑脚本；expectFail 返回 { code, stderr }，否则返回 stdout。 */
async function runScript(script, args, { expectFail = false } = {}) {
  try {
    const { stdout } = await run("node", [script, ...args], { encoding: "utf8" });
    if (expectFail) assert.fail(`期望失败但成功：${args.join(" ")}\n${stdout}`);
    return stdout;
  } catch (error) {
    if (!expectFail) throw error;
    return { code: error.code, stderr: error.stderr ?? "" };
  }
}

const ankiRun = (args, options) => runScript(ANKI_SCRIPT, args, options);
const fcRun = (args, options) => runScript(FC_SCRIPT, args, options);
async function ankiJson(args, options) {
  return JSON.parse(await ankiRun([...args, "--json"], options));
}
async function fcJson(args, options) {
  return JSON.parse(await fcRun([...args, "--json"], options));
}

/** 一个刚关掉、没人监听的端口（连接会被立即拒绝）。 */
async function deadUrl() {
  const server = createServer(() => {});
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return `http://127.0.0.1:${port}`;
}

/** 目录树快照（相对路径 → 内容 sha256），用于断言「文件一字不改」。 */
async function snapshot(dir) {
  const out = new Map();
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.set(relative(dir, full), createHash("sha256").update(await readFile(full)).digest("hex"));
    }
  }
  await walk(dir);
  return out;
}

/**
 * 假 AnkiConnect：记录收到的每个请求（{action, params}），按 overrides 覆盖动作。
 * 默认：version→6、modelFieldNames→[Front, Back]、createDeck/getDeckConfig/setDeckConfigId 成功、
 * addNote→自增 noteId（1001 起）。
 */
async function startAnki(overrides = {}) {
  const requests = [];
  let noteId = 1000;
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const payload = JSON.parse(body);
      requests.push(payload);
      const { action, params } = payload;
      let reply;
      if (overrides[action] !== undefined) reply = overrides[action](params, requests);
      else if (action === "version") reply = { result: 6, error: null };
      else if (action === "modelFieldNames") reply = { result: ["Front", "Back"], error: null };
      else if (action === "createDeck") reply = { result: 1, error: null };
      else if (action === "getDeckConfig") reply = { result: { id: 1 }, error: null };
      else if (action === "addNote") {
        noteId += 1;
        reply = { result: noteId, error: null };
      } else reply = { result: null, error: null };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(reply));
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((done) => server.close(done)),
  };
}

const actions = (anki) => anki.requests.map((request) => request.action);
const countAction = (anki, action) => actions(anki).filter((name) => name === action).length;
const actionParams = (anki, action) =>
  anki.requests.filter((request) => request.action === action).map((request) => request.params);

const DUPLICATE = () => ({ result: null, error: "cannot create note because it is a duplicate" });

// ---------------------------------------------------------------- 1. push 新增 + 幂等

test("push：两个新块 → addNote 各一次、ID 回填到各自块；再 push 不再新增", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    const file = await writeCard(
      vault,
      "e2e/two.md",
      `TARGET DECK\nMME\n\n${BLOCK("第一张问", "第一张答")}\n\n${BLOCK("第二张问", "第二张答")}\n`,
    );
    const first = await ankiJson(["push", vault, "--url", anki.url]);

    assert.equal(first.added, 2);
    assert.equal(countAction(anki, "addNote"), 2, "两块各发一次 addNote");
    assert.deepEqual(
      actionParams(anki, "addNote").map((params) => params.note.fields.Front),
      ["第一张问", "第二张问"],
    );

    const after = await readFile(file, "utf8");
    assert.match(after, /Back: 第一张答\n<!--ID: 1001-->\nEND/);
    assert.match(after, /Back: 第二张答\n<!--ID: 1002-->\nEND/);
    assert.equal(after.match(/<!--ID:/g)?.length, 2, "一块一个 ID，不重复");

    // 幂等：第二次 push 一块都不发，文件不变。
    const second = await ankiJson(["push", vault, "--url", anki.url]);
    assert.equal(second.added, 0);
    assert.equal(countAction(anki, "addNote"), 2, "第二次不应再发 addNote");
    assert.equal(await readFile(file, "utf8"), after, "已全部带 ID 的文件不应被重写");
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push 后再 stats：两块都算已同步（跨脚本口径一致）", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    await writeCard(vault, "e2e/stats.md", `TARGET DECK\nMME\n\n${BLOCK("问一", "答一")}\n\n${BLOCK("问二", "答二")}\n`);
    const before = await fcJson(["stats", vault]);
    assert.deepEqual({ total: before.total, unsynced: before.unsynced }, { total: 2, unsynced: 2 });

    await ankiJson(["push", vault, "--url", anki.url]);

    const after = await fcJson(["stats", vault]);
    assert.deepEqual({ total: after.total, unsynced: after.unsynced }, { total: 2, unsynced: 0 });
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- 2. duplicate → 回填已有 ID

test("push：addNote 报 duplicate 时按正面唯一匹配回填已有笔记 ID，且不再算重复", async () => {
  const vault = await makeVault();
  const existing = {
    noteId: 111,
    modelName: "Basic",
    fields: { Front: { value: "<code>isPrime</code><br>是<b>判定</b>函数？" }, Back: { value: "答" } },
  };
  const anki = await startAnki({
    addNote: DUPLICATE,
    findNotes: () => ({ result: [111], error: null }),
    notesInfo: () => ({ result: [existing], error: null }),
  });
  try {
    const file = await writeCard(vault, "e2e/dup.md", `TARGET DECK\nMME\n\n${BLOCK("isPrime 是**判定**函数？", "答")}\n`);
    const result = await ankiJson(["push", vault, "--url", anki.url]);

    assert.equal(result.added, 0, "已存在的卡不算新增");
    assert.deepEqual(result.duplicates, [], "关联成功的不该再进 duplicates");
    assert.equal(result.linked.length, 1);
    assert.equal(result.linked[0].id, 111);
    assert.match(await readFile(file, "utf8"), /Back: 答\n<!--ID: 111-->\nEND/);

    // 查已有笔记时按牌组查、按正面归一后匹配。
    assert.deepEqual(actionParams(anki, "findNotes"), [{ query: 'deck:"MME"' }]);
    assert.deepEqual(actionParams(anki, "notesInfo"), [{ notes: [111] }]);

    // 回填后再 push：块已有 ID，连 Anki 都不连。
    const requestCount = anki.requests.length;
    const second = await ankiJson(["push", vault, "--url", anki.url]);
    assert.equal(second.added, 0);
    assert.deepEqual(second.linked, []);
    assert.equal(anki.requests.length, requestCount, "全部块都有 ID 时不该再发请求");
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：同正面有两张已有笔记时不猜，记 duplicates 且不写 ID", async () => {
  const vault = await makeVault();
  const note = (noteId) => ({
    noteId,
    modelName: "Basic",
    fields: { Front: { value: "同一正面" }, Back: { value: "答" } },
  });
  const anki = await startAnki({
    addNote: DUPLICATE,
    findNotes: () => ({ result: [111, 112], error: null }),
    notesInfo: () => ({ result: [note(111), note(112)], error: null }),
  });
  try {
    const text = `TARGET DECK\nMME\n\n${BLOCK("同一正面", "答")}\n`;
    const file = await writeCard(vault, "e2e/amb.md", text);
    const result = await ankiJson(["push", vault, "--url", anki.url]);
    assert.deepEqual(result.linked, []);
    assert.equal(result.duplicates.length, 1);
    assert.equal(await readFile(file, "utf8"), text, "不回填就不写文件");
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- 3. 多块同正面

test("push：同一文件两块同正面（Anki 不拦）→ 各发一次 addNote、各拿各的 ID，不合并", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    const file = await writeCard(
      vault,
      "e2e/same-front.md",
      `TARGET DECK\nMME\n\n${BLOCK("同一个正面", "答一")}\n\n${BLOCK("同一个正面", "答二")}\n`,
    );
    const result = await ankiJson(["push", vault, "--url", anki.url]);

    // 实际行为：脚本不按正面去重（去重交给 Anki 的 allowDuplicate:false），两块各自建卡。
    assert.equal(result.added, 2);
    assert.equal(countAction(anki, "addNote"), 2);
    assert.deepEqual(
      actionParams(anki, "addNote").map((params) => params.note.options),
      [{ allowDuplicate: false }, { allowDuplicate: false }],
    );
    const after = await readFile(file, "utf8");
    assert.match(after, /Back: 答一\n<!--ID: 1001-->\nEND/);
    assert.match(after, /Back: 答二\n<!--ID: 1002-->\nEND/);
    assert.equal(after.match(/<!--ID:/g)?.length, 2, "两块 ID 不互相覆盖");
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：两个文件同正面且 Anki 报 duplicate → 第一块回填 ID，第二块进 duplicates", async () => {
  const vault = await makeVault();
  const anki = await startAnki({
    addNote: DUPLICATE,
    findNotes: () => ({ result: [111], error: null }),
    notesInfo: () => ({
      result: [{ noteId: 111, modelName: "Basic", fields: { Front: { value: "同一个正面" }, Back: { value: "答" } } }],
      error: null,
    }),
  });
  try {
    // 两块同正面：先被扫到的那块拿到 111，后一块只能是重复（顺序不影响结论）。
    const a = await writeCard(vault, "e2e/a.md", `TARGET DECK\nMME\n\n${BLOCK("同一个正面", "答A")}\n`);
    const bText = `TARGET DECK\nMME\n\n${BLOCK("同一个正面", "答B")}\n`;
    const b = await writeCard(vault, "e2e/b.md", bText);
    const result = await ankiJson(["push", vault, "--url", anki.url]);

    assert.equal(result.added, 0);
    assert.equal(result.linked.length, 1, "同一张笔记只回填到一处");
    assert.equal(result.linked[0].id, 111);
    assert.equal(result.duplicates.length, 1, "另一块不抢同一个 ID");
    // 写到哪个文件取决于扫描顺序：恰好一个文件被写了 ID，另一个字节不变。
    const [textA, textB] = [await readFile(a, "utf8"), await readFile(b, "utf8")];
    const written = [textA, textB].filter((text) => text.includes("<!--ID: 111-->"));
    assert.equal(written.length, 1, `只应有一个文件被回填 ID：\n${textA}\n---\n${textB}`);
    assert.ok(textA === bText || textB === bText, "没被回填的那个文件应原样不动");
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- 4. 结构异常的块

test("push：缺 END 的块不发请求、文件不变，但记进 failed", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    const text = `TARGET DECK\nMME\n\n${["START", "Basic", "只有一半", "Back: 答"].join("\n")}\n`;
    const file = await writeCard(vault, "e2e/no-end.md", text);
    const result = await ankiJson(["push", vault, "--url", anki.url]);

    assert.equal(result.added, 0);
    assert.equal(anki.requests.length, 0, `缺 END 时不该发请求：${actions(anki).join(",")}`);
    assert.equal(await readFile(file, "utf8"), text, "缺 END 的块不该被写 ID");
    assert.equal(result.failed.length, 1, `缺 END 的块应进 failed：${JSON.stringify(result.failed)}`);
    assert.match(result.failed[0].error, /缺少 END/);
    assert.equal(result.failed[0].block, 1, "块序号按文档顺序");
    assert.equal(result.failed[0].front, "只有一半", "报出块里的正面，方便定位");
    assert.deepEqual(result.skipped, []);
    // dry-run 同样报出来，且不连 Anki。
    const dry = await ankiJson(["push", vault, "--url", anki.url, "--dry-run"]);
    assert.deepEqual(dry.pending, []);
    assert.equal(dry.failed.length, 1);
    assert.equal(anki.requests.length, 0);
    // 人类可读输出里也有失败行。
    const human = await ankiRun(["push", vault, "--url", anki.url, "--dry-run"]);
    assert.match(human, /失败：wiki\/knowledge\/flashcards\/e2e\/no-end\.md 第1块「只有一半」缺少 END/);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：中间块缺 END（A 缺、B 完整）→ A 记 failed，B 照常作为独立一块同步", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    const head = ["START", "Basic", "缺结尾的正面", "Back: 缺结尾的背面"].join("\n");
    const text = `TARGET DECK\nMME\n\n${head}\n\n${BLOCK("完好的问", "完好的答")}\n`;
    const file = await writeCard(vault, "e2e/mid-no-end.md", text);
    const result = await ankiJson(["push", vault, "--url", anki.url]);

    assert.equal(result.added, 1, "B 应照常同步");
    assert.equal(countAction(anki, "addNote"), 1, "只该为 B 发一次 addNote");
    assert.deepEqual(actionParams(anki, "addNote")[0].note.fields, { Front: "完好的问", Back: "完好的答" });
    const sent = JSON.stringify(anki.requests);
    assert.ok(!sent.includes("缺结尾的正面"), `A 的正面不该出现在任何请求里：${sent}`);
    assert.ok(!sent.includes("缺结尾的背面"), `A 的背面不该出现在任何请求里：${sent}`);
    assert.equal(result.failed.length, 1, `A 应进 failed：${JSON.stringify(result.failed)}`);
    assert.match(result.failed[0].error, /缺少 END/);
    assert.equal(result.failed[0].front, "缺结尾的正面");
    assert.equal(result.failed[0].block, 1);

    const after = await readFile(file, "utf8");
    assert.match(after, /Back: 完好的答\n<!--ID: 1001-->\nEND/, "B 的 ID 回填在自己的 END 前");
    assert.ok(after.includes(head), `A 原样保留：\n${after}`);
    assert.equal(after.match(/<!--ID:/g)?.length, 1, "只给 B 写 ID");
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：ID 行在 END 之后（允许空行）按已同步处理，不发请求、文件不变", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    // 块内无 ID、ID 紧跟 END 之后：Obsidian_to_Anki 的旧写法，仍算同步过。
    const text = `TARGET DECK\nMME\n\n${["START", "Basic", "问", "Back: 答", "END", "", "<!--ID: 777-->"].join("\n")}\n`;
    const file = await writeCard(vault, "e2e/id-after-end.md", text);
    const result = await ankiJson(["push", vault, "--url", anki.url]);

    assert.equal(result.added, 0);
    assert.equal(anki.requests.length, 0, "ID 在 END 后也算同步，不该发请求");
    assert.equal(await readFile(file, "utf8"), text, "不该把 ID 挪进块里");
    // stats 与 push 口径一致：也算已同步。
    const stats = await fcJson(["stats", vault]);
    assert.deepEqual({ total: stats.total, unsynced: stats.unsynced }, { total: 1, unsynced: 0 });
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：ID 落在前一块 END 与后一块 START 之间时不给后一块加分，也不重复发前一块", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    // 前一块自己的 ID（在块内），后一块无 ID：只有后一块该被同步。
    const text = [
      "TARGET DECK",
      "MME",
      "",
      ["START", "Basic", "已同步", "Back: 旧答", "<!--ID: 4242-->", "END"].join("\n"),
      "",
      BLOCK("新卡", "新答"),
      "",
    ].join("\n");
    const file = await writeCard(vault, "e2e/mixed.md", text);
    const result = await ankiJson(["push", vault, "--url", anki.url]);

    assert.equal(result.added, 1);
    assert.equal(countAction(anki, "addNote"), 1);
    const after = await readFile(file, "utf8");
    assert.match(after, /Back: 旧答\n<!--ID: 4242-->\nEND/, "已同步块原样保留");
    assert.match(after, /Back: 新答\n<!--ID: 1001-->\nEND/);
    assert.equal(after.match(/<!--ID:/g)?.length, 2);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- 5. --dry-run --json

test("push --dry-run --json：不发写请求、文件一字不改，输出里有待新增数量", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    const text = `TARGET DECK\nMME\n\n${BLOCK("问一", "答一")}\n\n${BLOCK("问二", "答二")}\n`;
    await writeCard(vault, "e2e/dry.md", text);
    const before = await snapshot(join(vault, "wiki", "knowledge", "flashcards"));

    const result = await ankiJson(["push", vault, "--url", anki.url, "--dry-run"]);
    assert.equal(result.dryRun, true);
    assert.equal(result.added, 0);
    assert.equal(result.pending.length, 2, "输出里有将要新增的数量");
    assert.deepEqual(
      result.pending.map((item) => item.front),
      ["问一", "问二"],
    );
    // 假服务只可能收到只读请求：实际是一个都没收到（dry-run 不连 Anki）。
    assert.deepEqual(
      actions(anki).filter((action) => ["addNote", "createDeck", "setDeckConfigId"].includes(action)),
      [],
      `dry-run 不该发写请求：${actions(anki).join(",")}`,
    );
    assert.equal(anki.requests.length, 0, `dry-run 不该连 Anki：${actions(anki).join(",")}`);
    assert.deepEqual(await snapshot(join(vault, "wiki", "knowledge", "flashcards")), before, "文件字节不变");

    // 人类可读输出也报数量。
    const human = await ankiRun(["push", vault, "--url", anki.url, "--dry-run"]);
    assert.match(human, /将同步 2 张卡/);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- 6. 假服务不可达

test("push：连不上 Anki 时中文报错、退出码 1、文件一字不改", async () => {
  const vault = await makeVault();
  try {
    const url = await deadUrl();
    const text = `TARGET DECK\nMME\n\n${BLOCK("问", "答")}\n`;
    const file = await writeCard(vault, "e2e/down.md", text);
    const before = await snapshot(join(vault, "wiki", "knowledge", "flashcards"));

    const { code, stderr } = await ankiRun(["push", vault, "--url", url], { expectFail: true });
    assert.equal(code, 1);
    assert.match(stderr, /anki-sync: 连不上 Anki：请打开 Anki 并确认装了 AnkiConnect/);
    assert.equal(await readFile(file, "utf8"), text);
    assert.deepEqual(await snapshot(join(vault, "wiki", "knowledge", "flashcards")), before, "不留临时文件");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- 7. flashcards：stats / add

test("stats：多牌组 + 未同步计数 + 待制卡摘录", async () => {
  const vault = await makeVault();
  try {
    await writeCard(
      vault,
      "mme/a.md",
      `TARGET DECK\nMME\n\n${BLOCK("问一", "答一")}\n\n${["START", "Basic", "问二", "Back: 答二", "<!--ID: 1-->", "END"].join("\n")}\n`,
    );
    await writeCard(vault, "link/b.md", `TARGET DECK\nLink\n\n${BLOCK("问三", "答三")}\n`);
    const extracts = join(vault, "wiki", "knowledge", "extracts", "src");
    await mkdir(extracts, { recursive: true });
    await writeFile(join(extracts, "e.md"), "---\ncards: pending\n---\n\n# E\n", "utf8");

    const stats = await fcJson(["stats", vault]);
    assert.equal(stats.total, 3);
    assert.equal(stats.unsynced, 2);
    assert.equal(stats.pendingExtracts, 1);
    assert.deepEqual(
      stats.decks.map((deck) => [deck.deck, deck.total, deck.unsynced]),
      [
        ["Link", 1, 1],
        ["MME", 2, 1],
      ],
    );
    // 输出是 JSON：非 --json 时是人类可读摘要。
    const human = await fcRun(["stats", vault]);
    assert.match(human, /卡片 3｜待同步 2｜待制卡摘录 1/);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("add：牌组目录不存在时新建 flashcards/<安全名>/inbox.md，随后 push 能同步", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    const added = await fcJson(["add", vault, "--deck", "Math::Bar 2", "--front", "新问题？", "--back", "新答案"]);
    assert.equal(added.file, join(vault, "wiki", "knowledge", "flashcards", "Math-Bar-2", "inbox.md"));
    assert.equal(added.deck, "Math::Bar 2");
    const text = await readFile(added.file, "utf8");
    assert.ok(
      text.startsWith("# Math::Bar 2 收件箱\n\nTARGET DECK\nMath::Bar 2\n\n"),
      `收件箱页头不符：${JSON.stringify(text.slice(0, 60))}`,
    );
    assert.match(text, /START\nBasic\n新问题？\nBack: 新答案\nEND\n$/);

    // 端到端：add 写下的卡能被 push 同步、ID 回填进同一个 inbox。
    const result = await ankiJson(["push", vault, "--url", anki.url]);
    assert.equal(result.added, 1);
    assert.equal(actionParams(anki, "addNote")[0].note.deckName, "Math::Bar 2");
    assert.match(await readFile(added.file, "utf8"), /Back: 新答案\n<!--ID: 1001-->\nEND/);
    const stats = await fcJson(["stats", vault]);
    assert.deepEqual({ total: stats.total, unsynced: stats.unsynced }, { total: 1, unsynced: 0 });
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("add：正面与已有卡重复时 flashcards 不查重，照样追加（去重留给 push/Anki）", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    const existing = await writeCard(vault, "mme/a.md", `TARGET DECK\nMME\n\n${BLOCK("同一个正面", "答一")}\n`);
    const added = await fcJson(["add", vault, "--deck", "MME", "--front", "同一个正面", "--back", "答二"]);
    assert.equal(added.file, join(dirname(existing), "inbox.md"));
    assert.match(await readFile(added.file, "utf8"), /START\nBasic\n同一个正面\nBack: 答二\nEND/);

    // 实际行为：add 不去重，push 交给 Anki（allowDuplicate:false）判；这里假服务不拦，两张都进。
    const result = await ankiJson(["push", vault, "--url", anki.url]);
    assert.equal(result.added, 2);
    assert.equal(countAction(anki, "addNote"), 2);
    const stats = await fcJson(["stats", vault]);
    assert.equal(stats.total, 2);
    assert.equal(stats.unsynced, 0);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- 8. 库副本冒烟（只读 + dry-run）

test(
  "库副本冒烟：复制后 stats --json 与 push --dry-run --json 不崩、不改副本",
  { skip: existsSync(VAULT_COPY) ? false : `${VAULT_COPY} 不存在（需要有库副本的机器）` },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "anki-full-vault-"));
    const anki = await startAnki();
    try {
      // 先复制再跑：绝不写库副本本身。只复制脚本会读的部分（wiki/ 与根 .md）；
      // 库副本里的 raw/ 有数百 MB，两个脚本都不读它，复制它只会把测试拖到几十秒。
      const copy = join(dir, "GJY");
      await mkdir(copy, { recursive: true });
      await run("cp", ["-R", join(VAULT_COPY, "wiki"), join(copy, "wiki")]);
      for (const name of await readdir(VAULT_COPY)) {
        if (name.endsWith(".md")) await run("cp", [join(VAULT_COPY, name), join(copy, name)]);
      }
      await run("chmod", ["-R", "u+w", copy]);
      const before = await snapshot(copy);

      const stats = await fcJson(["stats", copy]);
      assert.equal(typeof stats.total, "number");
      assert.ok(Number.isInteger(stats.total) && stats.total >= 0, `total 应为非负整数：${stats.total}`);
      assert.ok(Number.isInteger(stats.unsynced) && stats.unsynced >= 0 && stats.unsynced <= stats.total);
      assert.ok(Array.isArray(stats.decks));
      assert.equal(typeof stats.pendingExtracts, "number");
      // 各牌组 total/unsynced 加起来等于总数（不变量，不断言具体值）。
      assert.equal(
        stats.decks.reduce((sum, deck) => sum + deck.total, 0),
        stats.total,
        "牌组卡片数之和应等于总数",
      );
      assert.equal(
        stats.decks.reduce((sum, deck) => sum + deck.unsynced, 0),
        stats.unsynced,
        "牌组待同步数之和应等于总待同步",
      );

      const dry = await ankiJson(["push", copy, "--url", anki.url, "--dry-run"]);
      assert.equal(dry.dryRun, true);
      assert.equal(dry.added, 0);
      assert.ok(Array.isArray(dry.pending), "pending 应是数组");
      assert.equal(
        dry.pending.length,
        stats.unsynced,
        "dry-run 的待同步数与 stats 的待同步数应为同一口径",
      );
      for (const item of dry.pending) {
        assert.equal(typeof item.file, "string");
        assert.ok(Number.isInteger(item.block) && item.block >= 1);
      }
      assert.equal(anki.requests.length, 0, "dry-run 不该连 Anki");

      // dry-run 之后副本内容不变。
      assert.deepEqual(await snapshot(copy), before, "dry-run 不应改动库副本");
    } finally {
      await anki.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
