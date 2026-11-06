# 批次 cycle-3：周期脚本 `cycle.mjs`（只读）

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计；某一步做不到时停下，在报告里写清卡在哪一步、报错原文。

## 本批硬约束（压缩后也要记得）

1. 只**新建**两个文件：`skills/cycle-plan/cycle.mjs`、`skills/cycle-plan/cycle.test.mjs`。不改任何已有文件（`skills/cycle-plan/SKILL.md` 已由 Claude 写好，不要动）。
2. 零依赖：只用 `node:` 内置模块和 `../course/course-schedule.mjs` 的导出；不加 npm 包。
3. 不读写 `~/.xuegen/`，不碰任何 Obsidian 库（`/Users/gjy/Documents/` 下的东西），不启动 Electron，不 `git commit` / `git push`。测试只在 `os.tmpdir()` 下的临时目录里建假库。
4. 不加 `eslint-disable`、`@ts-ignore`。

## 先读

`AGENTS.md`、`docs/skills/AUTHORING.md`、`skills/cycle-plan/SKILL.md`（脚本要满足它「脚本」一节的命令与 JSON 结构）、`skills/course/course-schedule.mjs`（会用到它导出的 `addDays`、`completedIds`、`isValidDate`、`readSchedule`、`weekday`）、`skills/calendar/calendar.mjs` 的开头（跨 skill 引用 `../course/` 的先例）。

## 背景

周期页 `wiki/cycles/<cN>.md` 有 frontmatter（`cycle`、`start`、`end`）和一张 7 行的「Weekly Template」表（星期 / 类型 / 课程）。脚本按日期找到所在周期，给出这天的类型、链接课程，并从课程页的排期表里取当天课次和过期未学的新课次。脚本只读。

## 步骤

### 第 1 步：新建 `skills/cycle-plan/cycle.mjs`，内容原样如下

```js
#!/usr/bin/env node
// Xuegen 学习周期：读 wiki/cycles/<cN>.md 的 frontmatter 与周模板，按天给出类型、当天课次与过期未学的课次。
// 只读，不写任何文件。无第三方依赖；排期表的解析复用 course 技能的 course-schedule.mjs。
//   node cycle.mjs day <vault> [--date YYYY-MM-DD] [--json]
//   node cycle.mjs week <vault> [--date YYYY-MM-DD] [--json]
//   node cycle.mjs check <vault> [--json]
// <vault> 是库根目录（含 wiki/）。
import { readFile, readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { addDays, completedIds, isValidDate, readSchedule, weekday } from "../course/course-schedule.mjs";

const WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export const TYPES = ["深度", "整合", "低强度", "休息"];
export const CYCLE_DAYS = 49;

function daysBetween(from, to) {
  const ms = (date) => {
    const [y, m, d] = date.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** 解析周期页：{ cycle, start, end, template: { 0..6: { type, course } } }（0 = 周日）。格式不对就抛错。 */
export function parseCycle(text, name = "周期页") {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!fm) throw new Error(`${name} 缺少 frontmatter`);
  const field = (key) => {
    const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(fm[1]);
    return match ? match[1].trim() : "";
  };
  const cycle = field("cycle");
  const start = field("start");
  const end = field("end");
  if (!cycle) throw new Error(`${name} 的 frontmatter 缺少 cycle`);
  if (!isValidDate(start) || !isValidDate(end)) throw new Error(`${name} 的 start / end 必须是 YYYY-MM-DD`);
  if (end < start) throw new Error(`${name} 的 end 早于 start`);
  const lines = text.split("\n");
  const head = lines.findIndex((line) => /^##\s+Weekly Template\s*$/.test(line));
  if (head === -1) throw new Error(`${name} 缺少 ## Weekly Template`);
  const template = {};
  for (const line of lines.slice(head + 1)) {
    if (/^##\s/.test(line)) break;
    if (!/^\|/.test(line.trim())) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim());
    const day = WEEKDAY_ZH.indexOf(cells[0]);
    if (day === -1) continue;
    const type = cells[1];
    if (!TYPES.includes(type)) throw new Error(`${name} 的${cells[0]}类型「${type}」不认识（可用 ${TYPES.join(" / ")}）`);
    const link = /\[\[courses\/([^\]|\\]+)/.exec(cells[2] ?? "");
    if (type === "深度" && !link) throw new Error(`${name} 的${cells[0]}是深度日，但没有链接课程`);
    if (template[day]) throw new Error(`${name} 的${cells[0]}出现了两次`);
    template[day] = { type, course: link ? link[1].trim() : null };
  }
  const missing = WEEKDAY_ZH.filter((_, day) => !template[day]);
  if (missing.length) throw new Error(`${name} 的周模板缺少 ${missing.join("、")}`);
  return { cycle, start, end, template };
}

/** date 在周期里的第几周（从 start 那天起每 7 天一周，第一周是 1）。 */
export function weekOf(cycle, date) {
  return Math.floor(daysBetween(cycle.start, date) / 7) + 1;
}

export function findCycle(cycles, date) {
  return cycles.find((cycle) => cycle.start <= date && date <= cycle.end) ?? null;
}

/** 周模板里链接到的课程 slug（去重，按出现顺序）。 */
export function cycleCourses(cycle) {
  return [...new Set(Object.values(cycle.template).map((slot) => slot.course).filter(Boolean))];
}

/**
 * 某天的情况。courses：Map<slug, { rows, done }>，rows 来自 readSchedule，done 来自 completedIds。
 * lessons：这天的计划行（新课与机动，不含复习）；overdue：这天之前、没写进「完成：」的新课次。
 */
export function dayInfo(cycle, courses, date) {
  const base = { date, weekday: WEEKDAY_ZH[weekday(date)] };
  if (!cycle) return { ...base, cycle: null, week: null, type: null, course: null, lessons: [], overdue: [] };
  const slot = cycle.template[weekday(date)];
  const lessons = [];
  const overdue = [];
  for (const [slug, info] of courses) {
    for (const row of info.rows) {
      if (row.kind === "review") continue;
      if (row.date === date) lessons.push({ course: slug, id: row.id, content: row.content });
      else if (row.kind === "new" && row.date < date && !info.done.has(row.id)) {
        overdue.push({ course: slug, id: row.id, date: row.date, content: row.content });
      }
    }
  }
  overdue.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  return { ...base, cycle: cycle.cycle, week: weekOf(cycle, date), type: slot.type, course: slot.course, lessons, overdue };
}

/** date 所在周的 7 天。 */
export function weekInfo(cycle, courses, date) {
  if (!cycle) return { cycle: null, week: null, start: null, end: null, days: [] };
  const week = weekOf(cycle, date);
  const start = addDays(cycle.start, (week - 1) * 7);
  const days = Array.from({ length: 7 }, (_, index) => dayInfo(cycle, courses, addDays(start, index)));
  return { cycle: cycle.cycle, week, start, end: addDays(start, 6), days };
}

/**
 * 检查一个周期：长度、休息日、链接的课程有排期且上课日与深度日一致、新课次都在周期内。
 * courses：Map<slug, { rows, done, days, hasSchedule }>。返回问题清单（空数组 = 通过）。
 */
export function checkCycle(cycle, courses) {
  const problems = [];
  const span = daysBetween(cycle.start, cycle.end) + 1;
  if (span !== CYCLE_DAYS) problems.push(`${cycle.cycle}：start ~ end 共 ${span} 天，应为 ${CYCLE_DAYS} 天（7 周）`);
  if (!Object.values(cycle.template).some((slot) => slot.type === "休息")) problems.push(`${cycle.cycle}：周模板没有休息日`);
  for (const [slug, info] of courses) {
    if (!info.hasSchedule) {
      problems.push(`${cycle.cycle}：courses/${slug} 没有排期标记（先用 course 的 plan 排期）`);
      continue;
    }
    const deep = Object.entries(cycle.template)
      .filter(([, slot]) => slot.course === slug)
      .map(([day]) => Number(day))
      .sort((a, b) => a - b);
    const days = [...info.days].sort((a, b) => a - b);
    if (deep.join(",") !== days.join(",")) {
      const names = (list) => list.map((day) => WEEKDAY_ZH[day]).join("、");
      problems.push(`${cycle.cycle}：courses/${slug} 的上课日（${names(days)}）与周模板的深度日（${names(deep)}）不一致`);
    }
    for (const row of info.rows) {
      if (row.kind === "new" && (row.date < cycle.start || row.date > cycle.end)) {
        problems.push(`${cycle.cycle}：courses/${slug} 的 ${row.id}（${row.date}）在周期之外`);
      }
    }
  }
  return problems;
}

/** 两个周期的日期不能重叠（cycles 已按 start 排序）。 */
export function checkOverlap(cycles) {
  const problems = [];
  for (let i = 1; i < cycles.length; i += 1) {
    if (cycles[i].start <= cycles[i - 1].end) problems.push(`${cycles[i - 1].cycle} 与 ${cycles[i].cycle} 的日期重叠`);
  }
  return problems;
}

// ---- 读库 ----

async function readCycleFiles(vault) {
  const dir = join(vault, "wiki", "cycles");
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const files = [];
  for (const name of names.filter((item) => item.endsWith(".md")).sort()) {
    files.push({ name: `cycles/${name}`, text: await readFile(join(dir, name), "utf8") });
  }
  return files;
}

export async function loadCycles(vault) {
  const cycles = (await readCycleFiles(vault)).map((file) => parseCycle(file.text, file.name));
  return cycles.sort((a, b) => (a.start < b.start ? -1 : 1));
}

export async function loadCourses(vault, cycle) {
  const courses = new Map();
  for (const slug of cycleCourses(cycle)) {
    let text;
    try {
      text = await readFile(join(vault, "wiki", "courses", `${slug}.md`), "utf8");
    } catch {
      throw new Error(`周期 ${cycle.cycle} 链接的课程页不存在：courses/${slug}.md`);
    }
    const schedule = readSchedule(text);
    courses.set(slug, {
      rows: schedule ? schedule.rows : [],
      done: completedIds(text),
      days: schedule ? schedule.days : new Set(),
      hasSchedule: Boolean(schedule),
    });
  }
  return courses;
}

// ---- CLI ----

function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (["json", "help"].includes(key)) flags[key] = true;
    else {
      flags[key] = argv[i + 1];
      i += 1;
    }
  }
  return { positional, flags };
}

function fail(message) {
  process.stderr.write(`cycle: ${message}\n`);
  process.exit(1);
}

function usage() {
  return [
    "用法：",
    "  node cycle.mjs day <vault> [--date YYYY-MM-DD] [--json]",
    "  node cycle.mjs week <vault> [--date YYYY-MM-DD] [--json]",
    "  node cycle.mjs check <vault> [--json]",
  ].join("\n");
}

function dayLine(info) {
  if (!info.cycle) return `${info.date} 不在任何周期内`;
  return `${info.cycle} · W${info.week} · ${info.weekday} ${info.date.slice(5)} · ${info.type}${info.course ? ` · ${info.course}` : ""}`;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, vault] = positional;
  if (flags.help || !command) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!vault) fail(`缺少库根目录\n${usage()}`);

  if (command === "check") {
    const problems = [];
    const cycles = [];
    for (const file of await readCycleFiles(vault)) {
      try {
        cycles.push(parseCycle(file.text, file.name));
      } catch (error) {
        problems.push(error.message);
      }
    }
    cycles.sort((a, b) => (a.start < b.start ? -1 : 1));
    problems.push(...checkOverlap(cycles));
    for (const cycle of cycles) {
      try {
        problems.push(...checkCycle(cycle, await loadCourses(vault, cycle)));
      } catch (error) {
        problems.push(error.message);
      }
    }
    const ok = problems.length === 0;
    if (flags.json) process.stdout.write(`${JSON.stringify({ ok, problems })}\n`);
    else process.stdout.write(ok ? `check: OK（${cycles.length} 个周期）\n` : `${problems.map((item) => `- ${item}`).join("\n")}\n`);
    if (!ok) process.exit(1);
    return;
  }

  if (command !== "day" && command !== "week") fail(`未知命令：${command}\n${usage()}`);
  const date = flags.date ?? localToday();
  if (!isValidDate(date)) fail(`--date 必须是 YYYY-MM-DD，收到 ${date}`);
  let cycle;
  let courses;
  try {
    cycle = findCycle(await loadCycles(vault), date);
    courses = cycle ? await loadCourses(vault, cycle) : new Map();
  } catch (error) {
    fail(error.message);
  }

  if (command === "day") {
    const info = dayInfo(cycle, courses, date);
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(info)}\n`);
      return;
    }
    const lines = [dayLine(info)];
    for (const item of info.lessons) lines.push(`● ${item.course} ${item.id}  ${item.content}`);
    for (const item of info.overdue) lines.push(`! ${item.course} ${item.id}（${item.date}）未学  ${item.content}`);
    process.stdout.write(`${lines.join("\n")}\n`);
    return;
  }

  const info = weekInfo(cycle, courses, date);
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(info)}\n`);
    return;
  }
  if (!info.cycle) {
    process.stdout.write(`${date} 不在任何周期内\n`);
    return;
  }
  const lines = [`${info.cycle} · W${info.week} · ${info.start} ~ ${info.end}`];
  for (const day of info.days) {
    const lessons = day.lessons.map((item) => `${item.course} ${item.id}`).join("、");
    lines.push(`${day.weekday} ${day.date.slice(5)}  ${day.type}${lessons ? `  ${lessons}` : ""}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

function isMain() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
```

### 第 2 步：新建 `skills/cycle-plan/cycle.test.mjs`，内容原样如下

```js
// cycle.mjs 的测试：周期页解析、某天/某周的情况、与课程排期的一致性检查，以及一次真实的 CLI 运行。全部在临时目录。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkCycle, cycleCourses, dayInfo, findCycle, parseCycle, weekInfo, weekOf } from "./cycle.mjs";
import { parseDays, parseRest, planSchedule, renderTable, readSchedule } from "../course/course-schedule.mjs";

const run = promisify(execFile);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "cycle.mjs");
const SUN = parseRest("sun");

const CYCLE = `---
cycle: C1
start: 2026-11-06
end: 2026-12-24
---

# C1 · 离散 + 范式

## Weekly Template

| 星期 | 类型 | 课程 |
|---|---|---|
| 周一 | 深度 | [[courses/a\\|离散]] |
| 周二 | 深度 | [[courses/b\\|范式]] |
| 周三 | 深度 | [[courses/a\\|离散]] |
| 周四 | 深度 | [[courses/b\\|范式]] |
| 周五 | 整合 | — |
| 周六 | 低强度 | — |
| 周日 | 休息 | — |

## Log
- 2026-11-05: 创建
`;

const lessons = (n) => Array.from({ length: n }, (_, i) => ({ content: `第 ${i + 1} 课` }));
const RANGE = { start: "2026-11-06", end: "2026-12-24", rest: SUN, reviews: "anki" };

function courseText(rows, days, record = "") {
  return ["# 课", "", "## 计划表", "", renderTable(rows, SUN, days, "anki"), "", "## Learning Record", record, ""].join("\n");
}

function coursesFrom(texts) {
  const map = new Map();
  for (const [slug, text] of Object.entries(texts)) {
    const schedule = readSchedule(text);
    map.set(slug, { rows: schedule.rows, done: new Set(), days: schedule.days, hasSchedule: true });
  }
  return map;
}

const A_DAYS = parseDays("mon,wed", SUN);
const B_DAYS = parseDays("tue,thu", SUN);
const aRows = planSchedule(lessons(4), { ...RANGE, days: A_DAYS, extra: ["2026-11-06"] });
const bRows = planSchedule(lessons(4), { ...RANGE, days: B_DAYS });

test("parseCycle reads frontmatter and the 7-row weekly template", () => {
  const cycle = parseCycle(CYCLE);
  assert.equal(cycle.cycle, "C1");
  assert.equal(cycle.start, "2026-11-06");
  assert.deepEqual(cycle.template[1], { type: "深度", course: "a" });
  assert.deepEqual(cycle.template[5], { type: "整合", course: null });
  assert.deepEqual(cycle.template[0], { type: "休息", course: null });
  assert.deepEqual(cycleCourses(cycle), ["a", "b"]);
});

test("parseCycle rejects broken pages", () => {
  assert.throws(() => parseCycle("# 无 frontmatter"), /frontmatter/);
  assert.throws(() => parseCycle(CYCLE.replace("| 周日 | 休息 | — |\n", "")), /缺少 周日/);
  assert.throws(() => parseCycle(CYCLE.replace("| 周六 | 低强度 |", "| 周六 | 摸鱼 |")), /不认识/);
  assert.throws(() => parseCycle(CYCLE.replace("| 周一 | 深度 | [[courses/a\\|离散]] |", "| 周一 | 深度 | — |")), /没有链接课程/);
  assert.throws(() => parseCycle(CYCLE.replace("end: 2026-12-24", "end: 2026-10-01")), /早于/);
});

test("weekOf counts 7-day weeks from start; findCycle picks the cycle containing the date", () => {
  const cycle = parseCycle(CYCLE);
  assert.equal(weekOf(cycle, "2026-11-06"), 1);
  assert.equal(weekOf(cycle, "2026-11-12"), 1);
  assert.equal(weekOf(cycle, "2026-11-13"), 2);
  assert.equal(weekOf(cycle, "2026-12-24"), 7);
  assert.equal(findCycle([cycle], "2026-12-24"), cycle);
  assert.equal(findCycle([cycle], "2026-12-25"), null);
});

test("dayInfo gives the template type, the day's lessons and overdue lessons", () => {
  const cycle = parseCycle(CYCLE);
  const courses = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) });

  const fri = dayInfo(cycle, courses, "2026-11-06");
  assert.equal(fri.weekday, "周五");
  assert.equal(fri.type, "整合");
  assert.equal(fri.course, null);
  assert.deepEqual(fri.lessons.map((item) => [item.course, item.id]), [["a", "D1"]]);

  const mon = dayInfo(cycle, courses, "2026-11-09");
  assert.equal(mon.type, "深度");
  assert.equal(mon.course, "a");
  assert.equal(mon.week, 1);
  assert.deepEqual(mon.lessons.map((item) => [item.course, item.id]), [["a", "D2"]]);

  const tue = dayInfo(cycle, courses, "2026-11-10");
  assert.deepEqual(tue.lessons.map((item) => [item.course, item.id]), [["b", "D1"]]);
  assert.deepEqual(tue.overdue.map((item) => [item.course, item.id, item.date]), [
    ["a", "D1", "2026-11-06"],
    ["a", "D2", "2026-11-09"],
  ]);

  const nextFri = dayInfo(cycle, courses, "2026-11-13");
  assert.equal(nextFri.week, 2);
  assert.equal(nextFri.type, "整合");
  assert.deepEqual(nextFri.lessons, []);

  const outside = dayInfo(null, new Map(), "2026-12-25");
  assert.equal(outside.cycle, null);
  assert.equal(outside.type, null);
});

test("weekInfo lists the 7 days of the week, starting on the cycle's start weekday", () => {
  const cycle = parseCycle(CYCLE);
  const courses = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) });
  const week = weekInfo(cycle, courses, "2026-11-10");
  assert.equal(week.start, "2026-11-06");
  assert.equal(week.end, "2026-11-12");
  assert.deepEqual(week.days.map((day) => day.type), ["整合", "低强度", "休息", "深度", "深度", "深度", "深度"]);
  assert.deepEqual(
    week.days.flatMap((day) => day.lessons.map((item) => `${item.course} ${item.id}`)),
    ["a D1", "a D2", "b D1", "a D3", "b D2"],
  );
});

test("checkCycle passes when lesson days match the template and reports mismatches", () => {
  const cycle = parseCycle(CYCLE);
  const good = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) });
  assert.deepEqual(checkCycle(cycle, good), []);

  const wrongDays = parseDays("mon,thu", SUN);
  const bad = coursesFrom({
    a: courseText(aRows, A_DAYS),
    b: courseText(planSchedule(lessons(2), { ...RANGE, days: wrongDays }), wrongDays),
  });
  assert.ok(checkCycle(cycle, bad).some((problem) => /不一致/.test(problem)));

  const short = parseCycle(CYCLE.replace("end: 2026-12-24", "end: 2026-12-17"));
  assert.ok(checkCycle(short, good).some((problem) => /42 天/.test(problem)));

  const noSchedule = new Map([["a", { rows: [], done: new Set(), days: new Set(), hasSchedule: false }]]);
  assert.ok(checkCycle(cycle, noSchedule).some((problem) => /没有排期标记/.test(problem)));
});

test("CLI: day, week and check against a temporary vault", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aRows, A_DAYS, "### 2026-11-06-01\n完成：D1"));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));

    const day = JSON.parse((await run("node", [SCRIPT, "day", vault, "--date", "2026-11-09", "--json"])).stdout);
    assert.equal(day.cycle, "C1");
    assert.equal(day.type, "深度");
    assert.equal(day.course, "a");
    assert.deepEqual(day.lessons.map((item) => item.id), ["D2"]);
    assert.deepEqual(day.overdue, []);

    const text = (await run("node", [SCRIPT, "day", vault, "--date", "2026-11-09"])).stdout;
    assert.match(text, /^C1 · W1 · 周一 11-09 · 深度 · a/);

    const week = JSON.parse((await run("node", [SCRIPT, "week", vault, "--date", "2026-11-10", "--json"])).stdout);
    assert.equal(week.days.length, 7);
    assert.equal(week.days[0].date, "2026-11-06");

    const outside = JSON.parse((await run("node", [SCRIPT, "day", vault, "--date", "2027-01-05", "--json"])).stdout);
    assert.equal(outside.cycle, null);

    const ok = JSON.parse((await run("node", [SCRIPT, "check", vault, "--json"])).stdout);
    assert.deepEqual(ok, { ok: true, problems: [] });

    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE.replace("end: 2026-12-24", "end: 2026-12-31"));
    await assert.rejects(run("node", [SCRIPT, "check", vault, "--json"]), (error) => {
      const result = JSON.parse(error.stdout);
      return result.ok === false && result.problems.some((problem) => /56 天/.test(problem));
    });
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
```

## 完成标准（可观察）

- 下面三条命令全部通过，贴出每条输出的最后 15 行：
  ```sh
  cd /Users/gjy/pi-learning/xuegen && npm test
  cd /Users/gjy/pi-learning/xuegen && npm run lint:skills
  cd /Users/gjy/pi-learning/xuegen && git status --short skills/ docs/
  ```
- `npm test` 里 `cycle.test.mjs` 的 7 个测试全部通过，原有测试仍全部通过。
- `lint:skills` 0 错误，且没有「cycle-plan/cycle.mjs 缺少同名测试」的警告。
- 若某个测试的断言与脚本行为不符：**先不要改测试也不要改脚本去迁就**，在报告里写出失败的断言、实际值和你判断的原因，停下等 Claude 处理。

## 结束报告

列出：新建了哪些文件；每一步是否照做；偏离清单之处及原因（没有就写「无」）；未完成项。
