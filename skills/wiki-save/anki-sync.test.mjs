#!/usr/bin/env node
// anki-sync.mjs 的测试：node:test + node:assert，无第三方依赖。
// 纯函数直接 import；端到端在 os.tmpdir() 下建临时 Wiki，用 node:http 起假 AnkiConnect，
// 不连真实 Anki、不碰真实库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseCardPage, toAnkiHtml, insertIds, normalizeFront } from "./anki-sync.mjs";

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
  const file = join(vault, "wiki", "knowledge", "flashcards", rel);
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

test("parseCardPage：缺 END 的块记 broken，后面的完整块仍是独立一块", () => {
  const broken = ["START", "Basic", "缺结尾", "Back: 缺结尾的答"].join("\n");
  const page = parseCardPage([BLOCK("问一", "答一"), "", broken, "", BLOCK("问二", "答二")].join("\n"));
  assert.equal(page.blocks.length, 2, "只收完整块");
  assert.deepEqual(
    page.blocks.map((block) => block.front),
    ["问一", "问二"],
    "B 不该把缺 END 的 A 粘进来",
  );
  assert.equal(page.broken.length, 1);
  assert.equal(page.broken[0].error, "缺少 END");
  assert.equal(page.broken[0].front, "缺结尾");
  assert.equal(page.broken[0].start, 6, "start 是那个 START 的行号");

  // 文件末尾缺 END 同样记 broken。
  const tail = parseCardPage(
    [`TARGET DECK\nX\n\n${BLOCK("问", "答")}\n`, "", ["START", "Basic", "末尾缺"].join("\n")].join("\n"),
  );
  assert.equal(tail.blocks.length, 1);
  assert.equal(tail.broken.length, 1);
  assert.equal(tail.broken[0].error, "缺少 END");
  assert.equal(tail.broken[0].front, "末尾缺");

  // 全部完整时 broken 为空。
  assert.deepEqual(parseCardPage(BLOCK("问", "答")).broken, []);
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

test("normalizeFront：去标签、还原实体、去空白，两边同一正面相等", () => {
  // Markdown 一侧先过 toAnkiHtml，再与 Anki 里存的值同样归一。
  assert.equal(normalizeFront(toAnkiHtml("isPrime 是\n**判定**函数？")), "isPrime是判定函数？");
  assert.equal(normalizeFront("<code>isPrime</code><br>是<b>判定</b>函数？"), "isPrime是判定函数？");
  assert.equal(normalizeFront("a&nbsp;&amp;&nbsp;b"), "a&b");
  assert.equal(normalizeFront("&lt;code&gt;"), "<code>");
  assert.notEqual(normalizeFront("问一"), normalizeFront("问二"));
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
    const dir = join(vault, "wiki", "knowledge", "flashcards", "mme");
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

// ---------------------------------------------------------------- Anki 里已有同样的卡 → 回填 ID

/** 假 AnkiConnect：一张正面为 `<code>isPrime</code><br>是<b>判定</b>函数？` 的已有笔记（noteId 111）。 */
const existingNotes = (...notes) => () => ({ result: notes, error: null });
const LINK_FRONT = "isPrime 是**判定**函数？";
const EXISTING_ISPRIME = {
  noteId: 111,
  modelName: "Basic",
  fields: { Front: { value: "<code>isPrime</code><br>是<b>判定</b>函数？" }, Back: { value: "答" } },
};
const DUPLICATE = () => ({ result: null, error: "cannot create note because it is a duplicate" });

/** 造一个「addNote 报 duplicate + findNotes/notesInfo 能查回已有笔记」的假服务。 */
function duplicateAnki({ found = [111], notes = [EXISTING_ISPRIME] } = {}) {
  return startAnki({
    addNote: DUPLICATE,
    findNotes: () => ({ result: found, error: null }),
    notesInfo: existingNotes(...notes),
  });
}

test("push：addNote 报 duplicate 时按正面匹配已有笔记，唯一匹配则回填 ID", async () => {
  const vault = await makeVault();
  const anki = await duplicateAnki();
  try {
    // Markdown 一侧是 **…**，Anki 里存成了 <b>…</b> 并多一个 <br>：归一后同一正面。
    const file = await writeCard(vault, "link/a.md", `TARGET DECK\nMME\n\n${BLOCK(LINK_FRONT, "答")}\n`);
    const result = await syncJson(["push", vault, "--url", anki.url]);

    assert.equal(result.added, 0, "已存在的卡不算新增");
    assert.deepEqual(result.duplicates, [], "关联成功的不该再算重复");
    assert.equal(result.linked.length, 1);
    const [linked] = result.linked;
    assert.equal(linked.file, "wiki/knowledge/flashcards/link/a.md");
    assert.equal(linked.block, 1);
    assert.equal(linked.deck, "MME");
    assert.equal(linked.front, LINK_FRONT);
    assert.equal(linked.id, 111);

    assert.match(await readFile(file, "utf8"), /Back: 答\n<!--ID: 111-->\nEND/);
    assert.deepEqual(actionParams(anki, "findNotes"), [{ query: 'deck:"MME"' }]);
    assert.deepEqual(actionParams(anki, "notesInfo"), [{ notes: [111] }]);

    // 回填后再跑一次：块已有 ID，不再当待同步（不连 Anki）。
    const second = await syncJson(["push", vault, "--url", anki.url]);
    assert.equal(second.added, 0);
    assert.deepEqual(second.linked, []);
    assert.equal(actionParams(anki, "addNote").length, 1);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：同正面有两张已有笔记时不回填，仍记 duplicates", async () => {
  const vault = await makeVault();
  const anki = await duplicateAnki({
    found: [111, 112],
    notes: [EXISTING_ISPRIME, { ...EXISTING_ISPRIME, noteId: 112 }],
  });
  try {
    const text = `TARGET DECK\nMME\n\n${BLOCK(LINK_FRONT, "答")}\n`;
    const file = await writeCard(vault, "amb/a.md", text);
    const result = await syncJson(["push", vault, "--url", anki.url]);
    assert.deepEqual(result.linked, [], "匹配不唯一就不猜");
    assert.equal(result.duplicates.length, 1);
    assert.equal(result.duplicates[0].front, LINK_FRONT);
    assert.equal(await readFile(file, "utf8"), text, "不回填就不写文件");
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：缺 END 的块里写着的 ID 也算被占用，不能回填给别的块", async () => {
  const vault = await makeVault();
  const anki = await duplicateAnki();
  try {
    // 一块缺 END 但已经写了 <!--ID: 111-->：那张笔记已属于它，不能让完整块抢去。
    const brokenText = ["START", "Basic", "缺结尾的卡", "Back: 答", "<!--ID: 111-->"].join("\n");
    const text = `TARGET DECK\nMME\n\n${brokenText}\n\n${BLOCK(LINK_FRONT, "答")}\n`;
    const file = await writeCard(vault, "brokenid/a.md", text);
    const result = await syncJson(["push", vault, "--url", anki.url]);
    assert.deepEqual(result.linked, [], "缺 END 的块占着的 ID 不得重复回填");
    assert.equal(result.duplicates.length, 1);
    assert.equal(result.failed.length, 1, "缺 END 的块进 failed");
    assert.match(result.failed[0].error, /缺少 END/);
    assert.equal(await readFile(file, "utf8"), text, "不写文件");
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：命中笔记的 ID 已被库里别的块占用时不回填，仍记 duplicates", async () => {
  const vault = await makeVault();
  const anki = await duplicateAnki();
  try {
    // 另一个卡片文件已经写着 <!--ID: 111-->（同一张笔记）。
    await writeCard(
      vault,
      "other/used.md",
      `TARGET DECK\nMME\n\n${["START", "Basic", "别的卡", "Back: 答", "<!--ID: 111-->", "END"].join("\n")}\n`,
    );
    const text = `TARGET DECK\nMME\n\n${BLOCK(LINK_FRONT, "答")}\n`;
    const file = await writeCard(vault, "reuse/a.md", text);
    const result = await syncJson(["push", vault, "--url", anki.url]);
    assert.deepEqual(result.linked, [], "ID 已被别的块用掉，不能重复回填");
    assert.equal(result.duplicates.length, 1);
    assert.equal(await readFile(file, "utf8"), text);
  } finally {
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：同一牌组多张 duplicate 只查一次 findNotes", async () => {
  const vault = await makeVault();
  const anki = await duplicateAnki({ found: [], notes: [] });
  try {
    const text = `TARGET DECK\nMME\n\n${BLOCK("卡一", "答一")}\n\n${BLOCK("卡二", "答二")}\n`;
    const file = await writeCard(vault, "many/a.md", text);
    const result = await syncJson(["push", vault, "--url", anki.url]);
    assert.equal(result.duplicates.length, 2);
    assert.equal(actionParams(anki, "findNotes").length, 1, "同一牌组只查一次");
    assert.equal(await readFile(file, "utf8"), text);
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

test("push：只有旧 wiki/知识/flashcards/ 时不再读它（无待同步卡）", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  try {
    const file = join(vault, "wiki", "知识", "flashcards", "old", "a.md");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `TARGET DECK\nMME\n\n${BLOCK("问", "答")}\n`, "utf8");
    const result = await syncJson(["push", vault, "--url", anki.url, "--dry-run"]);
    assert.equal(result.pending.length, 0, "旧目录里的卡不再读到");
    assert.equal(anki.requests.length, 0, "dry-run 不应连 Anki");
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
    assert.deepEqual(result.linked, [], "dry-run 不查 Anki，linked 为空");
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

// ---------------------------------------------------------------- 沙盒正向代理（阶段 4a-i2 / 4a-2 回归）

/**
 * 跑脚本，env 里先清掉所有代理变量再叠加 `env`（本机 shell 可能开着代理，
 * 不清会污染「没有 HTTP_PROXY 时走 fetch」这条用例）。
 */
const PROXY_VARS = ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"];

async function syncWithEnv(args, env, { expectFail = false } = {}) {
  const childEnv = { ...process.env };
  for (const key of [...PROXY_VARS, "NO_PROXY", "no_proxy"]) delete childEnv[key];
  Object.assign(childEnv, env);
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], { encoding: "utf8", env: childEnv });
    if (expectFail) assert.fail(`期望失败但成功：${args.join(" ")}\n${stdout}`);
    return stdout;
  } catch (error) {
    if (!expectFail) throw error;
    return error.stderr ?? "";
  }
}

async function syncJsonWithEnv(args, env, options) {
  return JSON.parse(await syncWithEnv([...args, "--json"], env, options));
}

/**
 * 假 HTTP 正向代理：收绝对 URL 的请求行（`POST http://127.0.0.1:PORT/`），把请求
 * 转发到那个地址，响应原样回给客户端。记录每个请求的 request-line URL 与头，用来
 * 断言「真的走了代理」以及 `Proxy-Authorization` 的有无。
 */
async function startProxy() {
  const seen = [];
  const server = createServer((request, response) => {
    seen.push({ method: request.method, url: request.url, headers: request.headers });
    let target;
    try {
      target = new URL(request.url);
    } catch {
      response.writeHead(400, { "content-type": "text/plain" });
      response.end("not a proxy request");
      return;
    }
    const forwarded = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers: { ...request.headers, host: target.host },
      },
      (upstream) => {
        response.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(response);
      },
    );
    forwarded.on("error", () => {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end("upstream failed");
    });
    request.pipe(forwarded);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  return {
    port,
    seen,
    close: () => new Promise((done) => server.close(done)),
  };
}

test("push：有 HTTP_PROXY 且目标是本机时经正向代理发，带 Proxy-Authorization", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  const proxy = await startProxy();
  try {
    const file = await writeCard(vault, "proxy/a.md", `TARGET DECK\n书房::Epp\n\n${BLOCK("问", "答")}\n`);
    const result = await syncJsonWithEnv(["push", vault, "--url", anki.url], {
      // 沙盒代理的凭据里还编码了命令 id；这里用普通 user:pass 覆盖同一段逻辑。
      HTTP_PROXY: `http://user:pass@127.0.0.1:${proxy.port}`,
    });

    // 结果与直连一致：卡加进去了、ID 回填了。
    assert.equal(result.added, 1);
    assert.equal(result.presetMissing, false);
    assert.match(await readFile(file, "utf8"), /<!--ID: 1001-->/);

    // 请求确实经过代理：request-line 是完整目标 URL，Host 头写目标主机。
    assert.ok(proxy.seen.length > 0, "代理应至少收到一个请求");
    const [first] = proxy.seen;
    assert.equal(first.method, "POST");
    // 请求行是脚本拼的完整目标 URL（`postViaProxy` 的 path 就是 targetUrl 本身）。
    assert.equal(first.url, anki.url);
    assert.equal(first.headers.host, new URL(anki.url).host);
    // 凭据头是 Basic base64(user:pass)——沙盒代理靠 URL 里的凭据认连接。
    assert.equal(first.headers["proxy-authorization"], `Basic ${Buffer.from("user:pass").toString("base64")}`);
    // 每个请求都带，不只是第一个。
    assert.ok(proxy.seen.every((request) => request.headers["proxy-authorization"] !== undefined));
    // 代理真把请求转给了 AnkiConnect：每个 AnkiConnect 动作都经过代理，一个不少。
    assert.equal(proxy.seen.length, actions(anki).length);
    assert.ok(actions(anki).includes("addNote"));
  } finally {
    await proxy.close();
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：代理 URL 不带凭据时不发 Proxy-Authorization", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  const proxy = await startProxy();
  try {
    await writeCard(vault, "proxy/b.md", `TARGET DECK\nMME\n\n${BLOCK("问", "答")}\n`);
    const result = await syncJsonWithEnv(["push", vault, "--url", anki.url], {
      http_proxy: `http://127.0.0.1:${proxy.port}`,
    });

    assert.equal(result.added, 1);
    assert.ok(proxy.seen.length > 0);
    for (const request of proxy.seen) {
      assert.equal(request.headers["proxy-authorization"], undefined, "没凭据就不该发这个头");
    }
  } finally {
    await proxy.close();
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：没有 HTTP_PROXY 时照旧直连 fetch，代理一个请求都收不到", async () => {
  const vault = await makeVault();
  const anki = await startAnki();
  const proxy = await startProxy();
  try {
    await writeCard(vault, "direct/a.md", `TARGET DECK\nMME\n\n${BLOCK("问", "答")}\n`);
    // env 里不给代理变量（syncWithEnv 已经把 shell 的可能值清掉了）。
    const result = await syncJsonWithEnv(["push", vault, "--url", anki.url], {});
    assert.equal(result.added, 1);
    assert.deepEqual(proxy.seen, [], "没有 HTTP_PROXY 就不该经代理");
    assert.ok(actions(anki).includes("addNote"));
  } finally {
    await proxy.close();
    await anki.close();
    await rm(vault, { recursive: true, force: true });
  }
});

test("push：有 HTTP_PROXY 但目标是外网时不走代理分支（仍用 fetch）", async () => {
  // 代理分支只认 `http://127.0.0.1…` / `http://localhost…`（沙盒只放 127.0.0.1:8765）；
  // 别的地址走原来的 fetch。`127.0.0.2:1` 不是这两个前缀、也没有服务在听，
  // 所以这条断言的是「没走代理分支」+「fetch 连不上」。
  const vault = await makeVault();
  const proxy = await startProxy();
  try {
    await writeCard(vault, "remote/a.md", `TARGET DECK\nMME\n\n${BLOCK("问", "答")}\n`);
    const stderr = await syncWithEnv(
      ["push", vault, "--url", "http://127.0.0.2:1", "--json"],
      { HTTP_PROXY: `http://127.0.0.1:${proxy.port}` },
      { expectFail: true },
    );
    assert.match(stderr, /连不上 Anki/);
    assert.deepEqual(proxy.seen, [], "外网目标不该走本机代理分支");
  } finally {
    await proxy.close();
    await rm(vault, { recursive: true, force: true });
  }
});
