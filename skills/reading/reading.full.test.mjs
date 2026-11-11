#!/usr/bin/env node
// 全量测试 B5：bookshelf.mjs + reading-queue.mjs 端到端。
// 只通过 CLI（node <script> … --json）驱动，不 import 内部函数；断言只看不变量。
// 全部在 os.tmpdir() 下的临时库；需要真库副本的用例先只把库的 wiki/ 复制到临时目录再跑
//（raw/ 700MB+、.git/.jj 都用不上，整库复制会拖慢 npm test），
// 绝不写 /tmp/xg-e2e/vault/GJY 本身。
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
const SHELF = join(HERE, "bookshelf.mjs");
const QUEUE = join(HERE, "reading-queue.mjs");
// 有库副本的机器上的真实库（复制源，不写）。
const LIBRARY = "/tmp/xg-e2e/vault/GJY";

// ---- 公共工具 ----

async function makeVault() {
  const dir = await mkdtemp(join(tmpdir(), "reading-full-"));
  await mkdir(join(dir, "wiki"), { recursive: true });
  return dir;
}

// 带 0555 目录的副本也能删掉。
async function removeDir(dir) {
  try {
    await run("chmod", ["-R", "u+w", dir]);
  } catch {
    // 目录已不存在时忽略。
  }
  await rm(dir, { recursive: true, force: true });
}

async function call(script, args, { expectFail = false } = {}) {
  try {
    const { stdout } = await run("node", [script, ...args], { encoding: "utf8" });
    if (expectFail) assert.fail(`期望失败但成功：${args.join(" ")}\n${stdout}`);
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    if (!expectFail) throw error;
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

const b = (args, opts) => call(SHELF, args, opts);
const q = (args, opts) => call(QUEUE, args, opts);

async function jsonB(args) {
  const { stdout } = await b([...args, "--json"]);
  return JSON.parse(stdout);
}


async function jsonQ(args) {
  const { stdout } = await q([...args, "--json"]);
  return JSON.parse(stdout);
}

// 写一本测试用书：frontmatter 字段用对象给，正文按行给。
async function writeBook(vault, slug, fields, bodyLines) {
  const fm = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  const text = ["---", ...fm, "---", "", ...bodyLines, ""].join("\n");
  const file = join(vault, "wiki", "shelf", `${slug}.md`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
  return file;
}

const readBook = (vault, slug) => readFile(join(vault, "wiki", "shelf", `${slug}.md`), "utf8");
const readIndex = (vault) => readFile(join(vault, "wiki", "shelf", "index.md"), "utf8");

function addDays(date, n) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

const isDate = (text) => /^\d{4}-\d{2}-\d{2}$/.test(String(text));

// 计划内两本：a 在读（2 段，position 1），b 排队（1 段）。
const BOOK_A = {
  fields: {
    kind: "book",
    slot: "planned",
    order: 1,
    status: "reading",
    title: '"Alpha"',
    short: '"A"',
    started: "2026-11-09",
    position: 1,
  },
  body: ["# Alpha", "", "## 分段", "1. Ch1 pp.1–20", "", "## 读书记录"],
};
const BOOK_B = {
  fields: {
    kind: "book",
    slot: "planned",
    order: 2,
    status: "queued",
    title: '"Beta"',
    short: '"B"',
    started: '""',
    position: 0,
  },
  body: ["# Beta", "", "## 分段", "1. Ch1 pp.1–10", "", "## 读书记录"],
};

// ---- 1. 书房为空 ----

test("空书房（没有 wiki/shelf）：list / today / index 都不崩，today 返回 planned null", async (t) => {
  const vault = await makeVault();
  t.after(() => removeDir(vault));

  assert.deepEqual(await jsonB(["list", vault, "--today", "2026-11-11"]), []);
  assert.deepEqual(await jsonB(["today", vault, "--today", "2026-11-11"]), {
    planned: null,
    free: null,
  });

  const index = await jsonB(["index", vault, "--today", "2026-11-11"]);
  assert.match(index.text, /^# 书房$/m);
  for (const heading of ["## 在读", "## 排队", "## 读完"]) {
    assert.ok(index.text.includes(heading), `index 文本应含 ${heading}`);
  }

  // --write 会建 wiki/shelf/index.md，且只含三组空标题。
  await b(["index", vault, "--today", "2026-11-11", "--write"]);
  const text = await readIndex(vault);
  assert.match(text, /^# 书房$/m);
  assert.ok(!/^- /m.test(text), "空书房不应有任何书目行");
});

test("空书房（只有 index.md）：list 为空、today planned null、index 不崩", async (t) => {
  const vault = await makeVault();
  t.after(() => removeDir(vault));
  await mkdir(join(vault, "wiki", "shelf"), { recursive: true });
  await writeFile(join(vault, "wiki", "shelf", "index.md"), "# 书房\n", "utf8");

  assert.deepEqual(await jsonB(["list", vault, "--today", "2026-11-11"]), []);
  assert.deepEqual(await jsonB(["today", vault, "--today", "2026-11-11"]), {
    planned: null,
    free: null,
  });
  const index = await jsonB(["index", vault, "--today", "2026-11-11"]);
  assert.match(index.text, /^# 书房$/m);

  // index --write 用生成内容覆盖手写的 index.md。
  await b(["index", vault, "--today", "2026-11-11", "--write"]);
  assert.match(await readIndex(vault), /^## 读完$/m);
});

// ---- 2. 计划内两本：今天只给在读那本；读完自动换下一本 ----

test("计划内两本：today 只给在读那本；读完自动开排队那本并同步 index.md", async (t) => {
  const vault = await makeVault();
  t.after(() => removeDir(vault));
  await writeBook(vault, "a", BOOK_A.fields, BOOK_A.body);
  await writeBook(vault, "b", BOOK_B.fields, BOOK_B.body);
  const today = "2026-11-11";

  const before = await jsonB(["today", vault, "--today", today]);
  assert.equal(before.planned.slug, "a", "今天应只有在读的 a");
  assert.equal(before.planned.position, 1);
  assert.deepEqual(
    [before.planned.chunk.index, before.planned.chunk.from, before.planned.chunk.to],
    [2, 11, 20],
  );
  assert.equal(before.free, null);

  const listBefore = await jsonB(["list", vault, "--today", today]);
  const byslug = Object.fromEntries(listBefore.map((item) => [item.slug, item]));
  assert.equal(byslug.a.status, "reading");
  assert.equal(byslug.b.status, "queued");
  // 排队书的预计读完日跟在读那本之后（串接），不与在读的书重叠。
  assert.ok(byslug.b.end > byslug.a.end, `b.end(${byslug.b.end}) 应晚于 a.end(${byslug.a.end})`);

  // 读完 a 的最后一段 → a 变 done，b 变 reading（明天起读），index.md 同步。
  const done = await jsonB(["done", vault, "a", "--today", today]);
  assert.deepEqual(
    { position: done.position, total: done.total, finished: done.finished, next: done.next },
    { position: 2, total: 2, finished: true, next: "b" },
  );

  const pageA = await readBook(vault, "a");
  assert.match(pageA, /^status: done$/m);
  assert.match(pageA, /^position: 2$/m);

  const pageB = await readBook(vault, "b");
  assert.match(pageB, /^status: reading$/m);
  assert.match(pageB, new RegExp(`^started: ${addDays(today, 1)}$`, "m"));
  assert.match(pageB, /^position: 0$/m);
  assert.match(pageB, /xuegen:shelf:start/, "开读时应写入它的排期表");

  const index = await readIndex(vault);
  const reading = index.split("## 在读")[1].split("## 排队")[0];
  const finished = index.split("## 读完")[1];
  assert.match(reading, /\[\[shelf\/b\|B\]\]/);
  assert.match(finished, /\[\[shelf\/a\|A\]\]/);
  assert.match(finished, new RegExp(`${today} 读完`));

  const tomorrow = await jsonB(["today", vault, "--today", addDays(today, 1)]);
  assert.equal(tomorrow.planned.slug, "b");
  assert.equal(tomorrow.planned.position, 0);
});

// ---- 3. done 同一天连点两次 ----

test("done 同一天连点两次：第二次报『今天这段已记过』，不前进", async (t) => {
  const vault = await makeVault();
  t.after(() => removeDir(vault));
  await writeBook(
    vault,
    "solo",
    {
      kind: "book",
      slot: "planned",
      order: 1,
      status: "reading",
      title: '"Solo"',
      short: '"S"',
      started: "2026-11-09",
      position: 0,
    },
    ["# Solo", "", "## 分段", "1. Ch1 pp.1–40", "", "## 读书记录"],
  );
  const today = "2026-11-11";

  const first = await jsonB(["done", vault, "solo", "--today", today]);
  assert.deepEqual([first.position, first.finished], [1, false]);
  const afterFirst = await readBook(vault, "solo");

  const second = await b(["done", vault, "solo", "--today", today], { expectFail: true });
  assert.notEqual(second.code, 0, "第二次 done 应失败");
  assert.match(second.stderr, /今天这段已记过/, `stderr 应提示今天已记过：${second.stderr}`);
  assert.equal(await readBook(vault, "solo"), afterFirst, "第二次 done 不应改动书页");

  // 第二天再记 → 正常前进到第 2 段
  const next = await jsonB(["done", vault, "solo", "--today", addDays(today, 1)]);
  assert.deepEqual([next.position, next.finished], [2, false]);
  assert.match(await readBook(vault, "solo"), /^position: 2$/m);
});

// ---- 4. 核心页与今天这段的重叠 ----

// 两段 20 页的书骨架：position 1 表示已读完第一段（pp.1–10），今天该读 pp.11–20。
function outOfChunkBook(slug) {
  return {
    fields: {
      kind: "book",
      slot: "planned",
      order: 1,
      status: "reading",
      title: `"${slug}"`,
      short: `"${slug}"`,
      started: "2026-11-09",
      position: 1,
    },
    body: [
      `# ${slug}`,
      "",
      "## 分段",
      "1. Ch1 pp.1–20",
      "",
      "## 核心页已读",
      "",
      "- pp.1–10 · discrete-math-epp · §1.1 · 2026-11-08",
      "",
      "## 读书记录",
      "- 2026-11-10: 第 1 段 pp.1–10 读完（用户自报）",
    ],
  };
}

test("today.coreOverlap：核心页与今天这段有交集时列出交集，页在段外的不算", async (t) => {
  const vault = await makeVault();
  t.after(() => removeDir(vault));
  // 今天这段是 pp.11–20；核心页 12–21 与之交集 12–20，30 在段外不出现。
  await writeBook(
    vault,
    "hit",
    {
      kind: "book",
      slot: "planned",
      order: 1,
      status: "reading",
      title: '"Overlap"',
      short: '"O"',
      started: "2026-11-09",
      position: 1,
    },
    [
      "# Overlap",
      "",
      "## 分段",
      "1. Ch1 pp.1–20",
      "",
      "## 核心页已读",
      "",
      "- pp.1–5、12–21、30 · discrete-math-epp · §1.2 · 2026-11-10",
      "",
      "## 读书记录",
      "- 2026-11-10: 第 1 段 pp.1–10 读完（用户自报）",
    ],
  );
  const view = await jsonB(["today", vault, "--today", "2026-11-11"]);
  assert.equal(view.planned.slug, "hit");
  assert.deepEqual([view.planned.chunk.from, view.planned.chunk.to], [11, 20]);
  assert.equal(view.planned.coreOverlap, "pp.12–20");
});

test("today.coreOverlap：核心页全在已读的上一段时为 null", async (t) => {
  const vault = await makeVault();
  t.after(() => removeDir(vault));
  const book = outOfChunkBook("miss");
  await writeBook(vault, "miss", book.fields, book.body);
  const view = await jsonB(["today", vault, "--today", "2026-11-11"]);
  assert.equal(view.planned.slug, "miss");
  assert.deepEqual([view.planned.chunk.from, view.planned.chunk.to], [11, 20]);
  assert.equal(view.planned.coreOverlap, null, "核心页 1–10 不在今天这段 11–20 里");
});

test("today.coreOverlap：读完全部分段后 chunk 与 coreOverlap 都是 null", async (t) => {
  const vault = await makeVault();
  t.after(() => removeDir(vault));
  const book = outOfChunkBook("finished");
  await writeBook(vault, "finished", book.fields, book.body);
  // position 1 → done 一次到 2/2，读完；计划内没有别的书，today 没有在读的书。
  const done = await jsonB(["done", vault, "finished", "--today", "2026-11-11"]);
  assert.deepEqual([done.position, done.total, done.finished], [2, 2, true]);
  assert.deepEqual(await jsonB(["today", vault, "--today", "2026-11-11"]), {
    planned: null,
    free: null,
  });
  const list = await jsonB(["list", vault, "--today", "2026-11-11"]);
  assert.equal(list[0].status, "done");
  assert.deepEqual(list[0].upcoming, []);
});

test("today.coreOverlap：核心页比今天这块更晚（pp.15–18 vs 1–10）时为 null", async (t) => {
  const vault = await makeVault();
  t.after(() => removeDir(vault));
  await writeBook(
    vault,
    "late",
    {
      kind: "book",
      slot: "planned",
      order: 1,
      status: "reading",
      title: '"Late"',
      short: '"L"',
      started: "2026-11-09",
      position: 0,
    },
    [
      "# Late",
      "",
      "## 分段",
      "1. Ch1 pp.1–20",
      "",
      "## 核心页已读",
      "",
      "- pp.15–18 · discrete-math-epp · §1.3 · 2026-11-10",
      "",
      "## 读书记录",
    ],
  );
  const view = await jsonB(["today", vault, "--today", "2026-11-11"]);
  assert.deepEqual([view.planned.chunk.from, view.planned.chunk.to], [1, 10], "第一块是 pp.1–10");
  assert.equal(view.planned.coreOverlap, null, "15–18 不在今天这块里");
});

// ---- 5. plan --write：过去起始、读过几段后重排 ----

test("plan --write：已读段日期不动、未读段从今天起每天一段、预计读完日 = 最后一段日期", async (t) => {
  const vault = await makeVault();
  t.after(() => removeDir(vault));
  await writeBook(
    vault,
    "replan",
    {
      kind: "book",
      slot: "planned",
      order: 1,
      status: "reading",
      title: '"Replan"',
      short: '"R"',
      started: "2026-11-01",
      position: 2,
    },
    [
      "# Replan",
      "",
      "## 分段",
      "1. Ch1 pp.1–40",
      "",
      "## 读书记录",
      "- 2026-11-01: 第 1 段 pp.1–10 读完（用户自报）",
      "- 2026-11-03: 第 2 段 pp.11–20 读完（用户自报）",
    ],
  );
  const today = "2026-11-11";

  const plan = await jsonB(["plan", vault, "replan", "--today", today, "--write"]);
  assert.equal(plan.wrote, true);
  assert.equal(plan.rows.length, 4, "40 页切 4 块");
  assert.deepEqual(
    plan.rows.map((row) => row.date),
    ["2026-11-01", "2026-11-03", "2026-11-11", "2026-11-12"],
    "已读两段按记录日期，未读两段从今天起每天一段",
  );
  // 预计读完日 = 最后一段日期。
  const list = await jsonB(["list", vault, "--today", today]);
  assert.equal(list[0].end, plan.rows[plan.rows.length - 1].date);

  // 写进文件：标记之间的表格与 rows 一致，读书记录没被动。
  const page = await readBook(vault, "replan");
  const table = page.split("<!-- xuegen:shelf:start -->")[1].split("<!-- xuegen:shelf:end -->")[0];
  for (const row of plan.rows) {
    assert.match(table, new RegExp(`\\| ${row.index} \\| ${row.date} \\|`));
  }
  assert.match(page, /- 2026-11-01: 第 1 段/);
  assert.match(page, /- 2026-11-03: 第 2 段/);

  // 同一天再跑一次是幂等的。
  const again = await jsonB(["plan", vault, "replan", "--today", today, "--write"]);
  assert.deepEqual(again.rows, plan.rows);
  assert.equal(await readBook(vault, "replan"), page);

  // 前后各推进一天地「今天」：未读段跟着顺延，已读段仍不动。
  const later = await jsonB(["plan", vault, "replan", "--today", "2026-11-20"]);
  assert.deepEqual(
    later.rows.map((row) => row.date),
    ["2026-11-01", "2026-11-03", "2026-11-20", "2026-11-21"],
  );
});

// ---- 6. reading-queue 全流程 ----

test("reading-queue：add 报错 / today / review 三种结果 / note / pause-resume / verify", async (t) => {
  const vault = await makeVault();
  t.after(() => removeDir(vault));
  await mkdir(join(vault, "raw"), { recursive: true });
  await mkdir(join(vault, "clippings"), { recursive: true });
  await writeFile(join(vault, "raw", "a1.md"), "# 文章一\n\n正文。\n", "utf8");

  // 相对路径不存在 → 报错，且不生成阅读页。
  const missing = await q(["add", vault, "raw/missing.md"], { expectFail: true });
  assert.match(missing.stderr, /原文不存在/);
  assert.ok(!existsSync(join(vault, "wiki", "reading", "missing.md")));

  const added = await jsonQ(["add", vault, "raw/a1.md", "--priority", "high", "--today", "2026-11-11"]);
  assert.deepEqual(
    [added.slug, added.status, added.due],
    ["a1", "queued", "2026-11-11"],
  );

  const today = await jsonQ(["today", vault, "--today", "2026-11-11"]);
  assert.deepEqual(today.map((item) => item.slug), ["a1"]);

  // next：high 间隔 ×1.5 → 2 天。
  const next = await jsonQ(["review", vault, "a1", "--outcome", "next", "--today", "2026-11-11"]);
  assert.deepEqual([next.status, next.due], ["active", "2026-11-13"]);

  // postpone：间隔不变（2 天）。
  const postpone = await jsonQ(["review", vault, "a1", "--outcome", "postpone", "--today", "2026-11-12"]);
  assert.deepEqual([postpone.outcome, postpone.due], ["postpone", "2026-11-14"]);

  const note = await jsonQ(["note", vault, "a1", "--text", "读了两节", "--today", "2026-11-12"]);
  assert.equal(note.text, "读了两节");

  // pause 后不在 today 里；resume 回到 active 且 due = 今天。
  const paused = await jsonQ(["pause", vault, "a1", "--today", "2026-11-12"]);
  assert.equal(paused.status, "paused");
  assert.deepEqual(await jsonQ(["today", vault, "--today", "2026-11-14"]), []);
  const resumed = await jsonQ(["resume", vault, "a1", "--today", "2026-11-13"]);
  assert.equal(resumed.status, "active");
  const afterResume = await jsonQ(["today", vault, "--today", "2026-11-13"]);
  assert.deepEqual(afterResume.map((item) => item.slug), ["a1"]);
  assert.equal(afterResume[0].due, "2026-11-13");

  assert.equal((await jsonQ(["verify", vault])).ok, true);

  // done：清空 due，退出队列；verify 仍通过（done + 空 due）。
  const done = await jsonQ(["review", vault, "a1", "--outcome", "done", "--today", "2026-11-14"]);
  assert.deepEqual([done.status, done.due], ["done", ""]);
  assert.deepEqual(await jsonQ(["today", vault, "--today", "2026-11-14"]), []);
  assert.deepEqual(await jsonQ(["list", vault, "--today", "2026-11-14"]), []);
  assert.equal((await jsonQ(["verify", vault])).ok, true);

  // Reading Log 记全了每一步。
  const page = await readFile(join(vault, "wiki", "reading", "a1.md"), "utf8");
  for (const line of [
    "- 2026-11-11: next",
    "- 2026-11-12: postpone",
    "- 2026-11-12: 读了两节",
    "- 2026-11-12: paused",
    "- 2026-11-13: resumed",
    "- 2026-11-14: done",
  ]) {
    assert.ok(page.includes(line), `Reading Log 应含「${line}」`);
  }
  // verify 之后没有残留临时文件。
  assert.ok(!existsSync(join(vault, "wiki", "reading", "a1.md.tmp")));
});

test("reading-queue：队列为空时各命令不崩", async (t) => {
  const vault = await makeVault();
  t.after(() => removeDir(vault));

  assert.deepEqual(await jsonQ(["today", vault, "--today", "2026-11-11"]), []);
  assert.deepEqual(await jsonQ(["list", vault, "--today", "2026-11-11"]), []);
  assert.deepEqual(await jsonQ(["stats", vault, "--today", "2026-11-11"]), {
    reading: { queued: 0, active: 0, paused: 0, done: 0 },
    dueToday: 0,
    overdue: 0,
    reviewsLast7: 0,
    cardsPending: 0,
  });
  assert.deepEqual(await jsonQ(["verify", vault]), { ok: true, count: 0 });

  // 对不存在的条目：报错退出，不崩栈。
  for (const args of [
    ["review", vault, "nope", "--outcome", "next"],
    ["note", vault, "nope", "--text", "x"],
    ["pause", vault, "nope"],
    ["resume", vault, "nope"],
  ]) {
    const res = await q(args, { expectFail: true });
    assert.match(res.stderr, /阅读页不存在/);
    assert.ok(!/at .*\(node:/.test(res.stderr), `不应打印栈：${args.join(" ")}`);
  }
});

// ---- 7. 库副本冒烟（只在有库副本的机器上跑） ----

test(
  "库副本冒烟：bookshelf list/today、reading-queue verify 在副本上正常",
  { skip: existsSync(LIBRARY) ? false : `${LIBRARY} 不存在（需要有库副本的机器）` },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "reading-full-vault-"));
    t.after(() => removeDir(dir));
    const vault = join(dir, "GJY");
    // 只复制 wiki/（bookshelf 与 reading-queue 只读 wiki/；raw/ 是 PDF，用不上）。
    // 复制后放开权限（库里有 0555/0444 的目录与文件）；只写副本。
    await mkdir(vault, { recursive: true });
    await run("cp", ["-Rc", join(LIBRARY, "wiki"), join(vault, "wiki")]).catch(() =>
      run("cp", ["-R", join(LIBRARY, "wiki"), join(vault, "wiki")]),
    );
    await run("chmod", ["-R", "u+w", vault]);

    const list = await jsonB(["list", vault, "--today", "2026-11-11"]);
    assert.ok(Array.isArray(list), "list 应返回数组");
    for (const item of list) {
      assert.equal(typeof item.slug, "string");
      assert.ok(["queued", "reading", "done"].includes(item.status), `status 非法：${item.status}`);
      assert.ok(Number.isInteger(item.total) && item.total >= 0, `total 非法：${item.total}`);
      assert.ok(
        Number.isInteger(item.position) && item.position >= 0 && item.position <= item.total,
        `position 越界：${item.position}/${item.total}`,
      );
      assert.ok(isDate(item.end), `end 不是日期：${item.end}`);
    }

    // 今天（2026-11-11）与远期（2027-02-01）：都只给在读那本，位置与当天的段一致。
    const near = await jsonB(["today", vault, "--today", "2026-11-11"]);
    const far = await jsonB(["today", vault, "--today", "2027-02-01"]);
    for (const [label, view] of [["2026-11-11", near], ["2027-02-01", far]]) {
      assert.ok(view.planned === null || typeof view.planned === "object", `${label}: planned 类型`);
      assert.ok(view.free === null || typeof view.free === "object", `${label}: free 类型`);
    }
    if (near.planned !== null) {
      const reading = list.filter((item) => item.slot === "planned" && item.status === "reading");
      assert.equal(reading.length, 1, "库副本里计划内只有一本在读");
      assert.equal(near.planned.slug, reading[0].slug, "today 给的应是在读那本");
      assert.equal(near.planned.position, reading[0].position);
      if (near.planned.chunk !== null) {
        assert.equal(near.planned.chunk.index, near.planned.position + 1);
      }
      // 日期不影响「下一段」：远期问同一本，chunk 与位置不变。
      assert.equal(far.planned.slug, near.planned.slug);
      assert.equal(far.planned.position, near.planned.position);
      assert.deepEqual(far.planned.chunk, near.planned.chunk);
      assert.ok(far.planned.end >= near.planned.end, "同一段越晚问，预计读完日不会更早");
    }

    const verify = await q(["verify", vault]);
    assert.equal(verify.code, 0, `verify 在库副本上应通过：${verify.stderr}`);
  },
);
