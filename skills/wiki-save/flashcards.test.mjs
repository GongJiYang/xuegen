#!/usr/bin/env node
// flashcards.mjs 的测试：node:test + node:assert，无第三方依赖。
// 每个测试在 os.tmpdir() 下建临时 Wiki，构造已同步/未同步/多牌组/示例块干扰，不触碰真实库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "flashcards.mjs");

async function makeVault() {
  const dir = await mkdtemp(join(tmpdir(), "flashcards-test-"));
  await mkdir(join(dir, "wiki"), { recursive: true });
  return dir;
}

async function fc(args, { expectFail = false } = {}) {
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], { encoding: "utf8" });
    if (expectFail) assert.fail(`期望失败但成功：${args.join(" ")}\n${stdout}`);
    return stdout;
  } catch (error) {
    if (!expectFail) throw error;
    return error.stderr ?? "";
  }
}

async function jsonFc(args) {
  return JSON.parse(await fc([...args, "--json"]));
}

async function writeCard(vault, rel, text) {
  const file = join(vault, "wiki", "flashcards", rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
  return file;
}

const SYNCED_BLOCK = ["START", "Basic", "问题？", "Back: 答案", "<!--ID: 123456-->", "END"].join("\n");
const UNSYNCED_BLOCK = ["START", "Basic", "问题？", "Back: 答案", "END"].join("\n");
const ID_AFTER_BLOCK = ["START", "Basic", "问题？", "Back: 答案", "END", "<!--ID: 999999-->"].join("\n");

test("stats：块内 ID 视为已同步，无 ID 视为未同步", async () => {
  const vault = await makeVault();
  await writeCard(vault, "math/a.md", `TARGET DECK\nMath\n\n${SYNCED_BLOCK}\n\n${UNSYNCED_BLOCK}\n`);
  const res = await jsonFc(["stats", vault]);
  assert.equal(res.total, 2);
  assert.equal(res.unsynced, 1);
  assert.deepEqual(res.decks, [{ deck: "Math", total: 2, unsynced: 1, files: ["wiki/flashcards/math/a.md"] }]);
  await rm(vault, { recursive: true, force: true });
});

test("stats：ID 紧随 END 之后（隔空行）也算已同步", async () => {
  const vault = await makeVault();
  await writeCard(vault, "x/a.md", `TARGET DECK\nX\n\n${ID_AFTER_BLOCK}\n`);
  const res = await jsonFc(["stats", vault]);
  assert.equal(res.total, 1);
  assert.equal(res.unsynced, 0);
  await rm(vault, { recursive: true, force: true });
});

test("stats：多牌组分别统计，牌组取最近 TARGET DECK", async () => {
  const vault = await makeVault();
  await writeCard(vault, "link/a.md", `TARGET DECK\nLink\n\n${SYNCED_BLOCK}\n`);
  await writeCard(vault, "math/a.md", `TARGET DECK\nMath\n\n${SYNCED_BLOCK}\n${UNSYNCED_BLOCK}\n`);
  const res = await jsonFc(["stats", vault]);
  assert.equal(res.total, 3);
  assert.deepEqual(
    res.decks.map((d) => d.deck),
    ["Link", "Math"],
  );
  assert.deepEqual(res.decks.find((d) => d.deck === "Math"), {
    deck: "Math",
    total: 2,
    unsynced: 1,
    files: ["wiki/flashcards/math/a.md"],
  });
  await rm(vault, { recursive: true, force: true });
});

test("stats：不扫描 wiki/prompts/ 与库根 AGENTS.md 里的示例块", async () => {
  const vault = await makeVault();
  await mkdir(join(vault, "wiki", "prompts", "wiki"), { recursive: true });
  await writeFile(
    join(vault, "wiki", "prompts", "wiki", "flashcard-rules.md"),
    `示例：\n\n\`\`\`\nSTART\nBasic\n示例问题？\nBack: 示例答案\nEND\n\`\`\`\n`,
    "utf8",
  );
  await writeFile(join(vault, "AGENTS.md"), `START\nBasic\n根目录示例？\nBack: x\nEND\n`, "utf8");
  await writeCard(vault, "real/a.md", `TARGET DECK\nReal\n\n${SYNCED_BLOCK}\n`);
  const res = await jsonFc(["stats", vault]);
  assert.equal(res.total, 1, "只应统计 wiki/flashcards/ 下的卡片");
  assert.equal(res.decks[0].deck, "Real");
  await rm(vault, { recursive: true, force: true });
});

test("stats：pendingExtracts 统计 cards: pending 的摘录", async () => {
  const vault = await makeVault();
  const dir = join(vault, "wiki", "extracts", "src");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "e1.md"), "---\ncards: pending\n---\n\n# E1\n", "utf8");
  await writeFile(join(dir, "e2.md"), "---\ncards: done\n---\n\n# E2\n", "utf8");
  await writeFile(join(dir, "e3.md"), "---\ncards: pending\n---\n\n# E3\n", "utf8");
  const res = await jsonFc(["stats", vault]);
  assert.equal(res.pendingExtracts, 2);
  await rm(vault, { recursive: true, force: true });
});

test("stats：空库返回全零", async () => {
  const vault = await makeVault();
  const res = await jsonFc(["stats", vault]);
  assert.deepEqual(res, { total: 0, unsynced: 0, decks: [], pendingExtracts: 0 });
  await rm(vault, { recursive: true, force: true });
});

test("add：已有牌组写入其目录下的 inbox.md", async () => {
  const vault = await makeVault();
  const existing = await writeCard(vault, "mme/a.md", `TARGET DECK\nMME\n\n${SYNCED_BLOCK}\n`);
  const res = await jsonFc(["add", vault, "--deck", "MME", "--front", "新问题？", "--back", "新答案"]);
  const inbox = join(dirname(existing), "inbox.md");
  assert.equal(res.file, inbox);
  assert.equal(res.deck, "MME");
  const text = await readFile(inbox, "utf8");
  assert.match(text, /^TARGET DECK\nMME$/m);
  assert.match(text, /START\nBasic\n新问题？\nBack: 新答案\nEND/);
  await rm(vault, { recursive: true, force: true });
});

test("add：新牌组各自建目录，不同新牌组不会落进同一个文件", async () => {
  const vault = await makeVault();
  const foo = await jsonFc(["add", vault, "--deck", "Foo", "--front", "F", "--back", "B"]);
  const bar = await jsonFc(["add", vault, "--deck", "Math::Bar 2", "--front", "F2", "--back", "B2"]);
  assert.equal(foo.file, join(vault, "wiki", "flashcards", "Foo", "inbox.md"));
  assert.equal(bar.file, join(vault, "wiki", "flashcards", "Math-Bar-2", "inbox.md"));
  assert.match(await readFile(foo.file, "utf8"), /TARGET DECK\nFoo\n/);
  assert.match(await readFile(bar.file, "utf8"), /TARGET DECK\nMath::Bar 2\n/);
  await rm(vault, { recursive: true, force: true });
});

test("add：同一目录里有两个牌组时，各自用自己的收件箱", async () => {
  const vault = await makeVault();
  await writeCard(vault, "link/a.md", `TARGET DECK\nLink\n\n${SYNCED_BLOCK}\n`);
  await writeCard(vault, "link/b.md", `TARGET DECK\nLink::符号处理\n\n${SYNCED_BLOCK}\n`);
  const link = await jsonFc(["add", vault, "--deck", "Link", "--front", "L", "--back", "1"]);
  const sym = await jsonFc(["add", vault, "--deck", "Link::符号处理", "--front", "S", "--back", "2"]);
  assert.equal(link.file, join(vault, "wiki", "flashcards", "link", "inbox.md"));
  assert.equal(sym.file, join(vault, "wiki", "flashcards", "link", "inbox-Link-符号处理.md"));
  assert.match(await readFile(sym.file, "utf8"), /TARGET DECK\nLink::符号处理\n/);
  assert.doesNotMatch(await readFile(link.file, "utf8"), /符号处理/);
  await rm(vault, { recursive: true, force: true });
});

test("add：牌组名里的路径字符不会写出 flashcards 目录", async () => {
  const vault = await makeVault();
  const res = await jsonFc(["add", vault, "--deck", "../../evil", "--front", "F", "--back", "B"]);
  assert.ok(res.file.startsWith(join(vault, "wiki", "flashcards") + "/"));
  await rm(vault, { recursive: true, force: true });
});

test("add：追加到已有 inbox 之后，保留原内容", async () => {
  const vault = await makeVault();
  await writeCard(vault, "mme/a.md", `TARGET DECK\nMME\n\n${SYNCED_BLOCK}\n`);
  await fc(["add", vault, "--deck", "MME", "--front", "第一张", "--back", "A1"]);
  await fc(["add", vault, "--deck", "MME", "--front", "第二张", "--back", "A2"]);
  const text = await readFile(join(vault, "wiki", "flashcards", "mme", "inbox.md"), "utf8");
  assert.match(text, /第一张/);
  assert.match(text, /第二张/);
  assert.equal((text.match(/^START$/gm) || []).length, 2);
  await rm(vault, { recursive: true, force: true });
});

test("add：拒绝空正反面与独立成行的 END", async () => {
  const vault = await makeVault();
  assert.match(
    await fc(["add", vault, "--deck", "D", "--front", "  ", "--back", "B"], { expectFail: true }),
    /正面.*不能为空/,
  );
  assert.match(
    await fc(["add", vault, "--deck", "D", "--front", "F", "--back", ""], { expectFail: true }),
    /背面.*不能为空/,
  );
  assert.match(
    await fc(["add", vault, "--deck", "D", "--front", "F", "--back", "含\nEND\n内容"], { expectFail: true }),
    /不能包含独立成行的 END/,
  );
  assert.ok(!existsSync(join(vault, "wiki", "flashcards", "inbox.md")), "失败时不应留下文件");
  await rm(vault, { recursive: true, force: true });
});

test("add：非库根目录拒绝", async () => {
  const dir = await mkdtemp(join(tmpdir(), "flashcards-test-"));
  const err = await fc(["add", dir, "--deck", "D", "--front", "F", "--back", "B"], { expectFail: true });
  assert.match(err, /不是 Wiki 库根目录/);
  await rm(dir, { recursive: true, force: true });
});

test("原子写入：inbox 无残留临时文件", async () => {
  const vault = await makeVault();
  await fc(["add", vault, "--deck", "D", "--front", "F", "--back", "B"]);
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(join(vault, "wiki", "flashcards"));
  assert.ok(entries.every((name) => !name.includes(".tmp-")), `残留：${entries}`);
  await rm(vault, { recursive: true, force: true });
});
