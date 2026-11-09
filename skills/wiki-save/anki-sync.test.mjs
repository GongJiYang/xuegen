#!/usr/bin/env node
// anki-sync.mjs 的测试：node:test + node:assert，无第三方依赖。
// 纯函数直接 import；端到端在 os.tmpdir() 下建临时 Wiki，用 node:http 起假 AnkiConnect，
// 不连真实 Anki、不碰真实库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseCardPage, toAnkiHtml, insertIds } from "./anki-sync.mjs";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "anki-sync.mjs");
// 拒绝连接的地址：没有任何服务监听，fetch 立即失败。
const DEAD_URL = "http://127.0.0.1:1";

const BLOCK = (front, back) => ["START", "Basic", front, `Back: ${back}`, "END"].join("\n");

async function makeVault() {
  const dir = await mkdtemp(join(tmpdir(), "anki-sync-test-"));
  await mkdir(join(dir, "wiki"), { recursive: true });
  return dir;
}

async function writeCard(vault, rel, text) {
  const file = join(vault, "wiki", "flashcards", rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
  return file;
}

/** 跑脚本；expectFail 时返回 stderr，否则返回 stdout。 */
async function sync(args, { expectFail = false } = {}) {
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], { encoding: "utf8" });
    if (expectFail) assert.fail(`期望失败但成功：${args.join(" ")}\n${stdout}`);
    return stdout;
  } catch (error) {
    if (!expectFail) throw error;
    return error.stderr ?? "";
  }
}

async function syncJson(args, options) {
  return JSON.parse(await sync([...args, "--json"], options));
}

/**
 * 假 AnkiConnect：记录收到的每个请求（{action, params}），按 overrides 覆盖动作。
 * 默认：version→6、modelFieldNames→[Front, Back]、createDeck/getDeckConfig/setDeckConfigId 成功、
 * addNote→自增 noteId。
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
const actionParams = (anki, action) =>
  anki.requests.filter((request) => request.action === action).map((request) => request.params);

// ---------------------------------------------------------------- 纯函数

test("parseCardPage：多行正背面、牌组、FILE TAGS", () => {
  const text = [
    "TARGET DECK",
    "Mathematics::DiscreteMath::EppCh1",
    "",
    "FILE TAGS",
    "discrete epp",
    "",
    "START",
    "Basic",
    "正面第一行",
    "正面第二行",
    "Back: 背面第一行",
    "背面第二行",
    "END",
  ].join("\n");
  const page = parseCardPage(text);
  assert.equal(page.deck, "Mathematics::DiscreteMath::EppCh1");
  assert.deepEqual(page.tags, ["discrete", "epp"]);
  assert.equal(page.blocks.length, 1);
  assert.deepEqual(page.blocks[0], {
    start: 6,
    end: 12,
    type: "Basic",
    front: "正面第一行\n正面第二行",
    back: "背面第一行\n背面第二行",
    id: null,
  });
});

test("parseCardPage：没有 TARGET DECK 时牌组为 Default，牌组值不会取到 FILE TAGS", () => {
  assert.equal(parseCardPage(BLOCK("问", "答")).deck, "Default");
  // 牌组行留空时，下一非空行是 FILE TAGS：不能把它当成牌组名。
  const page = parseCardPage(["TARGET DECK", "", "FILE TAGS", "x", "", BLOCK("问", "答")].join("\n"));
  assert.equal(page.deck, "Default");
  assert.deepEqual(page.tags, ["x"]);
});

test("parseCardPage：ID 在 END 前、紧随 END 后都是已同步，非 Basic 记下来", () => {
  const ids = [
    ["START", "Basic", "问", "Back: 答", "<!--ID: 1794060104186-->", "END"].join("\n"),
    ["START", "Basic", "问", "Back: 答", "END", "", "<!--ID: 1794060104187-->"].join("\n"),
    ["START", "Cloze", "问 {{c1::答}}", "END"].join("\n"),
  ].join("\n\n");
  const page = parseCardPage(ids);
  assert.equal(page.blocks.length, 3);
  assert.equal(page.blocks[0].id, "1794060104186");
  assert.equal(page.blocks[1].id, "1794060104187");
  assert.equal(page.blocks[2].id, null);
  assert.equal(page.blocks[2].type, "Cloze");
});

test("toAnkiHtml：$…$、$$…$$、**、换行，其余原样", () => {
  assert.equal(
    toAnkiHtml("$p \\to q$ 与 $$\\neg q$$ 与 **粗体**\n第二行"),
    "\\(p \\to q\\) 与 \\[\\neg q\\] 与 <b>粗体</b><br>第二行",
  );
  assert.equal(toAnkiHtml("普通文字，没有标记。"), "普通文字，没有标记。");
});

test("insertIds：同一页多块按块定位，不插错已同步块", () => {
  const synced = ["START", "Basic", "已同步", "Back: 答", "<!--ID: 42-->", "END"].join("\n");
  const text = ["", BLOCK("第一张", "答一"), synced, BLOCK("第三张", "答三"), ""].join("\n");
  const out = insertIds(text, [
    { blockIndex: 0, id: 1 },
    { blockIndex: 2, id: 3 },
  ]);
  const lines = out.split("\n");
  assert.equal(lines.filter((line) => line === "<!--ID: 42-->").length, 1, "已同步块不应重复插 ID");
  assert.match(out, /Back: 答一\n<!--ID: 1-->\nEND/);
  assert.match(out, /Back: 答三\n<!--ID: 3-->\nEND/);
  assert.doesNotMatch(out, /已同步\nBack: 答\n<!--ID: 42-->\n<!--ID/);
});

test("insertIds：已带 ID 的块再插一次不变，越界索引忽略", () => {
  const text = ["START", "Basic", "问", "Back: 答", "END"].join("\n");
  const once = insertIds(text, [{ blockIndex: 0, id: 7 }]);
  assert.match(once, /Back: 答\n<!--ID: 7-->\nEND/);
  assert.equal(insertIds(once, [{ blockIndex: 0, id: 8 }]), once);
  assert.equal(insertIds(text, [{ blockIndex: 9, id: 8 }]), text);
});

// ---------------------------------------------------------------- 端到端

test("push：添加卡片并把 ID 写回 END 前", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    const file = await writeCard(vault, "mme/a.md", `TARGET DECK\nMME\n\n${BLOCK("逆否命题与原命题等价吗？", "等价")}\n`);
    const result = await syncJson(["push", vault, "--url", anki.url]);
    assert.equal(result.added, 1);
    assert.deepEqual(result.decks, ["MME"]);
    assert.deepEqual(result.duplicates, []);
    assert.deepEqual(result.failed, []);
    assert.deepEqual(result.skipped, []);
    assert.equal(result.presetMissing, false);

    const note = actionParams(anki, "addNote")[0].note;
    assert.equal(note.deckName, "MME");
    assert.equal(note.modelName, "Basic");
    assert.deepEqual(note.tags, ["xuegen"]);
    assert.deepEqual(note.options, { allowDuplicate: false });

    const text = await readFile(file, "utf8");
    assert.match(text, /Back: 等价\n<!--ID: 1001-->\nEND/);
    // 每页只写一次：临时文件不留痕。
    const { readdir } = await import("node:fs/promises");
    const dir = join(vault, "wiki", "flashcards", "mme");
    assert.ok((await readdir(dir)).every((name) => !name.includes(".tmp-")));
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：字段名映射到 Anki 里的中文字段", async () => {
  const vault = await makeVault();
  const anki = await startAnki({ modelFieldNames: () => ({ result: ["正面", "背面"], error: null }) });
  try {
    await writeCard(vault, "cn/a.md", `TARGET DECK\n书房::Epp\n\n${BLOCK("问题？", "答案")}\n`);
    await syncJson(["push", vault, "--url", anki.url]);
    const note = actionParams(anki, "addNote")[0].note;
    assert.deepEqual(Object.keys(note.fields), ["正面", "背面"]);
    assert.equal(note.fields["正面"], "问题？");
    assert.equal(note.fields["背面"], "答案");
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：HTML 最小转换与文件标签进 tags", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    await writeCard(
      vault,
      "html/a.md",
      [
        "TARGET DECK",
        "Math",
        "",
        "FILE TAGS",
        "discrete epp",
        "",
        "START",
        "Basic",
        "**粗体**与 $p \\to q$",
        "第二行",
        "Back: $$\\neg q \\to \\neg p$$",
        "END",
      ].join("\n"),
    );
    await syncJson(["push", vault, "--url", anki.url]);
    const note = actionParams(anki, "addNote")[0].note;
    assert.equal(note.fields.Front, "<b>粗体</b>与 \\(p \\to q\\)<br>第二行");
    assert.equal(note.fields.Back, "\\[\\neg q \\to \\neg p\\]");
    assert.deepEqual(note.tags, ["xuegen", "discrete", "epp"]);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：duplicate 记进 duplicates 且不写 ID，其它错误记进 failed", async () => {
  const vault = await makeVault();
  const anki = await startAnki({
    addNote: (params) => {
      if (params.note.fields.Front === "重复卡") {
        return { result: null, error: "cannot create note because it is a duplicate" };
      }
      return { result: null, error: "cannot create note: field is empty" };
    },
  });
  try {
    const text = `TARGET DECK\nMME\n\n${BLOCK("重复卡", "答")}\n\n${BLOCK("出错卡", "答")}\n`;
    const file = await writeCard(vault, "dup/a.md", text);
    const result = await syncJson(["push", vault, "--url", anki.url]);
    assert.equal(result.added, 0);
    assert.equal(result.duplicates.length, 1);
    assert.equal(result.duplicates[0].front, "重复卡");
    assert.equal(result.failed.length, 1);
    assert.match(result.failed[0].error, /field is empty/);
    assert.equal(await readFile(file, "utf8"), text, "没有任何卡加成功时不应写文件");
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：连不上 Anki 时退出码 1，文件一字不改", async () => {
  const vault = await makeVault();
  try {
    const text = `TARGET DECK\nMME\n\n${BLOCK("问", "答")}\n`;
    const file = await writeCard(vault, "down/a.md", text);
    const stderr = await sync(["push", vault, "--url", DEAD_URL, "--json"], { expectFail: true });
    assert.match(stderr, /连不上 Anki/);
    assert.equal(await readFile(file, "utf8"), text);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：书房:: 牌组收到 setDeckConfigId，预设取不到时 presetMissing", async () => {
  const vault = await makeVault();
  const anki = await startAnki({
    getDeckConfig: () => ({ result: { id: 7 }, error: null }),
  });
  try {
    await writeCard(vault, "study/a.md", `TARGET DECK\n书房::Epp\n\n${BLOCK("问", "答")}\n`);
    const result = await syncJson(["push", vault, "--url", anki.url]);
    assert.equal(result.presetMissing, false);
    assert.deepEqual(actions(anki).filter((action) => action === "createDeck").length, 1);
    assert.deepEqual(actionParams(anki, "setDeckConfigId"), [
      { decks: ["书房::Epp"], configId: 7 },
    ]);
    assert.deepEqual(actionParams(anki, "getDeckConfig"), [{ deck: "书房" }]);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：没有名为「书房」的牌组时 presetMissing 为 true，卡照样加", async () => {
  const vault = await makeVault();
  const anki = await startAnki({
    getDeckConfig: () => ({ result: null, error: "deck was not found: 书房" }),
  });
  try {
    const file = await writeCard(vault, "study/b.md", `TARGET DECK\n书房::Epp\n\n${BLOCK("问", "答")}\n`);
    const result = await syncJson(["push", vault, "--url", anki.url]);
    assert.equal(result.presetMissing, true);
    assert.equal(result.added, 1);
    assert.equal(actions(anki).includes("setDeckConfigId"), false);
    assert.match(await readFile(file, "utf8"), /<!--ID: 1001-->/);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：没有待同步卡时不连 Anki", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    await writeCard(
      vault,
      "done/a.md",
      `TARGET DECK\nMME\n\n${["START", "Basic", "问", "Back: 答", "<!--ID: 1794060104186-->", "END"].join("\n")}\n`,
    );
    const result = await syncJson(["push", vault, "--url", anki.url]);
    assert.equal(result.added, 0);
    assert.deepEqual(result.decks, []);
    assert.equal(anki.requests.length, 0, `不应发出任何请求：${actions(anki).join(",")}`);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：非 Basic 进 skipped，不发 addNote", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    await writeCard(vault, "cloze/a.md", `TARGET DECK\nMME\n\n${["START", "Cloze", "问 {{c1::答}}", "END"].join("\n")}\n`);
    const result = await syncJson(["push", vault, "--url", anki.url]);
    assert.equal(result.added, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].type, "Cloze");
    assert.equal(actions(anki).includes("addNote"), false);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push --dry-run：列出待同步的卡，不连 Anki、不写文件", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    const text = `TARGET DECK\n书房::Epp\n\n${BLOCK("问", "答")}\n`;
    const file = await writeCard(vault, "dry/a.md", text);
    const result = await syncJson(["push", vault, "--url", anki.url, "--dry-run"]);
    assert.equal(result.added, 0);
    assert.equal(result.dryRun, true);
    assert.equal(result.pending.length, 1);
    assert.equal(result.pending[0].deck, "书房::Epp");
    assert.equal(result.pending[0].front, "问");
    assert.equal(anki.requests.length, 0, "dry-run 不应连 Anki");
    assert.equal(await readFile(file, "utf8"), text, "dry-run 不应写文件");
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：同一页多块时 ID 各归各的块，夹着已同步块也不插错", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    const synced = ["START", "Basic", "已同步", "Back: 旧答", "<!--ID: 4242-->", "END"].join("\n");
    const text = ["TARGET DECK", "书房::Epp", "", BLOCK("第一张", "答一"), synced, BLOCK("第三张", "答三"), ""].join(
      "\n",
    );
    const file = await writeCard(vault, "multi/a.md", text);
    const result = await syncJson(["push", vault, "--url", anki.url]);
    assert.equal(result.added, 2);
    const after = await readFile(file, "utf8");
    // 第一张拿到的 ID 紧跟自己的 Back 行；已同步块原样保留；第三张同理。
    assert.match(after, /Back: 答一\n<!--ID: 1001-->\nEND/);
    assert.match(after, /Back: 旧答\n<!--ID: 4242-->\nEND/);
    assert.match(after, /Back: 答三\n<!--ID: 1002-->\nEND/);
    assert.equal(after.match(/<!--ID:/g)?.length, 3);
    // 再跑一次不应重复发卡（所有块都已有 ID）。
    const second = await syncJson(["push", vault, "--url", anki.url]);
    assert.equal(second.added, 0);
    assert.equal(actionParams(anki, "addNote").length, 2);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("经符号链接调用 --help 有输出（主模块判定比真实路径）", async () => {
  // ~/.xuegen/app 这类符号链接下，argv[1] 与 import.meta.url 字面不同；只比字面会静默 exit 0。
  const dir = await mkdtemp(join(tmpdir(), "anki-sync-link-"));
  try {
    const link = join(dir, "app");
    await symlink(HERE, link, "dir");
    const { stdout } = await run("node", [join(link, "anki-sync.mjs"), "--help"], { encoding: "utf8" });
    assert.match(stdout, /Xuegen 卡片直连 AnkiConnect（anki-sync）/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
