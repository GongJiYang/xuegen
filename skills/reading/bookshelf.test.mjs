#!/usr/bin/env node
// bookshelf.mjs 的测试：使用 node:test + node:assert，无第三方依赖。
// 每个测试在 os.tmpdir() 下建临时 Wiki，不触碰真实库。
import { test, skip } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import {
  bookView,
  chunksOf,
  formatPageList,
  parseCoreRead,
  parseExtracts,
  parsePageList,
  parseSegments,
  queueEnds,
} from "./bookshelf.mjs";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "bookshelf.mjs");

// 真实库布局：<vault>/{raw,wiki}，其中 wiki/ 必须预先存在；wiki/shelf/ 由书页创建。
async function makeVault() {
  const dir = await mkdtemp(join(tmpdir(), "bookshelf-test-"));
  await mkdir(join(dir, "wiki"), { recursive: true });
  return dir;
}

// expectFail: true 时命令必须非零退出。成功 / 失败的判断放在 try 外面——`assert.fail`
// 写在 try 里会被同一个 catch 吞掉，命令成功时也当成「失败了」返回，测试就空转。
// env 透传给子进程（jj 用例要设 JJ_CONFIG 才能提交）。
async function b(args, { expectFail = false, env = {} } = {}) {
  let result;
  try {
    const { stdout } = await run("node", [SCRIPT, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    result = { ok: true, code: 0, stdout };
  } catch (error) {
    result = { ok: false, code: error.code ?? 1, stderr: error.stderr ?? "", stdout: error.stdout ?? "" };
  }
  const margin = result.ok ? result.stdout : result.stderr;
  if (expectFail && result.ok) assert.fail(`期望失败但成功：${args.join(" ")}\n${margin}`);
  if (!expectFail && !result.ok) assert.fail(`期望成功却失败：${args.join(" ")}\n${margin}`);
  return result;
}

async function jsonB(args, opts = {}) {
  const { stdout } = await b([...args, "--json"], opts);
  return JSON.parse(stdout);
}

// 写一本测试用书：frontmatter 字段用对象给，正文用字符串给。
async function writeBook(vault, slug, fields, body) {
  const file = join(vault, "wiki", "shelf", `${slug}.md`);
  await mkdir(dirname(file), { recursive: true });
  const fm = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  const text = ["---", ...fm, "---", "", body].join("\n");
  await writeFile(file, `${text}${text.endsWith("\n") ? "" : "\n"}`, "utf8");
  return file;
}

async function readBook(vault, slug) {
  return readFile(join(vault, "wiki", "shelf", `${slug}.md`), "utf8");
}

// 常用书页正文：两个分段，共 7 块（36 页 → 4 块，29 页 → 3 块）。
const EPP_BODY = "# Epp\n\n## 分段\n1. Ch1 pp.1–36\n2. Ch2 pp.37–65\n\n## 读书记录\n";

const EPP_FIELDS = {
  kind: "book",
  slot: "planned",
  order: 1,
  status: "reading",
  title: '"Discrete Mathematics with Applications"',
  short: '"Epp"',
  started: "2026-11-09",
  position: 0,
};

// ---- 纯函数：切块与分段解析 ----

test("chunksOf：36 页切成 4 块（9/9/9/9）", () => {
  const chunks = chunksOf([{ title: "Ch1", from: 1, to: 36 }]);
  assert.equal(chunks.length, 4);
  assert.deepEqual(
    chunks.map((chunk) => [chunk.from, chunk.to]),
    [
      [1, 9],
      [10, 18],
      [19, 27],
      [28, 36],
    ],
  );
  assert.deepEqual(
    chunks.map((chunk) => chunk.index),
    [1, 2, 3, 4],
  );
});

test("chunksOf：29 页切成 3 块（10/10/9）", () => {
  const chunks = chunksOf([{ title: "Ch2", from: 37, to: 65 }]);
  assert.deepEqual(
    chunks.map((chunk) => [chunk.from, chunk.to]),
    [
      [37, 46],
      [47, 56],
      [57, 65],
    ],
  );
  assert.equal(chunks.length, 3);
});

test("chunksOf：1 页仍是一块；10 页不切", () => {
  assert.deepEqual(chunksOf([{ title: "S", from: 7, to: 7 }]), [
    { index: 1, title: "S", from: 7, to: 7 },
  ]);
  assert.deepEqual(chunksOf([{ title: "S", from: 1, to: 10 }]).length, 1);
});

test("chunksOf：多个分段的块连续编号，标题随分段", () => {
  const chunks = chunksOf([
    { title: "Ch1", from: 1, to: 36 },
    { title: "Ch2", from: 37, to: 65 },
  ]);
  assert.equal(chunks.length, 7);
  assert.deepEqual(
    chunks.map((chunk) => chunk.index),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(chunks[3].title, "Ch1");
  assert.equal(chunks[4].title, "Ch2");
  // 每块 ≤ 10 页
  for (const chunk of chunks) assert.ok(chunk.to - chunk.from + 1 <= 10, `${chunk.from}-${chunk.to}`);
});

test("parseSegments：接受 – 与 - 两种连接号，忽略坏行", () => {
  const body = [
    "# 书",
    "",
    "## 分段",
    "1. Ch1 §1.1 pp.1–36",
    "2. Ch2 pp.37-65",
    "3. 这行没有页码",
    "Ch3 pp.61–70",
    "4. Ch4 pp.80–70",
    "",
    "## 不读",
    "1. 附录 pp.71–80",
  ];
  assert.deepEqual(parseSegments(body), [
    { title: "Ch1 §1.1", from: 1, to: 36 },
    { title: "Ch2", from: 37, to: 65 },
  ]);
});

test("parseSegments：没有分段一节返回 []", () => {
  assert.deepEqual(parseSegments(["# 书", "", "## 不读", "附录"]), []);
  assert.deepEqual(parseSegments([]), []);
});

test("parseSegments：反向页码（from > to）忽略", () => {
  assert.deepEqual(parseSegments(["## 分段", "1. Ch1 pp.36–1"]), []);
});

// ---- plan ----

test("plan --write：生成排期表，日期从 started 逐日递增", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const result = await jsonB(["plan", vault, "epp", "--today", "2026-11-09", "--write"]);
  assert.equal(result.started, "2026-11-09");
  assert.equal(result.wrote, true);
  assert.deepEqual(
    result.rows.map((row) => [row.index, row.date, row.from, row.to]),
    [
      [1, "2026-11-09", 1, 9],
      [2, "2026-11-10", 10, 18],
      [3, "2026-11-11", 19, 27],
      [4, "2026-11-12", 28, 36],
      [5, "2026-11-13", 37, 46],
      [6, "2026-11-14", 47, 56],
      [7, "2026-11-15", 57, 65],
    ],
  );

  const page = await readBook(vault, "epp");
  assert.match(page, /^## 排期$/m);
  assert.match(page, /^\| 块 \| 日期 \| 读什么 \|$/m);
  assert.match(page, /^\| 1 \| 2026-11-09 \| Ch1 pp\.1–9 \|$/m);
  assert.match(page, /^\| 7 \| 2026-11-15 \| Ch2 pp\.57–65 \|$/m);
  assert.ok(page.indexOf("## 排期") < page.indexOf("## 读书记录"), "排期应在读书记录之前");
  // 原书正文与 `## 分段` 保留
  assert.match(page, /^1\. Ch1 pp\.1–36$/m);
  await rm(vault, { recursive: true, force: true });
});

test("plan --write：再跑一次是替换，不重复插入", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  await b(["plan", vault, "epp", "--write"]);
  const once = await readBook(vault, "epp");
  await b(["plan", vault, "epp", "--write"]);
  const twice = await readBook(vault, "epp");
  assert.equal(twice, once, "第二次 plan 应得到完全相同的文件");
  assert.equal(once.match(/<!-- xuegen:shelf:start -->/g).length, 1);
  assert.equal(once.match(/<!-- xuegen:shelf:end -->/g).length, 1);
  assert.equal(once.match(/^## 排期$/gm).length, 1);
  await rm(vault, { recursive: true, force: true });
});

test("plan：started 为空时用 --today 起算，不带 --write 不写文件", async () => {
  const vault = await makeVault();
  const file = await writeBook(
    vault,
    "free-book",
    { kind: "book", slot: "free", status: "reading", title: '"Free"', short: '"F"', started: '""', position: 0 },
    "# Free\n\n## 分段\n1. S pp.1–1\n",
  );
  const before = await readFile(file, "utf8");
  const result = await jsonB(["plan", vault, "free-book", "--today", "2026-11-20"]);
  assert.equal(result.started, "2026-11-20");
  assert.equal(result.wrote, false);
  assert.equal(result.rows[0].date, "2026-11-20");
  assert.equal(await readFile(file, "utf8"), before, "不带 --write 不应改动书页");
  await rm(vault, { recursive: true, force: true });
});

// ---- today ----

test("today：按时读 late 0；晚一天 late 1", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);

  // started 2026-11-09，7 块：plannedEnd = 11-15
  const onTime = await jsonB(["today", vault, "--today", "2026-11-09"]);
  assert.equal(onTime.planned.plannedEnd, "2026-11-15");
  assert.equal(onTime.planned.end, "2026-11-15");
  assert.equal(onTime.planned.late, 0);
  assert.equal(onTime.planned.position, 0);
  assert.deepEqual(onTime.planned.chunk, { index: 1, title: "Ch1", from: 1, to: 9 });
  assert.equal(onTime.free, null);

  const late = await jsonB(["today", vault, "--today", "2026-11-10"]);
  assert.equal(late.planned.plannedEnd, "2026-11-15");
  assert.equal(late.planned.end, "2026-11-16");
  assert.equal(late.planned.late, 1);
  await rm(vault, { recursive: true, force: true });
});

test("today：读完的书 chunk 为 null，end 取最后一条记录日期", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "short",
    { ...EPP_FIELDS, order: 2, position: 1 },
    "# 短书\n\n## 分段\n1. 全 pp.1–1\n\n## 读书记录\n- 2026-11-12: 第 1 段 pp.1–1 读完（用户自报）\n",
  );
  const result = await jsonB(["today", vault, "--today", "2026-11-20"]);
  // position === total，但 status 仍是 reading（收尾由 done 负责）
  assert.equal(result.planned.chunk, null);
  assert.equal(result.planned.end, "2026-11-12");
  assert.equal(result.planned.total, 1);
  await rm(vault, { recursive: true, force: true });
});

test("today：书房目录不存在时返回 {planned:null, free:null}", async () => {
  const vault = await makeVault();
  assert.deepEqual(await jsonB(["today", vault, "--today", "2026-11-09"]), {
    planned: null,
    free: null,
    guided: [],
  });
  assert.deepEqual(await jsonB(["list", vault]), []);
  await rm(vault, { recursive: true, force: true });
});

test("today：planned 与 free 各取一本在读的书", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  await writeBook(
    vault,
    "free-book",
    { kind: "book", slot: "free", status: "reading", title: '"Free"', short: '"F"', started: "2026-11-09", position: 0 },
    "# Free\n\n## 分段\n1. S pp.1–1\n",
  );
  // 第二本 planned 但还在排队，不应被选中
  await writeBook(
    vault,
    "queued-book",
    { kind: "book", slot: "planned", order: 2, status: "queued", title: '"Q"', short: '"Q"', started: '""', position: 0 },
    "# Q\n\n## 分段\n1. S pp.1–1\n",
  );
  const result = await jsonB(["today", vault, "--today", "2026-11-10"]);
  assert.equal(result.planned.slug, "epp");
  assert.equal(result.free.slug, "free-book");
  await rm(vault, { recursive: true, force: true });
});

// ---- done ----

test("done：position +1，并追加读书记录", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const result = await jsonB(["done", vault, "epp", "--today", "2026-11-10"]);
  assert.equal(result.slug, "epp");
  assert.equal(result.position, 1);
  assert.equal(result.total, 7);
  assert.equal(result.finished, false);
  assert.equal(result.next, null);

  const page = await readBook(vault, "epp");
  assert.match(page, /^position: 1$/m);
  assert.match(page, /^status: reading$/m);
  assert.match(page, /^- 2026-11-10: 第 1 段 pp\.1–9 读完（用户自报）$/m);
  // 读书记录与排期都只保留一份
  assert.ok(existsSync(join(vault, "wiki", "shelf", "index.md")), "done 后应重写 index.md");
  await rm(vault, { recursive: true, force: true });
});

test("done：读完最后一段 → status done，计划内下一本开始读（明天起）", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "last",
    { ...EPP_FIELDS, order: 1, position: 6 },
    EPP_BODY,
  );
  await writeBook(
    vault,
    "next-book",
    { kind: "book", slot: "planned", order: 2, status: "queued", title: '"Next"', short: '"N"', started: '""', position: 0 },
    "# Next\n\n## 分段\n1. S1 pp.1–29\n\n## 读书记录\n",
  );
  const result = await jsonB(["done", vault, "last", "--today", "2026-11-15"]);
  assert.equal(result.finished, true);
  assert.equal(result.position, 7);
  assert.equal(result.next, "next-book");

  const last = await readBook(vault, "last");
  assert.match(last, /^status: done$/m);
  assert.match(last, /^- 2026-11-15: 第 7 段 pp\.57–65 读完（用户自报）$/m);

  const next = await readBook(vault, "next-book");
  assert.match(next, /^status: reading$/m);
  assert.match(next, /^started: 2026-11-16$/m, "开下一本应从明天起算");
  assert.match(next, /^position: 0$/m);
  // 下一本的排期表按明天起算
  assert.match(next, /^\| 1 \| 2026-11-16 \| S1 pp\.1–10 \|$/m);
  assert.match(next, /^\| 3 \| 2026-11-18 \| S1 pp\.21–29 \|$/m);

  // index.md 由 done 重写：last 在「读完」，next-book 在「在读」
  const index = await readFile(join(vault, "wiki", "shelf", "index.md"), "utf8");
  assert.match(index, /^## 在读$/m);
  // 下一本的预计读完 = 下一段该读的那天（明天 11-16）+ 3 - 1 = 11-18，与 plannedEnd 相同。
  assert.match(index, /^- \[\[shelf\/next-book\|N\]\] · Next · 0\/3 段 · 预计 2026-11-18 读完$/m);
  assert.match(index, /^- \[\[shelf\/last\|Epp\]\] · Discrete Mathematics with Applications · 7\/7 段 · 2026-11-15 读完$/m);
  await rm(vault, { recursive: true, force: true });
});

test("done：计划外读完后不自动开下一本", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "free-one",
    { kind: "book", slot: "free", status: "reading", title: '"F1"', short: '"F1"', started: "2026-11-09", position: 0 },
    "# F1\n\n## 分段\n1. S pp.1–1\n\n## 读书记录\n",
  );
  await writeBook(
    vault,
    "queued-book",
    { kind: "book", slot: "planned", order: 3, status: "queued", title: '"Q"', short: '"Q"', started: '""', position: 0 },
    "# Q\n\n## 分段\n1. S pp.1–1\n",
  );
  const result = await jsonB(["done", vault, "free-one", "--today", "2026-11-10"]);
  assert.equal(result.finished, true);
  assert.equal(result.next, null);
  assert.match(await readBook(vault, "free-one"), /^status: done$/m);
  assert.match(await readBook(vault, "queued-book"), /^status: queued$/m, "排队书不应被改动");
  await rm(vault, { recursive: true, force: true });
});

test("done：对 queued / done 的书报错", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "queued-book",
    { kind: "book", slot: "planned", order: 1, status: "queued", title: '"Q"', short: '"Q"', started: '""', position: 0 },
    "# Q\n\n## 分段\n1. S pp.1–1\n",
  );
  await writeBook(
    vault,
    "done-book",
    { ...EPP_FIELDS, status: "done", position: 1 },
    "# Done\n\n## 分段\n1. S pp.1–1\n",
  );
  for (const slug of ["queued-book", "done-book"]) {
    const fail = await b(["done", vault, slug, "--today", "2026-11-10"], { expectFail: true });
    assert.match(fail.stderr, /只有在读的书可以记读完/);
  }
  await rm(vault, { recursive: true, force: true });
});

test("done：非法 slug（含 .. 或 /）被拒绝", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  for (const slug of ["..", "../epp", "a/b", "epp "]) {
    const fail = await b(["done", vault, slug, "--today", "2026-11-10"], { expectFail: true });
    assert.match(fail.stderr, /slug 非法/, `${slug} 应被拒绝`);
  }
  // 未改动任何书页
  assert.match(await readBook(vault, "epp"), /^position: 0$/m);
  await rm(vault, { recursive: true, force: true });
});

test("done：slug 指向的书页不存在时报错", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const fail = await b(["done", vault, "missing", "--today", "2026-11-10"], { expectFail: true });
  assert.match(fail.stderr, /书页不存在/);
  await rm(vault, { recursive: true, force: true });
});

// ---- index ----

test("index --write：在读 / 排队 / 读完 三组归类正确", async () => {
  const vault = await makeVault();
  await writeBook(vault, "reading-book", EPP_FIELDS, EPP_BODY);
  await writeBook(
    vault,
    "queued-book",
    { kind: "book", slot: "planned", order: 2, status: "queued", title: '"Queued"', short: '"Q"', started: '""', position: 0 },
    "# Queued\n\n## 分段\n1. S pp.1–29\n",
  );
  await writeBook(
    vault,
    "done-book",
    { ...EPP_FIELDS, order: 3, status: "done", position: 1 },
    "# Done\n\n## 分段\n1. S pp.1–1\n\n## 读书记录\n- 2026-11-12: 第 1 段 pp.1–1 读完（用户自报）\n",
  );

  const result = await jsonB(["index", vault, "--today", "2026-11-10", "--write"]);
  assert.equal(result.file, join(vault, "wiki", "shelf", "index.md"));

  const index = await readFile(result.file, "utf8");
  assert.match(index, /^# 书房$/m);
  assert.doesNotMatch(index, /\n\n\n/, `index.md 不应有连续空行：\n${index}`);
  for (const heading of ["## 在读", "## 排队", "## 读完"]) {
    assert.match(index, new RegExp(`^${heading}$`, "m"));
  }
  const readingSection = index.slice(index.indexOf("## 在读"), index.indexOf("## 排队"));
  assert.ok(readingSection.includes("[[shelf/reading-book|Epp]]"), readingSection);

  const queueSection = index.slice(index.indexOf("## 排队"), index.indexOf("## 读完"));
  assert.ok(queueSection.includes("[[shelf/queued-book|Q]]"), queueSection);
  // 在读的 11-16 读完，排队书从 11-17 起、3 段 → 11-19；不能从今天（11-10）算。
  assert.ok(queueSection.includes("预计 2026-11-19 读完"), queueSection);
  assert.doesNotMatch(queueSection, /2026-11-12/, "排队书日期不应与在读的书重叠");

  const doneSection = index.slice(index.indexOf("## 读完"));
  assert.ok(doneSection.includes("[[shelf/done-book|Epp]]"), doneSection);
  assert.ok(doneSection.includes("2026-11-12 读完"), doneSection);
  assert.doesNotMatch(doneSection, /预计/, "读完的书不写预计日期");

  // reading-book 的预计日期：today 11-10，剩 7 块 → 11-16；plan 里写 0/7 段
  assert.ok(readingSection.includes("0/7 段"), readingSection);
  assert.ok(readingSection.includes("预计 2026-11-16 读完"), readingSection);
  await rm(vault, { recursive: true, force: true });
});

test("index：不带 --write 只打印，不生成文件", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const { stdout } = await b(["index", vault, "--today", "2026-11-10"]);
  assert.match(stdout, /^# 书房$/m);
  assert.match(stdout, /\[\[shelf\/epp\|Epp\]\]/);
  assert.ok(!existsSync(join(vault, "wiki", "shelf", "index.md")));
  await rm(vault, { recursive: true, force: true });
});

test("plan --write：手写的 `## 排期` 占位标题被就地使用，不重复插入同名标题", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "placeholder",
    EPP_FIELDS,
    "# T\n\n## 分段\n1. Ch1 pp.1–9\n\n## 排期\n（脚本生成，不手改）\n\n## 读书记录\n",
  );
  await jsonB(["plan", vault, "placeholder", "--write", "--today", "2026-11-09"]);
  const page = await readBook(vault, "placeholder");
  assert.equal(page.match(/^## 排期$/gm).length, 1, page);
  assert.ok(page.includes("（脚本生成，不手改）"), "人写的说明应保留");
  assert.match(page, /^\| 1 \| 2026-11-09 \| Ch1 pp\.1–9 \|$/m);
  // 再跑一次仍幂等
  const once = page;
  await jsonB(["plan", vault, "placeholder", "--write", "--today", "2026-11-09"]);
  assert.equal(await readBook(vault, "placeholder"), once);
  await rm(vault, { recursive: true, force: true });
});

test("反复 plan / done 不在文件末尾累积空行", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  await b(["plan", vault, "epp", "--write"]);
  const once = await readBook(vault, "epp");
  await b(["plan", vault, "epp", "--write"]);
  await b(["plan", vault, "epp", "--write"]);
  assert.equal(await readBook(vault, "epp"), once, "plan 应幂等");

  for (const day of ["2026-11-10", "2026-11-11", "2026-11-12"]) {
    await b(["done", vault, "epp", "--today", day]);
  }
  const page = await readBook(vault, "epp");
  assert.doesNotMatch(page, /\n\n\n/, `文件内不应有连续空行：\n${page}`);
  assert.match(page, /^\| 块 \| 日期 \| 读什么 \|$/m);
  assert.match(page, /^- 2026-11-12: 第 3 段 pp\.19–27 读完（用户自报）$/m);
  await rm(vault, { recursive: true, force: true });
});

test("原子写入：不留临时文件", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  await b(["plan", vault, "epp", "--write"]);
  await b(["done", vault, "epp", "--today", "2026-11-10"]);
  const entries = await readdir(join(vault, "wiki", "shelf"));
  assert.ok(
    entries.every((name) => !name.includes(".tmp-")),
    `残留临时文件：${entries}`,
  );
  await rm(vault, { recursive: true, force: true });
});

// ---- 纯函数：页码列表、讲后读已读、摘录 ----

test("parsePageList：展开区间、接受三种分隔符与两种连接号，去重升序", () => {
  assert.deepEqual(parsePageList("1–5、7–12、31"), [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 31]);
  assert.deepEqual(parsePageList("1-5, 7"), [1, 2, 3, 4, 5, 7]);
  assert.deepEqual(parsePageList("3，4，3、4"), [3, 4]);
  // 单页、带空格
  assert.deepEqual(parsePageList(" 9 "), [9]);
});

test("parsePageList：反向区间与坏项忽略，全坏时为 []", () => {
  assert.deepEqual(parsePageList("5–1、2"), [2]);
  assert.deepEqual(parsePageList("附录、pp.3、1–"), []);
  assert.deepEqual(parsePageList(""), []);
  assert.deepEqual(parsePageList(undefined), []);
});

test("formatPageList：连续段合并、单页不写区间、空数组为空串", () => {
  assert.equal(formatPageList([12, 13, 14, 15, 17]), "12–15、17");
  assert.equal(formatPageList([7]), "7");
  assert.equal(formatPageList([]), "");
  assert.equal(formatPageList([3, 1, 2, 1]), "1–3");
  assert.equal(formatPageList([100, 101, 103, 104]), "100–101、103–104");
});

test("parseCoreRead：解析讲后读行、保留页码原文、坏行忽略、无节为 []", () => {
  const body = [
    "# 书",
    "",
    "## 核心页已读",
    "",
    "- pp.1–5、7–12 · discrete-math-epp · §1.1–1.4 核心页 · 2026-11-10",
    "- pp.3 · linear-algebra · §2.1 · 2026-11-11",
    "- pp.9 · BadCourse · §2.2 · 2026-11-11",
    "- pp.9 · ok-course · §2.2 · 2026-1-2",
    "- 这一行不是核心页",
    "",
    "## 摘录",
  ];
  assert.deepEqual(parseCoreRead(body), [
    { pages: "1–5、7–12", course: "discrete-math-epp", label: "§1.1–1.4 核心页", date: "2026-11-10" },
    { pages: "3", course: "linear-algebra", label: "§2.1", date: "2026-11-11" },
  ]);
  assert.deepEqual(parseCoreRead(["# 书", "", "## 摘录", ""]), []);
  assert.deepEqual(parseCoreRead([]), []);
});

test("parseCoreRead：新标题 `## 讲后读已读` 也读，新旧两节都在时都读", () => {
  const fresh = [
    "# 书",
    "",
    "## 讲后读已读",
    "",
    "- pp.1–5 · discrete-math-epp · §1.1 · 2026-11-10",
    "",
    "## 读书记录",
  ];
  assert.deepEqual(parseCoreRead(fresh), [
    { pages: "1–5", course: "discrete-math-epp", label: "§1.1", date: "2026-11-10" },
  ]);
  const both = [
    "## 讲后读已读",
    "- pp.1–5 · discrete-math-epp · §1.1 · 2026-11-10",
    "",
    "## 核心页已读",
    "- pp.6–9 · discrete-math-epp · §1.2 · 2026-11-11",
    "",
    "## 读书记录",
  ];
  assert.deepEqual(parseCoreRead(both).map((row) => row.pages), ["1–5", "6–9"]);
});

test("parseExtracts：解析摘录行、index 是匹配行序号、坏行忽略、无节为 []", () => {
  const body = [
    "## 摘录",
    "",
    "- p.5: 逆否命题与原命题等价。 #卡/2026-11-09",
    "- p.11: 条件命题 p → q 只在 p 真而 q 假时为假。 #待做卡",
    "- 这一行没有标记",
    "- p.13: 第三句 #待做卡",
  ];
  assert.deepEqual(parseExtracts(body), [
    { index: 1, page: 5, text: "逆否命题与原命题等价。", carded: "2026-11-09" },
    { index: 2, page: 11, text: "条件命题 p → q 只在 p 真而 q 假时为假。", carded: null },
    { index: 3, page: 13, text: "第三句", carded: null },
  ]);
  assert.deepEqual(parseExtracts(["# 书", "", "## 读书记录", ""]), []);
  assert.deepEqual(parseExtracts([]), []);
});

// ---- bookView.coreOverlap ----

/** 造一个 bookView 能吃的书页对象（fields 为 [[key, value]] 列表）。 */
function viewPage(fields, body) {
  return {
    slug: "b",
    fields: fields.map(([key, value]) => ({ key, value })),
    body: body.split("\n"),
  };
}

test("bookView.coreOverlap：与今天这块有交集时列出交集页", () => {
  const page = viewPage(
    [["kind", "book"], ["slot", "planned"], ["status", "reading"], ["title", "T"], ["started", "2026-11-09"], ["position", "0"]],
    [
      "# T",
      "",
      "## 分段",
      "1. Ch1 pp.1–36",
      "",
      "## 讲后读已读",
      "",
      "- pp.1–5、7–12、20–21 · discrete-math-epp · §1.1 核心页 · 2026-11-10",
      "",
      "## 读书记录",
    ].join("\n"),
  );
  const view = bookView(page, "2026-11-10");
  // 第一块是 pp.1–9，交集 = 1–5、7–9
  assert.equal(view.coreOverlap, "pp.1–5、7–9");
});

test("bookView.coreOverlap：无交集与读完全部分段时为 null", () => {
  const noOverlap = viewPage(
    [["kind", "book"], ["slot", "planned"], ["status", "reading"], ["title", "T"], ["started", "2026-11-09"], ["position", "1"]],
    [
      "# T",
      "",
      "## 分段",
      "1. Ch1 pp.1–36",
      "",
      "## 讲后读已读",
      "",
      "- pp.1–5 · discrete-math-epp · §1.1 核心页 · 2026-11-10",
      "",
      "## 读书记录",
    ].join("\n"),
  );
  // position 1 → 第二块 pp.10–18，与 1–5 无交集
  assert.equal(bookView(noOverlap, "2026-11-10").coreOverlap, null);

  const finished = viewPage(
    [["kind", "book"], ["slot", "free"], ["status", "reading"], ["title", "T"], ["started", "2026-11-09"], ["position", "4"]],
    [
      "# T",
      "",
      "## 分段",
      "1. Ch1 pp.1–36",
      "",
      "## 讲后读已读",
      "",
      "- pp.1–5 · discrete-math-epp · §1.1 核心页 · 2026-11-10",
      "",
      "## 读书记录",
    ].join("\n"),
  );
  assert.equal(bookView(finished, "2026-11-10").coreOverlap, null);
});

// ---- bookView.doneToday / doneChunk ----

/** 一本书的书页：`records` 是 `## 读书记录` 里除标题外的各行。 */
function readBookPage(records, position = "1") {
  return viewPage(
    [
      ["kind", "book"],
      ["slot", "planned"],
      ["status", "reading"],
      ["title", "T"],
      ["started", "2026-11-09"],
      ["position", position],
    ],
    ["# T", "", "## 分段", "1. Ch1 pp.1–36", "", "## 读书记录", "", ...records].join("\n"),
  );
}

test("bookView.doneToday：当天记了「第 position 段」就是 true，doneChunk 是刚读的那块", () => {
  const page = readBookPage(["- 2026-11-10: 第 1 段 pp.1–9 读完（用户自报）"], "1");
  const view = bookView(page, "2026-11-10");
  assert.equal(view.doneToday, true);
  // 刚读的是第 1 块（pp.1–9）；下一块仍待读。
  assert.deepEqual(view.doneChunk, { index: 1, title: "Ch1", from: 1, to: 9 });
  assert.deepEqual(view.chunk, { index: 2, title: "Ch1", from: 10, to: 18 });

  // 第二天：同一段记录不再算「今天」，doneChunk 回到 null。
  const nextDay = bookView(page, "2026-11-11");
  assert.equal(nextDay.doneToday, false);
  assert.equal(nextDay.doneChunk, null);
});

test("bookView.doneToday：只有讲后读记录时 false；position 0 时 false", () => {
  const lectured = readBookPage(["- 2026-11-10: 讲后读 §1.1 已读（ctm，用户自报）"], "1");
  assert.equal(bookView(lectured, "2026-11-10").doneToday, false);
  assert.equal(bookView(lectured, "2026-11-10").doneChunk, null);

  // position 0：今天没有「第 0 段」，讲后读或空记录都不算。
  const none = readBookPage(["- 2026-11-10: 讲后读 §1.1 已读（ctm，用户自报）"], "0");
  assert.equal(bookView(none, "2026-11-10").doneToday, false);
  assert.equal(bookView(none, "2026-11-10").doneChunk, null);
});

test("bookView.doneToday：读完最后一段当天仍 true，chunk 为 null、doneChunk 是最后一块", () => {
  const page = readBookPage(
    [
      "- 2026-11-09: 第 1 段 pp.1–9 读完（用户自报）",
      "- 2026-11-10: 第 4 段 pp.28–36 读完（用户自报）",
    ],
    "4",
  );
  const view = bookView(page, "2026-11-10");
  assert.equal(view.doneToday, true);
  assert.equal(view.chunk, null, "读完全部分段时没有下一块");
  assert.deepEqual(view.doneChunk, { index: 4, title: "Ch1", from: 28, to: 36 });
  assert.equal(bookView(page, "2026-11-11").doneToday, false);
});

// ---- 讲后读已读：旧标题兼容 ----

/** 手写的旧式书页：只有 `## 核心页已读` 一节（旧标题）+ 读书记录。 */
async function writeLegacyBook(vault, slug = "epp") {
  return writeBook(
    vault,
    slug,
    EPP_FIELDS,
    [
      `# ${slug}`,
      "",
      "## 分段",
      "1. Ch1 pp.1–36",
      "",
      "## 核心页已读",
      "",
      "- pp.11–20 · discrete-math-epp · §1.1 核心页 · 2026-11-08",
      "",
      "## 读书记录",
      "",
    ].join("\n"),
  );
}

test("旧书页 `## 核心页已读`：list.coreRead 与 today.coreOverlap 照常读", async () => {
  const vault = await makeVault();
  await writeLegacyBook(vault);
  const list = await jsonB(["list", vault, "--today", "2026-11-10"]);
  assert.deepEqual(list[0].coreRead, [
    { pages: "11–20", course: "discrete-math-epp", label: "§1.1 核心页", date: "2026-11-08" },
  ]);
  // 第一块是 pp.1–9，与旧节的 11–20 无交集；第二块 10–18 有交集。
  const today = await jsonB(["today", vault, "--today", "2026-11-10"]);
  assert.equal(today.planned.coreOverlap, null);
  await jsonB(["done", vault, "epp", "--today", "2026-11-10"]);
  const next = await jsonB(["today", vault, "--today", "2026-11-11"]);
  assert.deepEqual([next.planned.chunk.from, next.planned.chunk.to], [10, 18]);
  assert.equal(next.planned.coreOverlap, "pp.11–18");
  await rm(vault, { recursive: true, force: true });
});

// ---- after add / done：书页 `## 课后读` ----

test("after add：写一行进 `## 课后读`；同课同标签再加是更新；index.md 重画", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const first = await jsonB([
    "after", "add", vault, "epp",
    "--label", "§1.1–1.4", "--pages", "1–5、7-12", "--course", "discrete-math-epp",
    "--date", "2026-11-10", "--today", "2026-11-10",
  ]);
  assert.deepEqual(first, { slug: "epp", index: 1, updated: false, committed: "skipped" });
  assert.ok(
    existsSync(join(vault, "wiki", "shelf", "index.md")),
    "after add 后应重画 index.md",
  );
  const second = await jsonB([
    "after", "add", vault, "epp",
    "--label", "§1.1–1.4", "--pages", "13–15", "--course", "discrete-math-epp",
    "--date", "2026-11-12", "--today", "2026-11-12",
  ]);
  assert.deepEqual(second, { slug: "epp", index: 1, updated: true, committed: "skipped" });
  const page = await readBook(vault, "epp");
  assert.equal(page.match(/^## 课后读$/gm).length, 1);
  assert.equal(page.match(/^- \[[ x]\] /gm).length, 1, "只应有一行课后读");
  assert.match(
    page,
    /^- \[ \] §1\.1–1\.4 · pp\.13–15 · discrete-math-epp · 2026-11-12$/m,
    "页码与日期是第二次的",
  );
  assert.ok(page.indexOf("## 课后读") < page.indexOf("## 读书记录"), "课后读在读书记录之前");
  assert.doesNotMatch(page, /\n\n\n/, page);
  await rm(vault, { recursive: true, force: true });
});

test("after add：非法参数报错且书页不变；子命令缺失或未知报错", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const before = await readBook(vault, "epp");
  const bad = [
    ["after", "add", vault, "epp", "--pages", "1–5", "--course", "dm", "--date", "2026-11-10"],
    ["after", "add", vault, "epp", "--label", "§1", "--course", "dm", "--date", "2026-11-10"],
    ["after", "add", vault, "epp", "--label", "§1", "--pages", "1–5", "--date", "2026-11-10"],
    ["after", "add", vault, "epp", "--label", "§1", "--pages", "1–5", "--course", "dm"],
    ["after", "add", vault, "epp", "--label", "含 · 中点", "--pages", "1–5", "--course", "dm", "--date", "2026-11-10"],
    ["after", "add", vault, "epp", "--label", "§1", "--pages", "附录", "--course", "dm", "--date", "2026-11-10"],
    ["after", "add", vault, "epp", "--label", "§1", "--pages", "1–5", "--course", "Bad_Course", "--date", "2026-11-10"],
    ["after", "add", vault, "epp", "--label", "§1", "--pages", "1–5", "--course", "dm", "--date", "11-10"],
  ];
  for (const args of bad) {
    const fail = await b(args, { expectFail: true });
    assert.match(fail.stderr, /需要 --|非法/, args.join(" "));
  }
  for (const args of [["after", vault, "epp"], ["after", "wat", vault, "epp"], ["after"]]) {
    const fail = await b(args, { expectFail: true });
    assert.match(fail.stderr, /after/, args.join(" "));
  }
  assert.equal(await readBook(vault, "epp"), before, "报错不应改动书页");
  await rm(vault, { recursive: true, force: true });
});

test("after done：行变 [x] 写「读于」、读书记录加一行；再勾与越界都报错", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  await jsonB([
    "after", "add", vault, "epp",
    "--label", "§1.1", "--pages", "1–5", "--course", "discrete-math-epp",
    "--date", "2026-11-10", "--today", "2026-11-10",
  ]);
  await jsonB([
    "after", "add", vault, "epp",
    "--label", "§2.3", "--pages", "66–75", "--course", "discrete-math-epp",
    "--date", "2026-11-12", "--today", "2026-11-12",
  ]);
  const done = await jsonB(["after", "done", vault, "epp", "--index", "2", "--today", "2026-11-17"]);
  assert.deepEqual(done, {
    slug: "epp",
    index: 2,
    label: "§2.3",
    pages: "66–75",
    course: "discrete-math-epp",
    readOn: "2026-11-17",
    committed: "skipped",
  });
  const page = await readBook(vault, "epp");
  assert.match(
    page,
    /^- \[x\] §2\.3 · pp\.66–75 · discrete-math-epp · 2026-11-12 · 读于 2026-11-17$/m,
  );
  assert.match(
    page,
    /^- \[ \] §1\.1 · pp\.1–5 · discrete-math-epp · 2026-11-10$/m,
    "别行不动",
  );
  assert.match(page, /^- 2026-11-17: 课后读 §2\.3 已读（discrete-math-epp）$/m);

  const again = await b(
    ["after", "done", vault, "epp", "--index", "2", "--today", "2026-11-18"],
    { expectFail: true },
  );
  assert.match(again.stderr, /已经记过/);
  const outOfRange = await b(
    ["after", "done", vault, "epp", "--index", "5", "--today", "2026-11-18"],
    { expectFail: true },
  );
  assert.match(outOfRange.stderr, /没有第 5 条课后读/);
  const badIndex = await b(
    ["after", "done", vault, "epp", "--index", "x", "--today", "2026-11-18"],
    { expectFail: true },
  );
  assert.match(badIndex.stderr, /--index 非法/);
  const noIndex = await b(["after", "done", vault, "epp", "--today", "2026-11-18"], {
    expectFail: true,
  });
  assert.match(noIndex.stderr, /--index/);
  await rm(vault, { recursive: true, force: true });
});

test("after：list / today --json 里有 afterReads", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  await jsonB([
    "after", "add", vault, "epp",
    "--label", "§1.1", "--pages", "1–5", "--course", "discrete-math-epp",
    "--date", "2026-11-10", "--today", "2026-11-10",
  ]);
  const expected = [
    {
      index: 1,
      label: "§1.1",
      pages: "1–5",
      course: "discrete-math-epp",
      date: "2026-11-10",
      done: false,
      readOn: null,
    },
  ];
  const list = await jsonB(["list", vault, "--today", "2026-11-10"]);
  assert.deepEqual(list[0].afterReads, expected);
  const today = await jsonB(["today", vault, "--today", "2026-11-10"]);
  assert.deepEqual(today.planned.afterReads, expected);
  await rm(vault, { recursive: true, force: true });
});

test("after：coreOverlap 把已勾课后读的页也算进「读过了」", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  await jsonB([
    "after", "add", vault, "epp",
    "--label", "§1.1", "--pages", "1–5", "--course", "discrete-math-epp",
    "--date", "2026-11-10", "--today", "2026-11-10",
  ]);
  // 未勾的行不算已读：今天这段 pp.1–9 没有重叠。
  const before = await jsonB(["today", vault, "--today", "2026-11-10"]);
  assert.equal(before.planned.coreOverlap, null);
  await jsonB(["after", "done", vault, "epp", "--index", "1", "--today", "2026-11-11"]);
  const after = await jsonB(["today", vault, "--today", "2026-11-11"]);
  assert.equal(after.planned.coreOverlap, "pp.1–5");
  await rm(vault, { recursive: true, force: true });
});

// ---- extract ----

test("extract：换行折成空格，返回新行序号", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const first = await jsonB(["extract", vault, "epp", "--page", "5", "--text", "逆否命题等价。", "--today", "2026-11-10"]);
  assert.deepEqual(first, { slug: "epp", index: 1, page: 5, text: "逆否命题等价。", committed: "skipped" });
  const second = await jsonB([
    "extract", vault, "epp", "--page", "11", "--text", "条件命题\n  只在 p 真 q 假时为假。\n", "--today", "2026-11-10",
  ]);
  assert.deepEqual(second, { slug: "epp", index: 2, page: 11, text: "条件命题 只在 p 真 q 假时为假。", committed: "skipped" });
  const page = await readBook(vault, "epp");
  assert.match(page, /^- p\.5: 逆否命题等价。 #待做卡$/m);
  assert.ok(!page.includes("\n\n\n"), `不应出现连续空行：\n${page}`);
  await rm(vault, { recursive: true, force: true });
});

test("extract：空文本、超 500 字、页码 0 / 越界都报错", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const before = await readBook(vault, "epp");
  const bad = [
    ["--page", "5", "--text", "   \n  "],
    ["--page", "5", "--text", "x".repeat(501)],
    ["--page", "0", "--text", "句子"],
    ["--page", "100000", "--text", "句子"],
    ["--page", "5.5", "--text", "句子"],
  ];
  for (const extra of bad) {
    const fail = await b(["extract", vault, "epp", ...extra, "--today", "2026-11-10"], { expectFail: true });
    assert.match(fail.stderr, /非法/, extra.join(" "));
  }
  assert.equal(await readBook(vault, "epp"), before);
  // 边界：500 字刚好可以
  const limit = await jsonB(["extract", vault, "epp", "--page", "5", "--text", "x".repeat(500), "--today", "2026-11-10"]);
  assert.equal(limit.index, 1);
  await rm(vault, { recursive: true, force: true });
});

// ---- card ----

test("card：标记 #待做卡 → #卡/<today>；重复请求进 skipped；越界报错", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  await jsonB(["extract", vault, "epp", "--page", "5", "--text", "甲", "--today", "2026-11-10"]);
  await jsonB(["extract", vault, "epp", "--page", "6", "--text", "乙", "--today", "2026-11-10"]);
  const marked = await jsonB(["card", vault, "epp", "--index", "1", "--today", "2026-11-10"]);
  assert.deepEqual(marked, { slug: "epp", marked: [1], skipped: [], committed: "skipped" });
  const again = await jsonB(["card", vault, "epp", "--index", "1", "--today", "2026-11-11"]);
  assert.deepEqual(again, { slug: "epp", marked: [], skipped: [1], committed: "skipped" });
  const both = await jsonB(["card", vault, "epp", "--index", "1,2", "--today", "2026-11-11"]);
  assert.deepEqual(both, { slug: "epp", marked: [2], skipped: [1], committed: "skipped" });

  const page = await readBook(vault, "epp");
  assert.match(page, /^- p\.5: 甲 #卡\/2026-11-10$/m);
  assert.match(page, /^- p\.6: 乙 #卡\/2026-11-11$/m);

  for (const index of ["0", "3", "x", "", "1.5"]) {
    const fail = await b(["card", vault, "epp", "--index", index, "--today", "2026-11-11"], { expectFail: true });
    assert.match(fail.stderr, /非法/, index);
  }
  await rm(vault, { recursive: true, force: true });
});

test("card：摘录中间夹着不合格式的行时序号仍按匹配行计", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "mixed",
    EPP_FIELDS,
    [
      "# T",
      "",
      "## 分段",
      "1. Ch1 pp.1–9",
      "",
      "## 摘录",
      "",
      "- p.5: 第一条 #待做卡",
      "- 这行格式不对",
      "- p.7: 第二条 #待做卡",
      "- p.9: 第三条 #卡/2026-11-09",
      "",
      "## 读书记录",
      "",
    ].join("\n"),
  );
  const result = await jsonB(["card", vault, "mixed", "--index", "2", "--today", "2026-11-10"]);
  assert.deepEqual(result, { slug: "mixed", marked: [2], skipped: [], committed: "skipped" });
  const page = await readBook(vault, "mixed");
  assert.match(page, /^- p\.5: 第一条 #待做卡$/m, "第 1 条不应被改");
  assert.match(page, /^- p\.7: 第二条 #卡\/2026-11-10$/m);
  assert.match(page, /^- p\.9: 第三条 #卡\/2026-11-09$/m);
  await rm(vault, { recursive: true, force: true });
});

// ---- list 新字段 ----

test("list：带 extracts 与 coreRead", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "epp",
    EPP_FIELDS,
    [
      "# Epp",
      "",
      "## 分段",
      "1. Ch1 pp.1–36",
      "2. Ch2 pp.37–65",
      "",
      "## 讲后读已读",
      "",
      "- pp.1–5 · discrete-math-epp · §1.1 · 2026-11-10",
      "",
      "## 读书记录",
      "",
    ].join("\n"),
  );
  await jsonB(["extract", vault, "epp", "--page", "5", "--text", "甲", "--today", "2026-11-10"]);
  const list = await jsonB(["list", vault, "--today", "2026-11-10"]);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].extracts, [{ index: 1, page: 5, text: "甲", carded: null }]);
  assert.deepEqual(list[0].coreRead, [
    { pages: "1–5", course: "discrete-math-epp", label: "§1.1", date: "2026-11-10" },
  ]);
  await rm(vault, { recursive: true, force: true });
});

test("list：upcoming 只取 position 之后的块，最多 5 条", async () => {
  const vault = await makeVault();
  // Epp 的正文切出 7 块（Ch1 4 块 + Ch2 3 块）。
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const list = await jsonB(["list", vault, "--today", "2026-11-09"]);
  assert.equal(list[0].upcoming.length, 5, "最多 5 条");
  assert.deepEqual(
    list[0].upcoming.map((row) => row.index),
    [1, 2, 3, 4, 5],
    "position 0 时从第 1 块起",
  );
  assert.deepEqual(list[0].upcoming[0], {
    index: 1,
    date: "2026-11-09",
    title: "Ch1",
    from: 1,
    to: 9,
  });
  await rm(vault, { recursive: true, force: true });
});

test("list：upcoming 从已读块之后起算（position 2 → 第一条是第 3 块）", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", { ...EPP_FIELDS, position: 2 }, EPP_BODY);
  const list = await jsonB(["list", vault, "--today", "2026-11-10"]);
  assert.equal(list[0].position, 2);
  assert.deepEqual(
    list[0].upcoming.map((row) => row.index),
    [3, 4, 5, 6, 7],
    "已读的两块不出现",
  );
  assert.equal(list[0].upcoming[0].date, "2026-11-10");
  assert.equal(list[0].upcoming[1].date, "2026-11-11");
  await rm(vault, { recursive: true, force: true });
});

test("list：今天已读完这一段 → upcoming 第一条是明天", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  await jsonB(["done", vault, "epp", "--today", "2026-11-10"]);
  const list = await jsonB(["list", vault, "--today", "2026-11-10"]);
  assert.equal(list[0].position, 1);
  assert.equal(list[0].upcoming[0].index, 2, "只留没读的块");
  assert.equal(list[0].upcoming[0].date, "2026-11-11", "今天已读 → 明天起");
  assert.equal(list[0].upcoming[1].date, "2026-11-12");
  await rm(vault, { recursive: true, force: true });
});

test("list：status 为 done 的书 upcoming 是空数组", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "finished",
    { ...EPP_FIELDS, status: "done", position: 7 },
    EPP_BODY,
  );
  const list = await jsonB(["list", vault, "--today", "2026-11-10"]);
  assert.equal(list[0].status, "done");
  assert.deepEqual(list[0].upcoming, []);
  await rm(vault, { recursive: true, force: true });
});

test("反复 after add / extract 不累积空行，节顺序始终一致", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  for (let i = 0; i < 3; i += 1) {
    await b(["extract", vault, "epp", "--page", String(i + 1), "--text", `第 ${i + 1} 句`, "--today", "2026-11-10"]);
    await b([
      "after", "add", vault, "epp",
      "--label", `§1.${i}`, "--pages", "1–5", "--course", "discrete-math-epp",
      "--date", "2026-11-10", "--today", "2026-11-10",
    ]);
  }
  const page = await readBook(vault, "epp");
  assert.doesNotMatch(page, /\n\n\n/, `不应出现连续空行：\n${page}`);
  assert.ok(page.indexOf("## 课后读") < page.indexOf("## 摘录"), "课后读在摘录之前");
  assert.ok(page.indexOf("## 摘录") < page.indexOf("## 读书记录"), "摘录在读书记录之前");
  assert.equal(page.match(/^## 课后读$/gm).length, 1);
  assert.equal(page.match(/^## 摘录$/gm).length, 1);
  await rm(vault, { recursive: true, force: true });
});

// ---- B：日期公式 ----

test("日期：started 11-09、4 段、position 0，今天 11-09 → end 11-12、late 0", async () => {
  const vault = await makeVault();
  await writeBook(vault, "four", EPP_FIELDS, "# T\n\n## 分段\n1. Ch1 pp.1–40\n\n## 读书记录\n");
  const result = await jsonB(["today", vault, "--today", "2026-11-09"]);
  assert.equal(result.planned.plannedEnd, "2026-11-12");
  assert.equal(result.planned.end, "2026-11-12");
  assert.equal(result.planned.late, 0);
  await rm(vault, { recursive: true, force: true });
});

test("日期：同样条件今天 11-10（昨天没读）→ end 11-13、late 1；排期第 1 段 11-10", async () => {
  const vault = await makeVault();
  await writeBook(vault, "four", EPP_FIELDS, "# T\n\n## 分段\n1. Ch1 pp.1–40\n\n## 读书记录\n");
  const result = await jsonB(["today", vault, "--today", "2026-11-10"]);
  assert.equal(result.planned.end, "2026-11-13");
  assert.equal(result.planned.late, 1);
  const plan = await jsonB(["plan", vault, "four", "--today", "2026-11-10"]);
  assert.equal(plan.started, "2026-11-09");
  assert.equal(plan.rows[0].date, "2026-11-10");
  assert.equal(plan.rows[3].date, "2026-11-13");
  await rm(vault, { recursive: true, force: true });
});

test("日期：11-09 done 后（position 1）、今天仍 11-09 → end 11-12、late 0；排期 11-09 / 11-10", async () => {
  const vault = await makeVault();
  await writeBook(vault, "four", EPP_FIELDS, "# T\n\n## 分段\n1. Ch1 pp.1–40\n\n## 读书记录\n");
  await jsonB(["done", vault, "four", "--today", "2026-11-09"]);
  const result = await jsonB(["today", vault, "--today", "2026-11-09"]);
  assert.equal(result.planned.position, 1);
  assert.equal(result.planned.end, "2026-11-12");
  assert.equal(result.planned.late, 0);
  const plan = await jsonB(["plan", vault, "four", "--today", "2026-11-09"]);
  assert.equal(plan.rows[0].date, "2026-11-09");
  assert.equal(plan.rows[1].date, "2026-11-10");
  // done 已把排期表按新公式重写进书页
  const page = await readBook(vault, "four");
  assert.match(page, /^\| 1 \| 2026-11-09 \| Ch1 pp\.1–10 \|$/m);
  assert.match(page, /^\| 2 \| 2026-11-10 \| Ch1 pp\.11–20 \|$/m);
  await rm(vault, { recursive: true, force: true });
});

test("日期：读完一本自动开下一本（明天起）→ 下一本 end == plannedEnd、late 0", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "last",
    { ...EPP_FIELDS, order: 1, started: "2026-11-10", position: 0 },
    "# Last\n\n## 分段\n1. S pp.1–1\n\n## 读书记录\n",
  );
  await writeBook(
    vault,
    "next-book",
    { kind: "book", slot: "planned", order: 2, status: "queued", title: '"Next"', short: '"N"', started: '""', position: 0 },
    "# Next\n\n## 分段\n1. S1 pp.1–29\n\n## 读书记录\n",
  );
  await jsonB(["done", vault, "last", "--today", "2026-11-10"]);
  const result = await jsonB(["today", vault, "--today", "2026-11-10"]);
  assert.equal(result.planned.slug, "next-book");
  assert.equal(result.planned.end, result.planned.plannedEnd);
  assert.equal(result.planned.late, 0);
  // 排期表从明天起算，与 plannedEnd 一致
  const page = await readBook(vault, "next-book");
  assert.match(page, /^started: 2026-11-11$/m);
  assert.match(page, /^\| 1 \| 2026-11-11 \| S1 pp\.1–10 \|$/m);
  await rm(vault, { recursive: true, force: true });
});

test("日期：started 为空的书 plan --write 后 frontmatter started 等于 --today", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "free-book",
    { kind: "book", slot: "free", status: "reading", title: '"Free"', short: '"F"', started: '""', position: 0 },
    "# Free\n\n## 分段\n1. S pp.1–10\n\n## 读书记录\n",
  );
  await jsonB(["plan", vault, "free-book", "--today", "2026-11-20", "--write"]);
  assert.match(await readBook(vault, "free-book"), /^started: 2026-11-20$/m);
  await rm(vault, { recursive: true, force: true });
});

test("after done：书页没有 `## 读书记录` 时补一节，课后读排在它前面", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "bare",
    { ...EPP_FIELDS, position: 3 },
    [
      "# Bare",
      "",
      "## 分段",
      "1. Ch1 pp.1–36",
      "",
      "## 课后读",
      "",
      "- [ ] §1.1 · pp.1–5 · discrete-math-epp · 2026-11-10",
      "",
    ].join("\n"),
  );
  await jsonB(["after", "done", vault, "bare", "--index", "1", "--today", "2026-11-10"]);
  const page = await readBook(vault, "bare");
  assert.match(page, /^## 读书记录$/m);
  assert.match(page, /^- 2026-11-10: 课后读 §1\.1 已读（discrete-math-epp）$/m);
  assert.ok(page.indexOf("## 课后读") < page.indexOf("## 读书记录"));
  assert.match(page, /^position: 3$/m, "after done 不动 position");
  assert.doesNotMatch(page, /\n\n\n/, page);
  await rm(vault, { recursive: true, force: true });
});

// ---- queueEnds：排队书的预计读完（从在读书之后串起来，不从今天算）----

/** 造一个 loadBooks 返回形状的条目（queueEnds 的入参）。 */
function shelfEntry(slug, fields, body) {
  return {
    slug,
    file: `${slug}.md`,
    page: {
      slug,
      fields: fields.map(([key, value]) => ({ key, value })),
      body: body.split("\n"),
    },
  };
}

/** 一本 planned 排队书：segments 决定块数（29 页 → 3 块，36+29 页 → 7 块）。 */
function queuedEntry(slug, order, pages = 29) {
  return shelfEntry(
    slug,
    [
      ["kind", "book"],
      ["slot", "planned"],
      ...(order === null ? [] : [["order", String(order)]]),
      ["status", "queued"],
      ["title", `"${slug}"`],
      ["short", `"${slug}"`],
      ["started", '""'],
      ["position", "0"],
    ],
    `# ${slug}\n\n## 分段\n1. S pp.1–${pages}\n`,
  );
}

/** 一本 planned 在读的书：started 11-09、7 块 → 11-15 读完。 */
function readingEntry(slug, order = 1) {
  return shelfEntry(
    slug,
    [
      ["kind", "book"],
      ["slot", "planned"],
      ["order", String(order)],
      ["status", "reading"],
      ["title", `"${slug}"`],
      ["short", `"${slug}"`],
      ["started", "2026-11-09"],
      ["position", "0"],
    ],
    `# ${slug}\n\n## 分段\n1. Ch1 pp.1–36\n2. Ch2 pp.37–65\n`,
  );
}

test("queueEnds：三本排队书按 order 串接，第一本从在读书读完次日起", () => {
  // 在读书 11-09 起 7 块 → 11-15 读完；排队三本 3/4/2 块。
  const ends = queueEnds(
    [
      readingEntry("reading-book", 1),
      queuedEntry("q1", 2, 29), // 3 块
      queuedEntry("q2", 3, 40), // 4 块
      queuedEntry("q3", 4, 11), // 2 块
    ],
    "2026-11-09",
  );
  assert.deepEqual([...ends.keys()], ["q1", "q2", "q3"]);
  assert.equal(ends.get("q1"), "2026-11-18", "11-16 起 3 块 → 11-18");
  assert.equal(ends.get("q2"), "2026-11-22", "11-19 起 4 块 → 11-22");
  assert.equal(ends.get("q3"), "2026-11-24", "11-23 起 2 块 → 11-24");
  assert.ok(!ends.has("reading-book"), "在读的书不在 Map 里");
});

test("queueEnds：没有在读的书时从 today 起", () => {
  const ends = queueEnds([queuedEntry("q1", 1, 29), queuedEntry("q2", 2, 11)], "2026-11-20");
  assert.equal(ends.get("q1"), "2026-11-22", "11-20 起 3 块 → 11-22");
  assert.equal(ends.get("q2"), "2026-11-24", "11-23 起 2 块 → 11-24");
});

test("queueEnds：order 为空排最后；free / done 的书不算", () => {
  const freeReading = shelfEntry(
    "free-book",
    [
      ["kind", "book"],
      ["slot", "free"],
      ["status", "reading"],
      ["title", '"F"'],
      ["short", '"F"'],
      ["started", "2026-11-09"],
      ["position", "0"],
    ],
    "# F\n\n## 分段\n1. S pp.1–29\n",
  );
  const ends = queueEnds(
    [queuedEntry("no-order", null, 11), queuedEntry("second", 2, 11), freeReading],
    "2026-11-20",
  );
  // 没有在读的 planned 书 → 从 today 起；order 2 在前、null 最后。
  assert.deepEqual([...ends.keys()], ["second", "no-order"]);
  assert.equal(ends.get("second"), "2026-11-21", "11-20 起 2 块 → 11-21");
  assert.equal(ends.get("no-order"), "2026-11-23", "11-22 起 2 块 → 11-23");
  assert.ok(!ends.has("free-book"));
});

test("index --write：排队书的日期在在读的书之后", async () => {
  const vault = await makeVault();
  await writeBook(vault, "reading-book", EPP_FIELDS, EPP_BODY);
  await writeBook(
    vault,
    "queued-book",
    { kind: "book", slot: "planned", order: 2, status: "queued", title: '"Queued"', short: '"Q"', started: '""', position: 0 },
    "# Queued\n\n## 分段\n1. S pp.1–29\n",
  );
  const file = join(vault, "wiki", "shelf", "index.md");
  await b(["index", vault, "--today", "2026-11-10", "--write"]);
  const index = await readFile(file, "utf8");
  const readingEnd = index.match(/\[\[shelf\/reading-book\|.*?\]\] · .*? · 预计 (\d{4}-\d{2}-\d{2}) 读完/);
  const queuedEnd = index.match(/\[\[shelf\/queued-book\|.*?\]\] · .*? · 预计 (\d{4}-\d{2}-\d{2}) 读完/);
  assert.ok(readingEnd !== null && queuedEnd !== null, index);
  assert.equal(readingEnd[1], "2026-11-16");
  assert.equal(queuedEnd[1], "2026-11-19", "从在读书读完（11-16）的次日起 3 块");
  assert.ok(queuedEnd[1] > readingEnd[1], "排队书不能比在读书早读完");
  await rm(vault, { recursive: true, force: true });
});

test("list：排队书的 upcoming 为 []、end 与排队串接一致", async () => {
  const vault = await makeVault();
  await writeBook(vault, "reading-book", EPP_FIELDS, EPP_BODY);
  await writeBook(
    vault,
    "queued-book",
    { kind: "book", slot: "planned", order: 2, status: "queued", title: '"Queued"', short: '"Q"', started: '""', position: 0 },
    "# Queued\n\n## 分段\n1. S pp.1–29\n",
  );
  const list = await jsonB(["list", vault, "--today", "2026-11-10"]);
  const queued = list.find((item) => item.slug === "queued-book");
  const reading = list.find((item) => item.slug === "reading-book");
  assert.deepEqual(queued.upcoming, [], "排队书还没开始，没有日程");
  assert.equal(reading.end, "2026-11-16");
  assert.equal(queued.end, "2026-11-19");
  assert.ok(queued.end > reading.end);
  assert.equal(queued.status, "queued");
  await rm(vault, { recursive: true, force: true });
});

test("plan：对 queued / done 的书报错，且不写文件", async () => {
  const vault = await makeVault();
  const queuedFile = await writeBook(
    vault,
    "queued-book",
    { kind: "book", slot: "planned", order: 1, status: "queued", title: '"Q"', short: '"Q"', started: '""', position: 0 },
    "# Q\n\n## 分段\n1. S pp.1–1\n",
  );
  const doneFile = await writeBook(
    vault,
    "done-book",
    { ...EPP_FIELDS, status: "done", position: 1 },
    "# Done\n\n## 分段\n1. S pp.1–1\n",
  );
  for (const [slug, file] of [
    ["queued-book", queuedFile],
    ["done-book", doneFile],
  ]) {
    const before = await readFile(file, "utf8");
    const fail = await b(["plan", vault, slug, "--today", "2026-11-10", "--write"], { expectFail: true });
    assert.match(fail.stderr, /还在排队（或已读完），开始读时会自动排期/, slug);
    assert.equal(await readFile(file, "utf8"), before, `${slug} 不应被改动`);
  }
  await rm(vault, { recursive: true, force: true });
});

test("经符号链接调用 --help 有输出（主模块判定比真实路径）", async () => {
  // ~/.xuegen/app 这类符号链接下，argv[1] 与 import.meta.url 字面不同；只比字面会静默 exit 0。
  const dir = await mkdtemp(join(tmpdir(), "bookshelf-link-"));
  try {
    const link = join(dir, "app");
    await symlink(HERE, link, "dir");
    const { stdout } = await run("node", [join(link, "bookshelf.mjs"), "--help"], { encoding: "utf8" });
    assert.match(stdout, /书房：整本书自读的排期与进度/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- 布局：wiki/shelf ----

async function writeBookAt(dir, slug, fields, body) {
  const file = join(dir, `${slug}.md`);
  await mkdir(dir, { recursive: true });
  const fm = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  const text = ["---", ...fm, "---", "", body].join("\n");
  await writeFile(file, `${text}${text.endsWith("\n") ? "" : "\n"}`, "utf8");
  return file;
}

test("布局：wiki/shelf 下的书页用于 list 与 index", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const list = await jsonB(["list", vault]);
  assert.deepEqual(list.map((item) => item.slug), ["epp"]);
  const result = await jsonB(["index", vault, "--today", "2026-11-10", "--write"]);
  assert.equal(result.file, join(vault, "wiki", "shelf", "index.md"));
  const index = await readFile(result.file, "utf8");
  assert.ok(index.includes("[[shelf/epp|Epp]]"), index);
  await rm(vault, { recursive: true, force: true });
});

test("布局：只有旧 wiki/书房/ 时 today 不读它（当作书房为空）", async () => {
  const vault = await makeVault();
  const legacy = join(vault, "wiki", "书房");
  await writeBookAt(legacy, "epp", EPP_FIELDS, EPP_BODY);
  assert.deepEqual(await jsonB(["today", vault, "--today", "2026-11-09"]), {
    planned: null,
    free: null,
    guided: [],
  });
  assert.deepEqual(await jsonB(["list", vault]), []);
  await rm(vault, { recursive: true, force: true });
});

// ---- target：可选的目标日期（只和预计读完对比，不改排期）----

test("target：没有 target 时 bookView 两项为 null，文本不写「目标」", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const result = await jsonB(["today", vault, "--today", "2026-11-09"]);
  assert.equal(result.planned.target, null);
  assert.equal(result.planned.targetLate, null);
  const list = await jsonB(["list", vault, "--today", "2026-11-09"]);
  assert.equal(list[0].target, null);
  assert.equal(list[0].targetLate, null);
  const text = await b(["today", vault, "--today", "2026-11-09"]);
  assert.doesNotMatch(text.stdout, /目标/);
  const { stdout: index } = await b(["index", vault, "--today", "2026-11-09"]);
  assert.doesNotMatch(index, /目标/);
  await rm(vault, { recursive: true, force: true });
});

test("target：早于预计读完 → targetLate 是差的天数，list/today/index 都写「晚 N 天」", async () => {
  const vault = await makeVault();
  // started 11-09、7 块、today 11-09 → 预计 11-15 读完；目标 11-12 → 晚 3 天。
  await writeBook(vault, "epp", { ...EPP_FIELDS, target: "2026-11-12" }, EPP_BODY);
  const today = await jsonB(["today", vault, "--today", "2026-11-09"]);
  assert.equal(today.planned.target, "2026-11-12");
  assert.equal(today.planned.targetLate, 3);

  const list = await jsonB(["list", vault, "--today", "2026-11-09"]);
  assert.equal(list[0].target, "2026-11-12");
  assert.equal(list[0].targetLate, 3);
  const listText = await b(["list", vault, "--today", "2026-11-09"]);
  assert.match(listText.stdout, /预计 2026-11-15 读完｜目标 2026-11-12，晚 3 天/);

  const todayText = await b(["today", vault, "--today", "2026-11-09"]);
  assert.match(todayText.stdout, /预计 2026-11-15 读完，目标 2026-11-12，晚 3 天/);

  const { stdout: index } = await b(["index", vault, "--today", "2026-11-09"]);
  assert.match(index, /预计 2026-11-15 读完 · 目标 2026-11-12（晚 3 天）/);
  await rm(vault, { recursive: true, force: true });
});

test("target：晚于预计读完 → targetLate 为 0，文字只写「目标 …」不写「晚」", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", { ...EPP_FIELDS, target: "2027-01-15" }, EPP_BODY);
  const today = await jsonB(["today", vault, "--today", "2026-11-09"]);
  assert.equal(today.planned.target, "2027-01-15");
  assert.equal(today.planned.targetLate, 0);
  const listText = await b(["list", vault, "--today", "2026-11-09"]);
  assert.match(listText.stdout, /｜目标 2027-01-15/);
  assert.doesNotMatch(listText.stdout, /晚/, listText.stdout);
  const todayText = await b(["today", vault, "--today", "2026-11-09"]);
  assert.match(todayText.stdout, /预计 2026-11-15 读完，目标 2027-01-15/);
  assert.doesNotMatch(todayText.stdout, /晚/, todayText.stdout);
  const { stdout: index } = await b(["index", vault, "--today", "2026-11-09"]);
  assert.match(index, / · 目标 2027-01-15/);
  assert.doesNotMatch(index, /晚/, index);
  await rm(vault, { recursive: true, force: true });
});

test("target：排队书的 targetLate 按串接的预计读完算，不按今天算", async () => {
  const vault = await makeVault();
  // 在读书 11-09 起 7 块、today 11-10 → 11-16；排队书 3 块从 11-17 起 → 11-19。
  // 目标 11-18 → 晚 1 天（按串接的 11-19，不是从今天起算的 11-12，那样是 0）。
  await writeBook(vault, "reading-book", EPP_FIELDS, EPP_BODY);
  await writeBook(
    vault,
    "queued-book",
    { kind: "book", slot: "planned", order: 2, status: "queued", title: '"Queued"', short: '"Q"', started: '""', position: 0, target: "2026-11-18" },
    "# Queued\n\n## 分段\n1. S pp.1–29\n",
  );
  const list = await jsonB(["list", vault, "--today", "2026-11-10"]);
  const queued = list.find((item) => item.slug === "queued-book");
  assert.equal(queued.end, "2026-11-19");
  assert.equal(queued.target, "2026-11-18");
  assert.equal(queued.targetLate, 1, "按 queueEnds 的 end 算");
  const listText = await b(["list", vault, "--today", "2026-11-10"]);
  assert.match(listText.stdout, /queued-book.*目标 2026-11-18，晚 1 天/);
  const { stdout: index } = await b(["index", vault, "--today", "2026-11-10"]);
  assert.match(index, /\[\[shelf\/queued-book\|Q\]\] · Queued · 0\/3 段 · 预计 2026-11-19 读完 · 目标 2026-11-18（晚 1 天）/);
  await rm(vault, { recursive: true, force: true });
});

test("target：frontmatter 里乱写的值当作没有，不报错", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", { ...EPP_FIELDS, target: "乱写" }, EPP_BODY);
  const today = await jsonB(["today", vault, "--today", "2026-11-09"]);
  assert.equal(today.planned.target, null);
  assert.equal(today.planned.targetLate, null);
  const text = await b(["today", vault, "--today", "2026-11-09"]);
  assert.doesNotMatch(text.stdout, /目标/);
  await rm(vault, { recursive: true, force: true });
});

test("target 命令：--date 写入裸日期，--clear 清空，其余字段不动", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const text = await b(["target", vault, "epp", "--date", "2026-11-12", "--today", "2026-11-09"]);
  assert.match(text.stdout, /^target: epp 目标 2026-11-12$/m);
  const page = await readBook(vault, "epp");
  assert.match(page, /^target: 2026-11-12$/m, "target 写成裸日期，不加引号");
  assert.match(page, /^position: 0$/m);
  assert.match(page, /^started: 2026-11-09$/m);
  assert.match(page, /^title: "Discrete Mathematics with Applications"$/m);
  assert.ok(existsSync(join(vault, "wiki", "shelf", "index.md")), "target 后应重写 index.md");

  const set = await jsonB(["target", vault, "epp", "--date", "2026-11-12", "--today", "2026-11-09"]);
  assert.deepEqual(set, {
    slug: "epp",
    target: "2026-11-12",
    end: "2026-11-15",
    targetLate: 3,
    committed: "skipped",
  });

  const cleared = await jsonB(["target", vault, "epp", "--clear", "--today", "2026-11-09"]);
  assert.equal(cleared.target, null);
  assert.equal(cleared.targetLate, null);
  const after = await readBook(vault, "epp");
  assert.match(after, /^target: ""$/m, "--clear 后 target 留空值");
  const clearedText = await b(["target", vault, "epp", "--clear", "--today", "2026-11-09"]);
  assert.match(clearedText.stdout, /^target: epp 不设目标$/m);
  await rm(vault, { recursive: true, force: true });
});

test("target 命令：坏日期、两个都没给或都给了 → 报错且不动文件", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const before = await readBook(vault, "epp");
  const badDate = await b(["target", vault, "epp", "--date", "2026-13-40"], { expectFail: true });
  assert.equal(badDate.code !== 0, true);
  assert.match(badDate.stderr, /目标日期要写成 YYYY-MM-DD/);
  const noDate = await b(["target", vault, "epp", "--date"], { expectFail: true });
  assert.match(noDate.stderr, /目标日期要写成 YYYY-MM-DD/);
  const both = await b(["target", vault, "epp", "--date", "2026-11-12", "--clear"], { expectFail: true });
  assert.match(both.stderr, /--date <日期> 或 --clear 二选一/);
  const neither = await b(["target", vault, "epp"], { expectFail: true });
  assert.match(neither.stderr, /--date <日期> 或 --clear 二选一/);
  assert.equal(await readBook(vault, "epp"), before, "报错时不应改动书页");
  await rm(vault, { recursive: true, force: true });
});

test("done：有 target 的书记一段后 target 不丢，index 仍显示目标", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", { ...EPP_FIELDS, target: "2026-11-12" }, EPP_BODY);
  await jsonB(["done", vault, "epp", "--today", "2026-11-10"]);
  const page = await readBook(vault, "epp");
  assert.match(page, /^target: 2026-11-12$/m);
  assert.match(page, /^position: 1$/m);
  const index = await readFile(join(vault, "wiki", "shelf", "index.md"), "utf8");
  assert.match(index, /目标 2026-11-12/);
  await rm(vault, { recursive: true, force: true });
});

test("index：读完的书不显示目标", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "done-book",
    { ...EPP_FIELDS, status: "done", position: 7, target: "2026-11-12" },
    "# Done\n\n## 分段\n1. Ch1 pp.1–36\n2. Ch2 pp.37–65\n\n## 读书记录\n- 2026-11-12: 第 7 段 pp.57–65 读完（用户自报）\n",
  );
  const { stdout: index } = await b(["index", vault, "--today", "2026-11-15"]);
  assert.match(index, /2026-11-12 读完/);
  assert.doesNotMatch(index, /目标/, index);
  await rm(vault, { recursive: true, force: true });
});

// ---- list --from/--to：每段的日子（schedule）----

test("list --from/--to：在读书给每段的日子（已读按记录日、过去没读按原定日、今天起顺延）", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "epp",
    { ...EPP_FIELDS, position: 2 },
    "# Epp\n\n## 分段\n1. Ch1 pp.1–36\n2. Ch2 pp.37–65\n\n## 读书记录\n- 2026-11-09: 第 1 段 pp.1–9 读完（用户自报）\n- 2026-11-11: 第 2 段 pp.10–18 读完（用户自报）\n",
  );
  const list = await jsonB(["list", vault, "--today", "2026-11-12", "--from", "2026-11-09", "--to", "2026-11-13"]);
  const epp = list.find((item) => item.slug === "epp");
  // 块 2 晚了一天读（11-11）。块 3 的原定日子 11-11 已经过去还没读 → 那天标 missed
  //；同一块顺延到今天的 11-12 再出现一行（设计如此）。块 4 顺延到 11-13。
  assert.deepEqual(
    epp.schedule.map((row) => [row.index, row.date, row.done, row.missed === true]),
    [
      [1, "2026-11-09", true, false],
      [2, "2026-11-11", true, false],
      [3, "2026-11-11", false, true],
      [3, "2026-11-12", false, false],
      [4, "2026-11-13", false, false],
    ],
  );
  assert.equal(epp.schedule[0].title, "Ch1");
  assert.deepEqual([epp.schedule[0].from, epp.schedule[0].to], [1, 9]);
  // 顺延后的日期是连续的原定日之后的：明天的段就是今天那段的下一个段。
  assert.deepEqual(
    epp.schedule.filter((row) => row.date >= "2026-11-12").map((row) => [row.date, row.index]),
    [
      ["2026-11-12", 3],
      ["2026-11-13", 4],
    ],
  );
  await rm(vault, { recursive: true, force: true });
});

test("list --from/--to：一段没读时，今天按顺延后的排期（今天是第 1 段，不是第 4 段）", async () => {
  const vault = await makeVault();
  // 设计稿的例子：Epp 11-09 起、一段都没读，今天 11-12 该读第 1 段。
  await writeBook(vault, "epp", { ...EPP_FIELDS, position: 0 }, EPP_BODY);
  const list = await jsonB(["list", vault, "--today", "2026-11-12", "--from", "2026-11-09", "--to", "2026-11-13"]);
  const epp = list.find((item) => item.slug === "epp");
  assert.deepEqual(
    epp.schedule.map((row) => [row.date, row.index, row.missed === true]),
    [
      ["2026-11-09", 1, true],
      ["2026-11-10", 2, true],
      ["2026-11-11", 3, true],
      ["2026-11-12", 1, false],
      ["2026-11-13", 2, false],
    ],
  );
  await rm(vault, { recursive: true, force: true });
});

test("list --from/--to：排队书按 queueEnds 串接的起点每天一段", async () => {
  const vault = await makeVault();
  await writeBook(vault, "reading-book", EPP_FIELDS, EPP_BODY);
  await writeBook(
    vault,
    "queued-book",
    { kind: "book", slot: "planned", order: 2, status: "queued", title: '"Queued"', short: '"Q"', started: '""', position: 0 },
    "# Queued\n\n## 分段\n1. S pp.1–29\n",
  );
  const list = await jsonB(["list", vault, "--today", "2026-11-10", "--from", "2026-11-15", "--to", "2026-11-20"]);
  const queued = list.find((item) => item.slug === "queued-book");
  // 在读书 11-16 预计读完，排队书 11-17 起、3 段。
  assert.deepEqual(
    queued.schedule.map((row) => [row.index, row.date, row.done]),
    [
      [1, "2026-11-17", false],
      [2, "2026-11-18", false],
      [3, "2026-11-19", false],
    ],
  );
  await rm(vault, { recursive: true, force: true });
});

test("list --from/--to：读完的书只给已读的行", async () => {
  const vault = await makeVault();
  await writeBook(
    vault,
    "done-book",
    { ...EPP_FIELDS, status: "done", position: 3 },
    "# Done\n\n## 分段\n1. S pp.1–29\n\n## 读书记录\n- 2026-11-08: 第 1 段 pp.1–10 读完（用户自报）\n- 2026-11-09: 第 2 段 pp.11–20 读完（用户自报）\n- 2026-11-10: 第 3 段 pp.21–29 读完（用户自报）\n",
  );
  const list = await jsonB(["list", vault, "--today", "2026-11-11", "--from", "2026-11-01", "--to", "2026-11-30"]);
  const done = list.find((item) => item.slug === "done-book");
  assert.deepEqual(
    done.schedule.map((row) => [row.index, row.date, row.done]),
    [
      [1, "2026-11-08", true],
      [2, "2026-11-09", true],
      [3, "2026-11-10", true],
    ],
  );
  await rm(vault, { recursive: true, force: true });
});

test("list --from/--to：范围外 schedule 是空数组；不给参数时没有 schedule 键", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const ranged = await jsonB(["list", vault, "--today", "2026-11-10", "--from", "2026-12-01", "--to", "2026-12-07"]);
  assert.deepEqual(ranged.find((item) => item.slug === "epp").schedule, []);
  const plain = await jsonB(["list", vault, "--today", "2026-11-10"]);
  assert.ok(!("schedule" in plain.find((item) => item.slug === "epp")), "不给 --from/--to 时不得出现 schedule 键");
  await rm(vault, { recursive: true, force: true });
});

test("list --from/--to：坏日期、只给一个、from 晚于 to 都报错", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  for (const [args, pattern] of [
    [["--from", "2026-13-01", "--to", "2026-11-10"], /日期非法/],
    [["--from", "not-a-date", "--to", "2026-11-10"], /日期非法/],
    [["--from", "2026-11-10"], /一起给/],
    [["--to", "2026-11-10"], /一起给/],
    [["--from", "2026-11-12", "--to", "2026-11-10"], /晚于/],
  ]) {
    const fail = await b(["list", vault, "--today", "2026-11-10", ...args], { expectFail: true });
    // expectFail 会把「命令其实成功了」吞成空 stderr；断 stderr 才能确定是真失败。
    assert.match(fail.stderr, pattern, `${args.join(" ")} 应报对应错误`);
  }
  await rm(vault, { recursive: true, force: true });
});

// ---- pause / resume：暂停＝停在当前进度不再往后排；恢复后从明天接着排 ----

// 读到一半的书：position 2（第 1、2 段有记录），共 7 块 → 原下一段是第 3 块（Ch1 pp.19–27）。
const MID_BODY =
  "# Epp\n\n## 分段\n1. Ch1 pp.1–36\n2. Ch2 pp.37–65\n\n## 读书记录\n" +
  "- 2026-11-08: 第 1 段 pp.1–9 读完（用户自报）\n" +
  "- 2026-11-09: 第 2 段 pp.10–18 读完（用户自报）\n";
const MID_FIELDS = { ...EPP_FIELDS, position: 2 };

const QUEUED_FIELDS = {
  kind: "book",
  slot: "planned",
  order: 2,
  status: "queued",
  title: '"Q"',
  short: '"Q"',
  started: '""',
  position: 0,
};

test("pause：在读书暂停 → status paused、记「暂停」、index 有「暂停」、today 不再出段", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", MID_FIELDS, MID_BODY);
  const result = await jsonB(["pause", vault, "epp", "--today", "2026-11-10"]);
  assert.equal(result.slug, "epp");
  assert.equal(result.status, "paused");
  assert.equal(result.position, 2);

  const page = await readBook(vault, "epp");
  assert.match(page, /^status: paused$/m);
  assert.match(page, /^position: 2$/m, "暂停不动 position");
  assert.match(page, /^- 2026-11-10: 暂停$/m);

  // index.md 由 pause 重写：epp 进「暂停」一组。
  const index = await readFile(join(vault, "wiki", "shelf", "index.md"), "utf8");
  assert.match(index, /^## 暂停$/m);
  assert.match(index, /^- \[\[shelf\/epp\|Epp\]\] · .*? · 2\/7 段 · 已暂停$/m, index);

  // today 不给暂停的书出今天的段。
  const today = await jsonB(["today", vault, "--today", "2026-11-10"]);
  assert.equal(today.planned, null);
  await rm(vault, { recursive: true, force: true });
});

test("pause：queued / paused / done 的书报错，文件不动", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", MID_FIELDS, MID_BODY);
  await writeBook(vault, "queued-book", QUEUED_FIELDS, "# Q\n\n## 分段\n1. S pp.1–29\n");
  await writeBook(
    vault,
    "done-book",
    { ...EPP_FIELDS, order: 3, status: "done", position: 1 },
    "# Done\n\n## 分段\n1. S pp.1–1\n\n## 读书记录\n- 2026-11-08: 第 1 段 pp.1–1 读完（用户自报）\n",
  );
  await b(["pause", vault, "epp", "--today", "2026-11-10"]);
  for (const slug of ["epp", "queued-book", "done-book"]) {
    const before = await readBook(vault, slug);
    const fail = await b(["pause", vault, slug, "--today", "2026-11-10"], { expectFail: true });
    assert.match(fail.stderr, /只有在读的书可以暂停/, slug);
    assert.equal(await readBook(vault, slug), before, `${slug} 不应被改动`);
  }
  await rm(vault, { recursive: true, force: true });
});

test("pause：计划内书暂停仍占位——paused 书 end 空串、upcoming []，排队书不提前也不开", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", MID_FIELDS, MID_BODY);
  await writeBook(vault, "queued-book", QUEUED_FIELDS, "# Q\n\n## 分段\n1. S pp.1–29\n");
  await b(["pause", vault, "epp", "--today", "2026-11-10"]);

  const list = await jsonB(["list", vault, "--today", "2026-11-10"]);
  const paused = list.find((item) => item.slug === "epp");
  const queued = list.find((item) => item.slug === "queued-book");
  assert.equal(paused.status, "paused");
  assert.deepEqual(paused.upcoming, []);
  // 「没日期」与 done 书一样始终是字符串：空串（同排队书 started "" 的写法），不是 null。
  assert.equal(paused.end, "");
  assert.equal(paused.target, null);
  assert.equal(paused.targetLate, null);
  // 暂停仍占位：排队书不从今天起算（预计读完没法给 → 空串），也不会被自动开。
  assert.equal(queued.status, "queued");
  assert.equal(queued.end, "");
  const queuedPage = await readBook(vault, "queued-book");
  assert.match(queuedPage, /^status: queued$/m);
  assert.doesNotMatch(queuedPage, /^started: 2026/m, "排队书不应被排上");
  assert.doesNotMatch(queuedPage, /xuegen:shelf:start/, "排队书不应被写入排期");
  await rm(vault, { recursive: true, force: true });
});

test("queueEnds：计划内书暂停仍占位，排队书没有预计读完（空串）", () => {
  const paused = shelfEntry(
    "paused-book",
    [
      ["kind", "book"],
      ["slot", "planned"],
      ["order", "1"],
      ["status", "paused"],
      ["title", '"P"'],
      ["short", '"P"'],
      ["started", "2026-11-09"],
      ["position", "2"],
    ],
    MID_BODY,
  );
  const ends = queueEnds([paused, queuedEntry("q1", 2, 29), queuedEntry("q2", 3, 11)], "2026-11-12");
  assert.equal(ends.get("q1"), "", "暂停的书没法预计恢复日，排队书也就没法预计读完");
  assert.equal(ends.get("q2"), "");
});

test("resume：恢复 → status reading、started = 明天 − 已读段数、排期从明天接着排", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", MID_FIELDS, MID_BODY);
  await b(["pause", vault, "epp", "--today", "2026-11-10"]);
  const result = await jsonB(["resume", vault, "epp", "--today", "2026-11-12"]);
  assert.equal(result.slug, "epp");
  assert.equal(result.status, "reading");
  assert.equal(result.position, 2);
  // 明天 11-13 − 已读 2 段 = 11-11；这样第 3 段（原来的下一段）正好落在 11-13。
  assert.equal(result.started, "2026-11-11");

  const page = await readBook(vault, "epp");
  assert.match(page, /^status: reading$/m);
  assert.match(page, /^started: 2026-11-11$/m);
  assert.match(page, /^- 2026-11-12: 恢复，明天接着读$/m);
  // 重写后的排期：已读段仍按记录日，未读段从明天（11-13）起每天一块。
  assert.match(page, /^\| 1 \| 2026-11-08 \| Ch1 pp\.1–9 \|$/m);
  assert.match(page, /^\| 3 \| 2026-11-13 \| Ch1 pp\.19–27 \|$/m, "明天那段是原来的下一段");
  assert.match(page, /^\| 4 \| 2026-11-14 \|/m);

  // index 重写：epp 回到「在读」，没有「暂停」组。
  const index = await readFile(join(vault, "wiki", "shelf", "index.md"), "utf8");
  const readingSection = index.slice(index.indexOf("## 在读"), index.indexOf("## 暂停"));
  assert.ok(readingSection.includes("[[shelf/epp|Epp]]"), readingSection);
  await rm(vault, { recursive: true, force: true });
});

test("resume：恢复后 today/upcoming 的下一段是原来的下一段（明天起）", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", MID_FIELDS, MID_BODY);
  await b(["pause", vault, "epp", "--today", "2026-11-10"]);
  await b(["resume", vault, "epp", "--today", "2026-11-12"]);
  const today = await jsonB(["today", vault, "--today", "2026-11-12"]);
  assert.equal(today.planned.slug, "epp");
  assert.equal(today.planned.chunk.index, 3, "下一段仍是暂停前的下一段");
  assert.equal(today.planned.end, "2026-11-17", "明天 11-13 起剩 5 块 → 11-17");
  const list = await jsonB(["list", vault, "--today", "2026-11-12"]);
  const item = list.find((entry) => entry.slug === "epp");
  assert.equal(item.upcoming[0].index, 3);
  assert.equal(item.upcoming[0].date, "2026-11-13");
  assert.equal(item.end, "2026-11-17");
  await rm(vault, { recursive: true, force: true });
});

test("resume：reading / queued / done 的书报错", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", MID_FIELDS, MID_BODY);
  await writeBook(vault, "queued-book", QUEUED_FIELDS, "# Q\n\n## 分段\n1. S pp.1–29\n");
  await writeBook(
    vault,
    "done-book",
    { ...EPP_FIELDS, order: 3, status: "done", position: 1 },
    "# Done\n\n## 分段\n1. S pp.1–1\n\n## 读书记录\n- 2026-11-08: 第 1 段 pp.1–1 读完（用户自报）\n",
  );
  for (const slug of ["epp", "queued-book", "done-book"]) {
    const fail = await b(["resume", vault, slug, "--today", "2026-11-12"], { expectFail: true });
    assert.match(fail.stderr, /只有暂停的书可以恢复/, slug);
  }
  await rm(vault, { recursive: true, force: true });
});

test("resume：恢复当天 today 标 resumedToday，文字说「今天恢复，明天从…接着读」；次日恢复普通「下一段」", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", MID_FIELDS, MID_BODY);
  await b(["pause", vault, "epp", "--today", "2026-11-12"]);
  await b(["resume", vault, "epp", "--today", "2026-11-13"]);

  const resumed = await jsonB(["today", vault, "--today", "2026-11-13"]);
  assert.equal(resumed.planned.resumedToday, true, "恢复当天要标出来");
  assert.equal(resumed.planned.chunk.index, 3, "下一段仍是原来的下一段");
  const text = (await b(["today", vault, "--today", "2026-11-13"])).stdout;
  assert.match(text, /今天恢复，明天从 Ch1 pp\.19–27 接着读/, text);
  assert.doesNotMatch(text, /下一段/, "恢复当天不再说「下一段」读于今天");

  // 次日：恢复记录是昨天的，today 恢复普通说法。
  const next = await jsonB(["today", vault, "--today", "2026-11-14"]);
  assert.equal(next.planned.resumedToday, false);
  const nextText = (await b(["today", vault, "--today", "2026-11-14"])).stdout;
  assert.match(nextText, /下一段 Ch1 pp\.19–27/, nextText);
  await rm(vault, { recursive: true, force: true });
});

// ---- jj：写命令写完各记一笔（库是 jj 仓库时）----

const hasJj = (() => {
  try {
    execFileSync("jj", ["--version"], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
})();
const jjTest = hasJj ? test : (name) => skip(`${name}（本机没有 jj，跳过）`);

/** 临时库 + 独立根目录（jj 配置写在库外）。 */
async function makeJjVault() {
  const root = await mkdtemp(join(tmpdir(), "bookshelf-jj-"));
  const vault = join(root, "vault");
  await mkdir(join(vault, "wiki"), { recursive: true });
  return { root, vault };
}

/** 在临时库里 `jj git init` 并把当前文件提交成基线；返回 { env, jj }。 */
async function initJj(vault, root) {
  const config = join(root, "jj-config.toml");
  await writeFile(config, 'user.name = "书房测试"\nuser.email = "test@example.com"\n');
  const env = { JJ_CONFIG: config };
  const jj = (args) =>
    execFileSync("jj", args, { cwd: vault, encoding: "utf8", env: { ...process.env, ...env } });
  jj(["git", "init"]);
  jj(["commit", "-m", "基线"]);
  return { env, jj };
}

/** 最近一笔提交（@-）的说明与改动文件列表。 */
function lastCommit(jj) {
  return {
    description: jj(["log", "-r", "@-", "--no-graph", "-T", "description"]).trim(),
    files: jj(["diff", "-r", "@-", "--summary"])
      .trim()
      .split("\n")
      .map((line) => line.slice(1).trim())
      .sort(),
  };
}

test("非 jj 库：八个写命令 JSON 都有 committed: skipped，文件照写", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const cases = [
    ["done", vault, "epp", "--today", "2026-11-10"],
    ["after", "add", vault, "epp", "--label", "§1.1", "--pages", "1–5", "--course", "dm", "--date", "2026-11-10", "--today", "2026-11-10"],
    ["after", "done", vault, "epp", "--index", "1", "--today", "2026-11-11"],
    ["extract", vault, "epp", "--page", "5", "--text", "句子", "--today", "2026-11-11"],
    ["card", vault, "epp", "--index", "1", "--today", "2026-11-11"],
    ["pause", vault, "epp", "--today", "2026-11-12"],
    ["resume", vault, "epp", "--today", "2026-11-13"],
    ["target", vault, "epp", "--date", "2026-12-01", "--today", "2026-11-13"],
  ];
  for (const args of cases) {
    const result = await jsonB(args);
    assert.equal(result.committed, "skipped", args.join(" "));
  }
  // 文件照写：读书记录、课后读勾行、摘录、状态都在。
  const page = await readBook(vault, "epp");
  assert.match(page, /^position: 1$/m);
  assert.match(page, /^- \[x\] §1\.1 · pp\.1–5 · dm · 2026-11-10 · 读于 2026-11-11$/m);
  assert.match(page, /^- p\.5: 句子 #卡\/2026-11-11$/m);
  assert.match(page, /^status: reading$/m, "pause 后 resume 恢复");
  assert.match(page, /^target: 2026-12-01$/m);
  await rm(vault, { recursive: true, force: true });
});

test("非 jj 库：文字输出末尾加「（没有记进 jj：库不是 jj 仓库）」", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  const { stdout } = await b(["done", vault, "epp", "--today", "2026-11-10"]);
  assert.match(stdout, /^done: epp 第 1\/7 段$/m);
  assert.match(stdout, /^（没有记进 jj：库不是 jj 仓库）$/m);
  await rm(vault, { recursive: true, force: true });
});

test("extract / target 之后 index.md 被重画（预计日期与 list 一致）", async () => {
  const vault = await makeVault();
  await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
  // 先写一份按 11-09 算的旧 index（预计 11-15），随后用更晚的 today 跑写命令。
  await b(["index", vault, "--today", "2026-11-09", "--write"]);
  const indexFile = join(vault, "wiki", "shelf", "index.md");
  assert.match(await readFile(indexFile, "utf8"), /预计 2026-11-15 读完/);

  await jsonB(["extract", vault, "epp", "--page", "5", "--text", "句子", "--today", "2026-11-20"]);
  const listAfterExtract = await jsonB(["list", vault, "--today", "2026-11-20"]);
  const indexAfterExtract = await readFile(indexFile, "utf8");
  assert.match(
    indexAfterExtract,
    new RegExp(`预计 ${listAfterExtract[0].end} 读完`),
    "extract 后 index 应按新 today 重画",
  );

  await jsonB(["target", vault, "epp", "--date", "2026-11-21", "--today", "2026-11-21"]);
  const listAfterTarget = await jsonB(["list", vault, "--today", "2026-11-21"]);
  const indexAfterTarget = await readFile(indexFile, "utf8");
  assert.match(indexAfterTarget, new RegExp(`预计 ${listAfterTarget[0].end} 读完`));
  assert.match(indexAfterTarget, /目标 2026-11-21/);
  await rm(vault, { recursive: true, force: true });
});

jjTest("jj：done 记一笔「读书 epp <today>」，只收书页与 index.md，无关改动留在工作副本", async () => {
  const { root, vault } = await makeJjVault();
  try {
    await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
    const { env, jj } = await initJj(vault, root);
    // 库里另一个无关的未提交改动（用户在 Obsidian 里写的）。
    await writeFile(join(vault, "wiki", "note.md"), "# 手写未提交\n");

    const result = await jsonB(["done", vault, "epp", "--today", "2026-11-17"], { env });
    assert.equal(result.committed, "ok");

    const commit = lastCommit(jj);
    assert.equal(commit.description, "读书 epp 2026-11-17");
    assert.deepEqual(commit.files, ["wiki/shelf/epp.md", "wiki/shelf/index.md"]);

    const status = jj(["st"]);
    assert.match(status, /wiki\/note\.md/, "无关改动仍在工作副本");
    assert.doesNotMatch(status, /wiki\/shelf/, "本次文件已被提交");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

jjTest("jj：after add / after done / extract 各一笔，说明正确", async () => {
  const { root, vault } = await makeJjVault();
  try {
    await writeBook(vault, "epp", EPP_FIELDS, EPP_BODY);
    const { env, jj } = await initJj(vault, root);

    const add = await jsonB(
      ["after", "add", vault, "epp", "--label", "§1.1", "--pages", "1–5", "--course", "dm", "--date", "2026-11-16", "--today", "2026-11-16"],
      { env },
    );
    assert.equal(add.committed, "ok");
    const done = await jsonB(["after", "done", vault, "epp", "--index", "1", "--today", "2026-11-17"], { env });
    assert.equal(done.committed, "ok");
    const ext = await jsonB(["extract", vault, "epp", "--page", "5", "--text", "句子", "--today", "2026-11-17"], { env });
    assert.equal(ext.committed, "ok");

    const descriptions = jj(["log", "--no-graph", "-T", 'description ++ "\\n"'])
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    assert.deepEqual(descriptions, [
      "摘录 epp 2026-11-17",
      "课后读 epp 2026-11-17",
      "排课后读 epp 2026-11-16",
      "基线",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

jjTest("jj：读完最后一段自动开下一本，两本书页在同一笔里", async () => {
  const { root, vault } = await makeJjVault();
  try {
    await writeBook(vault, "last", { ...EPP_FIELDS, order: 1, position: 6 }, EPP_BODY);
    await writeBook(
      vault,
      "next-book",
      { kind: "book", slot: "planned", order: 2, status: "queued", title: '"Next"', short: '"N"', started: '""', position: 0 },
      "# Next\n\n## 分段\n1. S1 pp.1–29\n\n## 读书记录\n",
    );
    const { env, jj } = await initJj(vault, root);

    const result = await jsonB(["done", vault, "last", "--today", "2026-11-17"], { env });
    assert.equal(result.committed, "ok");
    assert.equal(result.next, "next-book");

    const commit = lastCommit(jj);
    assert.equal(commit.description, "读书 last 2026-11-17");
    assert.deepEqual(commit.files, [
      "wiki/shelf/index.md",
      "wiki/shelf/last.md",
      "wiki/shelf/next-book.md",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- 导读书（slot: guided）----

// 导读书的常用字段与正文：周二四读，一段 = 分段一行（不按 10 页切）。
const GUIDED_FIELDS = {
  kind: "book",
  slot: "guided",
  status: "reading",
  subject: "data-structures-algorithms",
  days: "tue,thu",
  limit: 45,
  title: '"算法（第 4 版）"',
  short: '"算法"',
  started: "2026-11-15",
  position: 0,
};
const GUIDED_BODY =
  "# 算法\n\n## 分段\n" +
  "1. §1.1–1.2 概览 pp.4–73\n" +
  "2. §1.3 背包、队列和栈 pp.74–107\n" +
  "3. §1.4 算法分析 pp.108–135\n" +
  "4. §1.5 union-find pp.136–151\n" +
  "\n## 读书记录\n";

test("导读：today 在导读日列出、非导读日不列；view 带 subject/days/limit/nextDay", async () => {
  const vault = await makeVault();
  await writeBook(vault, "sedgewick", GUIDED_FIELDS, GUIDED_BODY);
  // 2026-11-17 是周二（导读日）：列出，下一段是整段 1（不按 10 页切）。
  const tue = await jsonB(["today", vault, "--today", "2026-11-17"]);
  assert.equal(tue.guided.length, 1);
  assert.equal(tue.guided[0].slug, "sedgewick");
  assert.equal(tue.guided[0].slot, "guided");
  assert.equal(tue.guided[0].subject, "data-structures-algorithms");
  assert.equal(tue.guided[0].days, "tue,thu");
  assert.equal(tue.guided[0].limit, 45);
  assert.equal(tue.guided[0].nextDay, "2026-11-17");
  assert.deepEqual(tue.guided[0].chunk, { index: 1, title: "§1.1–1.2 概览", from: 4, to: 73 });
  assert.equal(tue.guided[0].total, 4);
  assert.equal(tue.guided[0].end, "2026-11-26");

  // 2026-11-18 周三不是导读日：不列。
  const wed = await jsonB(["today", vault, "--today", "2026-11-18"]);
  assert.deepEqual(wed.guided, []);

  const text = (await b(["today", vault, "--today", "2026-11-17"])).stdout;
  assert.match(text, /导读：算法（第 4 版）（0\/4 节，下一段 §1\.1–1\.2 概览 pp\.4–73）/);
  await rm(vault, { recursive: true, force: true });
});

test("导读：done 同日两次都成功（不套同日拦截），读完不顶上排队书", async () => {
  const vault = await makeVault();
  await writeBook(vault, "sedgewick", GUIDED_FIELDS, GUIDED_BODY);
  await writeBook(
    vault,
    "queued-book",
    { kind: "book", slot: "planned", order: 1, status: "queued", title: '"Q"', short: '"Q"', started: '""', position: 0 },
    "# Q\n\n## 分段\n1. S pp.1–1\n",
  );
  const first = await jsonB(["done", vault, "sedgewick", "--today", "2026-11-17"]);
  assert.equal(first.position, 1);
  const second = await jsonB(["done", vault, "sedgewick", "--today", "2026-11-17"]);
  assert.equal(second.position, 2, "导读日一次可以读两节");
  const page = await readBook(vault, "sedgewick");
  assert.match(page, /^- 2026-11-17: 第 1 段 pp\.4–73 读完（用户自报）$/m);
  assert.match(page, /^- 2026-11-17: 第 2 段 pp\.74–107 读完（用户自报）$/m);

  // 读完：status done；排队的 planned 书不被顶上（只有 planned 接续）。
  await writeBook(vault, "short", { ...GUIDED_FIELDS, subject: "other", position: 0 }, "# 短\n\n## 分段\n1. S pp.1–1\n\n## 读书记录\n");
  const done = await jsonB(["done", vault, "short", "--today", "2026-11-17"]);
  assert.equal(done.finished, true);
  assert.equal(done.next, null);
  assert.match(await readBook(vault, "queued-book"), /^status: queued$/m);
  await rm(vault, { recursive: true, force: true });
});

test("导读：list --from/--to 的日子只落在 days；index.md 有「## 导读」", async () => {
  const vault = await makeVault();
  await writeBook(vault, "sedgewick", GUIDED_FIELDS, GUIDED_BODY);
  const list = await jsonB(["list", vault, "--today", "2026-11-15", "--from", "2026-11-15", "--to", "2026-12-02"]);
  const book = list.find((item) => item.slug === "sedgewick");
  assert.equal(book.slot, "guided");
  const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
  assert.ok(book.schedule.length > 0);
  for (const row of book.schedule) {
    assert.ok([2, 4].includes(weekdayOf(row.date)), `${row.date} 不是导读日`);
  }
  assert.deepEqual(
    book.schedule.map((row) => [row.index, row.date, row.done]),
    [
      [1, "2026-11-17", false],
      [2, "2026-11-19", false],
      [3, "2026-11-24", false],
      [4, "2026-11-26", false],
    ],
  );
  assert.equal(book.subject, "data-structures-algorithms");
  assert.equal(book.nextDay, "2026-11-17");

  const index = await jsonB(["index", vault, "--today", "2026-11-15"]);
  assert.match(index.text, /^## 导读$/m);
  assert.match(
    index.text,
    /^- \[\[shelf\/sedgewick\|算法\]\] · 算法（第 4 版） · 0\/4 节 · 每周 二、四 · 预计 2026-11-26 读完$/m,
  );
  assert.ok(index.text.indexOf("## 导读") > index.text.indexOf("## 在读"), "导读一节在在读之后");
  await rm(vault, { recursive: true, force: true });
});

test("导读：pause 后 today 不列；resume 后从下一个导读日接着排", async () => {
  const vault = await makeVault();
  await writeBook(vault, "sedgewick", GUIDED_FIELDS, GUIDED_BODY);
  await jsonB(["pause", vault, "sedgewick", "--today", "2026-11-17"]);
  assert.deepEqual((await jsonB(["today", vault, "--today", "2026-11-19"])).guided, []);
  await jsonB(["resume", vault, "sedgewick", "--today", "2026-11-18"]);
  // 周三恢复：下一个导读日是周四 11-19
  const thu = await jsonB(["today", vault, "--today", "2026-11-19"]);
  assert.equal(thu.guided.length, 1);
  assert.equal(thu.guided[0].nextDay, "2026-11-19");
  await rm(vault, { recursive: true, force: true });
});
