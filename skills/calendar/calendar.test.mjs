#!/usr/bin/env node
// calendar.mjs 的测试：node:test + node:assert，无第三方依赖。
// 每个测试在 os.tmpdir() 下建临时 Wiki，覆盖每种来源与空月份，不触碰真实库。
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
const SCRIPT = join(HERE, "calendar.mjs");

async function makeVault() {
  const dir = await mkdtemp(join(tmpdir(), "calendar-test-"));
  await mkdir(join(dir, "wiki"), { recursive: true });
  return dir;
}

async function cal(args, { expectFail = false, input } = {}) {
  const child = run("node", [SCRIPT, ...args], { encoding: "utf8" });
  if (input !== undefined) {
    child.child.stdin.end(input);
  }
  try {
    const { stdout } = await child;
    if (expectFail) assert.fail(`期望失败但成功：${args.join(" ")}\n${stdout}`);
    return stdout;
  } catch (error) {
    if (!expectFail) throw error;
    return error.stderr ?? "";
  }
}

async function jsonCal(args) {
  return JSON.parse(await cal([...args, "--json"]));
}

async function writeCourse(vault, slug, body) {
  const dir = join(vault, "wiki", "courses");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${slug}.md`),
    `<!-- xuegen:course-state — 本文件由 AI 维护。-->\n\n# ${slug}\n\n${body}\n`,
    "utf8",
  );
}

test("month：聚合学习记录与计划表日期行", async () => {
  const vault = await makeVault();
  await writeCourse(
    vault,
    "mono",
    [
      "## This Week",
      "",
      "W1 · 基础｜日期范围：未设定",
      "",
      "- [ ] 任务",
      "",
      "## 计划表（参考）",
      "",
      "| 天 | 日期 | 内容 | 材料 | 完成条件 |",
      "|---|---|---|---|---|",
      "| D1 | 10-21 | 概念讲解 | — | 讲完 |",
      "| D2 | 10-22 | 优化巩固 | 视频 | 复述 |",
      "",
      "## Learning Record",
      "",
      "### 2026-10-22-01",
      "",
      "- 收课。",
    ].join("\n"),
  );

  const { month, days } = await jsonCal(["month", vault, "2026-10"]);
  assert.equal(month, "2026-10");
  assert.deepEqual(Object.keys(days).sort(), ["2026-10-21", "2026-10-22"]);
  assert.deepEqual(days["2026-10-22"].records, [{ course: "mono", heading: "2026-10-22-01" }]);
  assert.deepEqual(days["2026-10-22"].plans, [{ course: "mono", label: "优化巩固" }]);
  assert.deepEqual(days["2026-10-21"].plans, [{ course: "mono", label: "概念讲解" }]);
  await rm(vault, { recursive: true, force: true });
});

test("month：plan 年份取课程上下文（记录年份）", async () => {
  const vault = await makeVault();
  await writeCourse(
    vault,
    "c",
    [
      "## 计划表（参考）",
      "",
      "| D | 日期 | 内容 |",
      "|---|---|---|",
      "| D1 | 03-05 | 早春任务 |",
      "",
      "## Learning Record",
      "",
      "### 2025-03-01-01",
      "",
      "- 记录。",
    ].join("\n"),
  );
  const { days } = await jsonCal(["month", vault, "2025-03"]);
  assert.deepEqual(days["2025-03-05"].plans, [{ course: "c", label: "早春任务" }]);
  await rm(vault, { recursive: true, force: true });
});

test("month：聚合阅读到期（frontmatter due）", async () => {
  const vault = await makeVault();
  const dir = join(vault, "wiki", "reading");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "a.md"),
    '---\nsource: "[[raw/a]]"\npriority: high\nstatus: queued\ndue: 2026-10-05\ninterval_days: 1\nlast_read: ""\nposition: ""\n---\n\n# 文章 A\n',
    "utf8",
  );
  await writeFile(
    join(dir, "b.md"),
    '---\nsource: "[[raw/b]]"\npriority: low\nstatus: done\ndue: ""\ninterval_days: 1\nlast_read: 2026-10-02\nposition: ""\n---\n\n# 文章 B\n',
    "utf8",
  );
  const { days } = await jsonCal(["month", vault, "2026-10"]);
  assert.deepEqual(days["2026-10-05"].readingDue, [{ slug: "a", title: "文章 A" }]);
  assert.ok(!days["2026-10-02"], "done 且 due 为空的条目不产生日期");
  await rm(vault, { recursive: true, force: true });
});

test("month：聚合 log.md 的日期小节", async () => {
  const vault = await makeVault();
  await writeFile(
    join(vault, "wiki", "log.md"),
    "# Wiki Activity Log\n\n## [2026-10-09] ingest | 某文章\n\n内容。\n\n## [2026-11-01] create | 下月\n\n内容。\n",
    "utf8",
  );
  const { days } = await jsonCal(["month", vault, "2026-10"]);
  assert.deepEqual(days["2026-10-09"].log, ["ingest | 某文章"]);
  assert.ok(!days["2026-11-01"], "不落入其他月份");
  await rm(vault, { recursive: true, force: true });
});

test("month：备注来自 wiki/calendar 笔记正文", async () => {
  const vault = await makeVault();
  const dir = join(vault, "wiki", "calendar");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "2026-10-12.md"), "---\ndate: 2026-10-12\n---\n\n今天记一笔。\n", "utf8");
  const { days } = await jsonCal(["month", vault, "2026-10"]);
  assert.equal(days["2026-10-12"].note, "今天记一笔。");
  await rm(vault, { recursive: true, force: true });
});

test("month：空月份返回空 days", async () => {
  const vault = await makeVault();
  const { month, days } = await jsonCal(["month", vault, "2026-02"]);
  assert.equal(month, "2026-02");
  assert.deepEqual(days, {});
  await rm(vault, { recursive: true, force: true });
});

test("month：月份格式非法报错", async () => {
  const vault = await makeVault();
  const err = await cal(["month", vault, "2026-2"], { expectFail: true });
  assert.match(err, /月份格式非法/);
  await rm(vault, { recursive: true, force: true });
});

test("get：单日详情只返回该日", async () => {
  const vault = await makeVault();
  await writeFile(join(vault, "wiki", "log.md"), "## [2026-10-09] create | X\n", "utf8");
  const { date, log, records } = await jsonCal(["get", vault, "2026-10-09"]);
  assert.equal(date, "2026-10-09");
  assert.deepEqual(log, ["create | X"]);
  assert.deepEqual(records, []);

  const empty = await jsonCal(["get", vault, "2026-10-10"]);
  assert.equal(empty.note, null);
  assert.deepEqual(empty.plans, []);
  await rm(vault, { recursive: true, force: true });
});

test("write --text：创建带 frontmatter 的笔记", async () => {
  const vault = await makeVault();
  await cal(["write", vault, "2026-11-05", "--text", "周五：复习 BA"]);
  const file = join(vault, "wiki", "calendar", "2026-11-05.md");
  assert.ok(existsSync(file));
  const text = await readFile(file, "utf8");
  assert.match(text, /^---\ndate: 2026-11-05\n---$/m);
  assert.match(text, /周五：复习 BA/);
  await rm(vault, { recursive: true, force: true });
});

test("write --stdin：从标准输入写入", async () => {
  const vault = await makeVault();
  await cal(["write", vault, "2026-11-06", "--stdin"], { input: "在周五安排：看完 Paolo 那篇。\n" });
  const text = await readFile(join(vault, "wiki", "calendar", "2026-11-06.md"), "utf8");
  assert.match(text, /看完 Paolo 那篇。/);
  await rm(vault, { recursive: true, force: true });
});

test("write：空白正文删除已有文件", async () => {
  const vault = await makeVault();
  const file = join(vault, "wiki", "calendar", "2026-11-07.md");
  await cal(["write", vault, "2026-11-07", "--text", "先写点东西"]);
  assert.ok(existsSync(file));
  const out = await cal(["write", vault, "2026-11-07", "--text", "   \n  "]);
  assert.match(out, /已删除/);
  assert.ok(!existsSync(file), "空白正文应删除文件");
  await rm(vault, { recursive: true, force: true });
});

test("write：日期非法报错；非库根目录拒绝", async () => {
  const vault = await makeVault();
  const bad = await cal(["write", vault, "2026-13-40", "--text", "x"], { expectFail: true });
  assert.match(bad, /日期格式非法/);

  const dir = await mkdtemp(join(tmpdir(), "calendar-test-"));
  const notVault = await cal(["month", dir, "2026-10"], { expectFail: true });
  assert.match(notVault, /不是 Wiki 库根目录/);
  await rm(vault, { recursive: true, force: true });
  await rm(dir, { recursive: true, force: true });
});

test("write：原子写入无残留临时文件", async () => {
  const vault = await makeVault();
  await cal(["write", vault, "2026-11-08", "--text", "内容"]);
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(join(vault, "wiki", "calendar"));
  assert.ok(entries.every((name) => !name.includes(".tmp-")), `残留：${entries}`);
  await rm(vault, { recursive: true, force: true });
});

test("讲后读：Today 里未勾选的讲后读进当天 readingDue", async () => {
  const vault = await makeVault();
  await writeCourse(
    vault,
    "mono",
    [
      "## Today",
      "",
      "- 日期：2026-11-08",
      "",
      "- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（核心页已定：pp.1–5）",
      "- [x] 讲后读 §0 · 2026-11-09 读",
    ].join("\n"),
  );

  const day = await jsonCal(["get", vault, "2026-11-10"]);
  assert.deepEqual(day.readingDue, [{ slug: "mono#讲后读-1", title: "讲后读 · §1.1–1.4 · mono" }]);

  const prev = await jsonCal(["get", vault, "2026-11-09"]);
  assert.deepEqual(prev.readingDue, []);
  await rm(vault, { recursive: true, force: true });
});

test("讲后读：范围去掉「核心页」，带页码的照原样；书名不套括号", async () => {
  const vault = await makeVault();
  await writeCourse(
    vault,
    "discrete-math-epp",
    [
      "## Today",
      "",
      "- [ ] 讲后读 §2.4 pp.56–63 · 2026-11-12 读（完成条件：读完）",
      "- [ ] 讲后读 §2.3 核心页 · 2026-11-13 读",
    ].join("\n"),
  );

  const first = await jsonCal(["get", vault, "2026-11-12"]);
  assert.deepEqual(first.readingDue, [
    { slug: "discrete-math-epp#讲后读-1", title: "讲后读 · §2.4 pp.56–63 · discrete-math-epp" },
  ]);
  const second = await jsonCal(["get", vault, "2026-11-13"]);
  assert.deepEqual(second.readingDue, [
    { slug: "discrete-math-epp#讲后读-2", title: "讲后读 · §2.3 · discrete-math-epp" },
  ]);
  await rm(vault, { recursive: true, force: true });
});
