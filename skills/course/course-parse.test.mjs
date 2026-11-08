#!/usr/bin/env node
// course-parse.mjs / course-state.mjs list 的测试：node:test + node:assert，无第三方依赖。
// 在 os.tmpdir() 下建临时库，用真实课程文件的结构构造样例，不触碰真实库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseCourse, listCourses, toListEntry, progressOf } from "./course-parse.mjs";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_SCRIPT = join(HERE, "course-state.mjs");

/** 形态 1：完整课程页——标记、Key Facts、复选框、计划表、学习记录（日期-序号）。 */
const FULL = `<!-- xuegen:course-state — 本文件由 AI 维护（只读锁 0444）。请勿手工编辑。-->

# CTM 学习计划

## Key Facts

- 当前周：W1 · 声明式计算模型
- 当前位置：模块 1a

## Overall Goals

- [ ] 里程碑一
- [x] 里程碑二

## This Week

W1 · 声明式计算模型｜日期范围：未设定

- [ ] 模块 1a（完成条件：能复述概念阶梯）
- [x] 模块 1b（完成条件：能复述内核语言）

## Today

日期：2026-10-17（尚未开始）

- [ ] 继续模块 1a

## Next Session

读 Ch1 并复述概念阶梯。

## 计划表（参考；勾选只出现在上方 Overall Goals / This Week / Today）

### W1 日计划

| 天 | 日期 | 内容 | 材料 | 完成条件 |
|---|---|---|---|---|
| D1 | 10-21 | 概念讲解 | — | 四个模块讲完 |
| D2 | 10-22 | 优化巩固 | 视频 | 独立复述 |

## Learning Record

### 2026-10-16-01

- 迁移归档。
`;

/** 形态 2：无标记、无 frontmatter、只有 This Week 与学习记录。 */
const MINIMAL = `# 简易课程

## Key Facts

- 当前周：W2 · 进阶

## This Week

W2 · 进阶｜日期范围：2026-10-20 至 2026-10-26

- [x] 任务 A
- [ ] 任务 B
- [ ] 任务 C

## Learning Record

### 2026-10-22-02

- 第二次记录。
`;

/** 形态 3：空任务段、无 Learning Record、只有总目标。 */
const GOALS_ONLY = `# 仅目标

## Overall Goals

- [x] 目标一

## This Week

（本周未安排）
`;

async function makeCoursesDir(files) {
  const dir = await mkdtemp(join(tmpdir(), "course-parse-"));
  await mkdir(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(dir, `${name}.md`), text, "utf8");
  }
  return dir;
}

async function listJson(dir) {
  const { stdout } = await run("node", [STATE_SCRIPT, "list", dir, "--json"], { encoding: "utf8" });
  return JSON.parse(stdout);
}

test("形态 1：完整课程页解析出周标签、任务、记录与计划日期", () => {
  const course = parseCourse(FULL, "ctm");
  assert.equal(course.title, "CTM 学习计划");
  assert.equal(course.currentWeek, "W1 · 声明式计算模型");
  assert.equal(course.weekLabel, "W1 · 声明式计算模型｜日期范围：未设定");
  assert.deepEqual(progressOf(course.week), { done: 1, total: 2 });
  assert.deepEqual(progressOf(course.overall), { done: 1, total: 2 });
  assert.deepEqual(course.lastRecord, { date: "2026-10-16", seq: "01" });
  assert.equal(course.nextSession, "读 Ch1 并复述概念阶梯。");
  assert.equal(course.marked, true);
  assert.deepEqual(course.missingSections, []);
  assert.deepEqual(course.plan, [
    { date: "2026-10-21", label: "概念讲解" },
    { date: "2026-10-22", label: "优化巩固" },
  ]);
});

test("形态 2：无标记文件在 listCourses 中默认跳过，requireMarker:false 时纳入", async () => {
  const dir = await makeCoursesDir({ minimal: MINIMAL });
  assert.equal((await listCourses(dir)).length, 0);
  const all = await listCourses(dir, { requireMarker: false });
  assert.equal(all.length, 1);
  assert.equal(all[0].marked, false);
  assert.deepEqual(all[0].missingSections, ["Overall Goals", "Today", "Next Session"]);
  assert.deepEqual(progressOf(all[0].week), { done: 1, total: 3 });
  await rm(dir, { recursive: true, force: true });
});

test("形态 3：空任务段与缺失记录不报错，返回空/ null", () => {
  const course = parseCourse(GOALS_ONLY, "goals");
  assert.deepEqual(course.week, []);
  assert.equal(course.lastRecord, null);
  assert.equal(course.nextSession, null);
  assert.deepEqual(progressOf(course.overall), { done: 1, total: 1 });
});

test("任务标签截断：完成条件被剥离、超长截断", () => {
  const line = `- [ ] ${"长".repeat(100)}（完成条件：略）`;
  const text = `# T\n\n## This Week\n\n${line}\n`;
  const course = parseCourse(text, "t");
  // 截断规则：超过 80 字符时取前 77 字符 + 省略号（与旧看板实现一致）。
  assert.equal(course.week[0].label.length, 78);
  assert.ok(course.week[0].label.endsWith("…"));
  assert.ok(!course.week[0].label.includes("完成条件"));
});

test("list --json：跳过无标记文件、按 slug 排序、字段完整", async () => {
  const dir = await makeCoursesDir({
    ctm: FULL,
    minimal: MINIMAL,
    goals: GOALS_ONLY,
  });
  const entries = await listJson(dir);
  assert.deepEqual(
    entries.map((entry) => entry.slug),
    ["ctm"],
  );
  const ctm = entries[0];
  assert.deepEqual(Object.keys(ctm).sort(), [
    "changedAt",
    "file",
    "lastRecord",
    "nextSession",
    "overall",
    "slug",
    "styleHint",
    "title",
    "week",
    "weekLabel",
  ]);
  assert.ok(Number.isInteger(ctm.changedAt));
  assert.equal(ctm.file, join(dir, "ctm.md"));
  assert.equal(ctm.styleHint, null);
  assert.deepEqual(ctm.week.tasks[0], { label: "模块 1a", done: false });
  await rm(dir, { recursive: true, force: true });
});

test("list --json：空目录返回 []", async () => {
  const dir = await makeCoursesDir({});
  assert.deepEqual(await listJson(dir), []);
  await rm(dir, { recursive: true, force: true });
});

test("toListEntry：日期一律 YYYY-MM-DD，lastRecord 为 null 时保留 null", () => {
  const entry = toListEntry(parseCourse(GOALS_ONLY, "g"));
  assert.equal(entry.lastRecord, null);
  const full = toListEntry(parseCourse(FULL, "ctm"));
  assert.match(full.lastRecord.date, /^\d{4}-\d{2}-\d{2}$/);
});

test("计划表也认 course-schedule.mjs 写的完整日期（带星期）", () => {
  const text = [
    "<!-- xuegen:course-state -->",
    "# 排期课",
    "## 计划表（参考）",
    "<!-- xuegen:schedule:start rest=sun -->",
    "| 天 | 日期 | 内容 | 材料 | 完成条件 |",
    "|---|---|---|---|---|",
    "| D1 | 2026-11-04（周三） | 函数是值 | 解释器 | 能说清 f 与 f() |",
    "| R1-D1 | 2027-01-05（周二） | 复习：函数是值 | 笔记 / 检查题 | 复述要点 |",
    "<!-- xuegen:schedule:end -->",
    "## Learning Record",
  ].join("\n");
  assert.deepEqual(parseCourse(text, "x").plan, [
    { date: "2026-11-04", label: "函数是值" },
    { date: "2027-01-05", label: "复习：函数是值" },
  ]);
});
