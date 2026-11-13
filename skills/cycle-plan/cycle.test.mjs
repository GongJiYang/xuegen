// cycle.mjs 的测试：周期页解析、某天/某周的情况、与课程排期的一致性检查，以及一次真实的 CLI 运行。全部在临时目录。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkCycle, cycleAuxSubjects, cycleSubjects, dayInfo, elasticCycles, findCycle, monthInfo, parseCycle, parseRoute, planInfo, shiftRoute, subjectCourses, weekInfo, weekOf } from "./cycle.mjs";
import { completedIds, parseDays, parseRest, planSchedule, renderTable, readSchedule } from "../course/course-schedule.mjs";

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
| 周一 | 深度 | [[subjects/x\\|离散]] |
| 周二 | 深度 | [[subjects/y\\|范式]] |
| 周三 | 深度 | [[subjects/x\\|离散]] |
| 周四 | 深度 | [[subjects/y\\|范式]] |
| 周五 | 整合 | — |
| 周六 | 低强度 | — |
| 周日 | 休息 | — |

## Log
- 2026-11-05: 创建
`;

const SUBJECT_X = "# 离散\n\n## Materials\n\n### 书籍\n\n- ● 学习中 · 主线 · [[src-a]] → [[courses/a\\|离散]]\n\n## Courses\n- [[courses/old]] - 旧课\n";
const SUBJECT_Y = "# 范式\n\n## Materials\n\n### 书籍\n\n- ● 学习中 · 主线 · [[src-b]] → [[courses/b\\|范式]]\n- ◌ 未制定计划 · 主线 · [[src-c]]\n";
const SUBJECT_Z = "# C\n\n## Materials\n\n### 书籍\n\n- ● 学习中 · 主线 · [[src-d]] → [[courses/d\\|C]]\n";
const CYCLE_AUX = CYCLE.replace("| 星期 | 类型 | 课程 |", "| 星期 | 类型 | 主项 | 辅助 |")
  .replace("| 周一 | 深度 | [[subjects/x\\|离散]] |", "| 周一 | 深度 | [[subjects/x\\|离散]] | [[subjects/z\\|C]] |")
  .replace("| 周三 | 深度 | [[subjects/x\\|离散]] |", "| 周三 | 深度 | [[subjects/x\\|离散]] | [[subjects/z\\|C]] |");

async function writeSubjects(vault) {
  await mkdir(join(vault, "wiki", "subjects"), { recursive: true });
  await writeFile(join(vault, "wiki", "subjects", "x.md"), SUBJECT_X);
  await writeFile(join(vault, "wiki", "subjects", "y.md"), SUBJECT_Y);
  await writeFile(join(vault, "wiki", "subjects", "z.md"), SUBJECT_Z);
}

const lessons = (n) => Array.from({ length: n }, (_, i) => ({ content: `第 ${i + 1} 课` }));
const RANGE = { start: "2026-11-06", end: "2026-12-24", rest: SUN, reviews: "anki" };

function courseText(rows, days, record = "") {
  return ["# 课", "", "## 计划表", "", renderTable(rows, SUN, days, "anki"), "", "## Learning Record", record, ""].join("\n");
}

const SUBJECT_OF = { a: "x", b: "y", c: "y", d: "z" };
const NAME_OF = { a: "离散", b: "范式", c: "C", d: "C" };
const ROLE_OF = { a: "main", b: "main", c: "main", d: "aux" };

function coursesFrom(texts) {
  const map = new Map();
  for (const [slug, text] of Object.entries(texts)) {
    const schedule = readSchedule(text);
    map.set(slug, { subject: SUBJECT_OF[slug], role: ROLE_OF[slug], name: NAME_OF[slug], rows: schedule.rows, done: new Set(), days: schedule.days });
  }
  return map;
}

const A_DAYS = parseDays("mon,wed", SUN);
const B_DAYS = parseDays("tue,thu", SUN);
const aRows = planSchedule(lessons(4), { ...RANGE, days: A_DAYS, extra: ["2026-11-06"] });
const bRows = planSchedule(lessons(4), { ...RANGE, days: B_DAYS });

const ROUTE = `---
route: 测试路线
start: 2026-11-06
end: 2027-04-08
buffer_weeks: 12
---

# 两年学习路线

## Cycles

| 周期 | 开始 | 结束 | 主项 | 辅助（下周期主项） | 状态 |
|---|---|---|---|---|---|
| [[cycles/c1\\|C1]] | 2026-11-06 | 2026-12-24 | 离散数学、编程范式 | 数据结构与算法、C 与系统编程 | 进行中 |
| C2 | 2026-12-25 | 2027-02-11 | 数据结构与算法、C 与系统编程 | 体系结构、计算理论 | 未开始 |
| 恢复周 | 2027-02-12 | 2027-02-18 | — | — | |
| C3 | 2027-02-19 | 2027-04-08 | 体系结构、计算理论 | — | 未开始 |

## Log
- 2026-11-06: 建立
`;

test("parseCycle reads frontmatter and the 7-row weekly template", () => {
  const cycle = parseCycle(CYCLE);
  assert.equal(cycle.cycle, "C1");
  assert.equal(cycle.start, "2026-11-06");
  assert.deepEqual(cycle.template[1], { type: "深度", subject: "x", aux: null });
  assert.deepEqual(cycle.template[5], { type: "整合", subject: null, aux: null });
  assert.deepEqual(cycle.template[0], { type: "休息", subject: null, aux: null });
  assert.deepEqual(cycleSubjects(cycle), ["x", "y"]);
  assert.deepEqual(cycle.subjects, { x: "离散", y: "范式" });
});

test("parseCycle rejects broken pages", () => {
  assert.throws(() => parseCycle("# 无 frontmatter"), /frontmatter/);
  assert.throws(() => parseCycle(CYCLE.replace("| 周日 | 休息 | — |\n", "")), /缺少 周日/);
  assert.throws(() => parseCycle(CYCLE.replace("| 周六 | 低强度 |", "| 周六 | 摸鱼 |")), /不认识/);
  assert.throws(() => parseCycle(CYCLE.replace("| 周一 | 深度 | [[subjects/x\\|离散]] |", "| 周一 | 深度 | — |")), /没有链接科目/);
  assert.throws(() => parseCycle(CYCLE.replace("end: 2026-12-24", "end: 2026-10-01")), /早于/);
  assert.throws(() => parseCycle(CYCLE.replace("[[subjects/x\\|离散]] |\n| 周二", "[[courses/a\\|离散]] |\n| 周二")), /没有链接科目/);
  const both = parseCycle(CYCLE.replaceAll("[[subjects/x\\|离散]]", "[[subjects/x\\|离散]]（[[courses/a\\|离散]]）"));
  assert.deepEqual(both.template[1], { type: "深度", subject: "x", aux: null });
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
  assert.equal(mon.subject, "x");
  assert.equal(mon.week, 1);
  assert.deepEqual(mon.lessons.map((item) => [item.course, item.id]), [["a", "D2"]]);

  const wed = dayInfo(cycle, coursesFrom({ b: courseText(bRows, B_DAYS) }), "2026-11-11");
  assert.equal(wed.subject, "x");
  assert.equal(wed.course, null);
  assert.deepEqual(mon.names, { a: "离散", b: "范式" });
  assert.deepEqual(mon.subjects, { x: "离散", y: "范式" });

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

test("checkCycle: lesson days within the subject's deep days, no same-day clash, every subject has a course", () => {
  const cycle = parseCycle(CYCLE);
  const good = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) });
  assert.deepEqual(checkCycle(cycle, good), []);

  const wrongDays = parseDays("mon,thu", SUN);
  const bad = coursesFrom({
    a: courseText(aRows, A_DAYS),
    b: courseText(planSchedule(lessons(2), { ...RANGE, days: wrongDays }), wrongDays),
  });
  assert.ok(checkCycle(cycle, bad).some((problem) => /周一）不是 subjects\/y 的深度日/.test(problem)));

  const short = parseCycle(CYCLE.replace("end: 2026-12-24", "end: 2026-12-17"));
  assert.ok(checkCycle(short, good).some((problem) => /42 天/.test(problem)));

  const onlyA = coursesFrom({ a: courseText(aRows, A_DAYS) });
  assert.ok(checkCycle(cycle, onlyA).some((problem) => /subjects\/y 本周期没有排课的课程/.test(problem)));

  const THU = parseDays("thu", SUN);
  const TUE = parseDays("tue", SUN);
  const split = coursesFrom({
    a: courseText(aRows, A_DAYS),
    b: courseText(planSchedule(lessons(3), { ...RANGE, days: TUE }), TUE),
    c: courseText(planSchedule(lessons(3), { ...RANGE, days: THU }), THU),
  });
  assert.deepEqual(checkCycle(cycle, split), []);
  const clash = coursesFrom({
    a: courseText(aRows, A_DAYS),
    b: courseText(planSchedule(lessons(3), { ...RANGE, days: TUE }), TUE),
    c: courseText(planSchedule(lessons(3), { ...RANGE, days: TUE }), TUE),
  });
  assert.ok(checkCycle(cycle, clash).some((problem) => /subjects\/y 在 2026-11-10 同时排了 courses\/b 与 courses\/c/.test(problem)));
});

test("CLI: day, week and check against a temporary vault", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await writeSubjects(vault);
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

test("CLI: 当天课次带 done——Learning Record 写了「完成：D3」的那节为 true，别的课次为 false", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-lesson-done-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await writeSubjects(vault);
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aRows, A_DAYS, "### 2026-11-11-01\n完成：D3"));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));

    const wed = JSON.parse((await run("node", [SCRIPT, "day", vault, "--date", "2026-11-11", "--json"])).stdout);
    assert.deepEqual(wed.lessons.map((item) => [item.id, item.done]), [["D3", true]]);
    assert.deepEqual(wed.overdue.map((item) => [item.course, item.id]), [["a", "D1"], ["a", "D2"], ["b", "D1"]]);

    const mon = JSON.parse((await run("node", [SCRIPT, "day", vault, "--date", "2026-11-09", "--json"])).stdout);
    assert.deepEqual(mon.lessons.map((item) => [item.id, item.done]), [["D2", false]]);
    const tue = JSON.parse((await run("node", [SCRIPT, "day", vault, "--date", "2026-11-10", "--json"])).stdout);
    assert.deepEqual(tue.lessons.map((item) => [item.id, item.done]), [["D1", false]]);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("monthInfo lists only the days inside a cycle", () => {
  const cycle = parseCycle(CYCLE);
  const info = monthInfo([cycle], "2026-11");
  assert.equal(info.month, "2026-11");
  assert.equal(Object.keys(info.days).length, 25);
  assert.equal(info.days["2026-11-05"], undefined);
  assert.deepEqual(info.days["2026-11-06"], { cycle: "C1", week: 1, type: "整合", subject: null, course: null, aux: null, auxCourse: null });
  assert.deepEqual(info.days["2026-11-09"], { cycle: "C1", week: 1, type: "深度", subject: "x", course: null, aux: null, auxCourse: null });
  assert.deepEqual(info.days["2026-11-30"], { cycle: "C1", week: 4, type: "深度", subject: "x", course: null, aux: null, auxCourse: null });
  assert.equal(Object.keys(monthInfo([cycle], "2027-01").days).length, 0);
});

test("CLI: month prints the cycle days of a month and rejects a bad month", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-month-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await writeSubjects(vault);
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aRows, A_DAYS));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));
    const info = JSON.parse((await run("node", [SCRIPT, "month", vault, "2026-12", "--json"])).stdout);
    assert.equal(Object.keys(info.days).length, 24);
    assert.deepEqual(info.days["2026-12-24"], { cycle: "C1", week: 7, type: "深度", subject: "y", course: "b", aux: null, auxCourse: null });
    assert.equal(info.days["2026-12-10"].course, "b");
    assert.equal(info.days["2026-12-25"], undefined);
    await assert.rejects(run("node", [SCRIPT, "month", vault, "2026-13", "--json"]), (error) => /YYYY-MM/.test(error.stderr));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("subjectCourses reads course links and aliases from Materials and Courses; dayInfo names come from them", () => {
  assert.deepEqual(subjectCourses(SUBJECT_X), [{ slug: "a", name: "离散" }, { slug: "old", name: "old" }]);
  assert.deepEqual(subjectCourses(SUBJECT_Y), [{ slug: "b", name: "范式" }]);
  assert.deepEqual(subjectCourses("## Overview\n[[courses/z]]\n"), []);
  assert.deepEqual(parseCycle(CYCLE.replaceAll("\\|离散", "").replaceAll("\\|范式", "")).subjects, { x: "x", y: "y" });
  assert.deepEqual(dayInfo(null, new Map(), "2026-11-09").names, {});
});

test("parseCycle reads the title after 「C1 · 」", () => {
  assert.equal(parseCycle(CYCLE).title, "离散 + 范式");
  assert.equal(parseCycle(CYCLE.replace("# C1 · 离散 + 范式\n", "")).title, "");
});

test("parseRoute reads frontmatter, cycle rows and recovery weeks", () => {
  const route = parseRoute(ROUTE);
  assert.equal(route.start, "2026-11-06");
  assert.equal(route.end, "2027-04-08");
  assert.equal(route.bufferWeeks, 12);
  assert.deepEqual(route.rows.map((row) => row.id), ["C1", "C2", "恢复周", "C3"]);
  assert.deepEqual(route.rows[0], {
    id: "C1",
    start: "2026-11-06",
    end: "2026-12-24",
    main: ["离散数学", "编程范式"],
    aux: ["数据结构与算法", "C 与系统编程"],
    status: "进行中",
    recovery: false,
  });
  assert.deepEqual(route.rows[2], { id: "恢复周", start: "2027-02-12", end: "2027-02-18", main: [], aux: [], status: "", recovery: true });
  assert.deepEqual(route.rows[3].aux, []);
  assert.equal(parseRoute(ROUTE.replace("[[cycles/c1\\|C1]]", "[[cycles/c1]]")).rows[0].id, "C1");
  assert.equal(parseRoute(ROUTE.replace("buffer_weeks: 12\n", "")).bufferWeeks, 0);
});

test("parseRoute rejects broken pages", () => {
  assert.throws(() => parseRoute("# 没有 frontmatter"), /frontmatter/);
  assert.throws(() => parseRoute(ROUTE.replace("end: 2027-04-08", "end: 2027-4-8")), /start \/ end/);
  assert.throws(() => parseRoute(ROUTE.replace("## Cycles", "## 周期")), /## Cycles/);
  assert.throws(() => parseRoute(ROUTE.replace("| C2 |", "| 第二周期 |")), /不认识/);
  assert.throws(() => parseRoute(ROUTE.replace("| 2027-02-11 |", "| 2026-12-01 |")), /结束日期/);
  assert.throws(() => parseRoute(ROUTE.replace("buffer_weeks: 12", "buffer_weeks: -1")), /buffer_weeks/);
});

test("planInfo gives the route, the cycle and each course's lesson counts", () => {
  const cycle = parseCycle(CYCLE);
  const courses = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) });
  courses.get("a").done = new Set(["D1"]);
  const info = planInfo(parseRoute(ROUTE), cycle, courses, "2026-11-10");
  assert.equal(info.route.end, "2027-04-08");
  assert.equal(info.route.weeksLeft, 22);
  assert.deepEqual(info.route.cycles.map((item) => item.id), ["C1", "C2", "C3"]);
  assert.deepEqual(info.route.recovery, [{ start: "2027-02-12", end: "2027-02-18" }]);
  assert.deepEqual(info.cycle, {
    cycle: "C1",
    title: "离散 + 范式",
    start: "2026-11-06",
    end: "2026-12-24",
    plannedEnd: "2026-12-24",
    delayDays: 0,
    week: 1,
    weeks: 7,
    daysLeft: 44,
    next: { cycle: "C2", start: "2026-12-25" },
    subjects: { x: "离散", y: "范式" },
    auxSubjects: [],
    subjectDays: { x: ["周一", "周三"], y: ["周二", "周四"] },
  });
  assert.deepEqual(info.courses[0], {
    slug: "a",
    subject: "x",
    role: "main",
    name: "离散",
    total: 4,
    done: 1,
    end: aRows.filter((row) => row.kind === "new").at(-1).date,
    next: { id: "D2", date: "2026-11-09", content: "第 2 课" },
    lessons: aRows.filter((row) => row.kind === "new").map((row) => ({ id: row.id, date: row.date, content: row.content, done: row.id === "D1" })),
  });
  assert.equal(info.courses[1].done, 0);
  assert.equal(info.courses[1].next.id, "D1");
});

test("planInfo without a route page or outside every cycle", () => {
  const cycle = parseCycle(CYCLE);
  const info = planInfo(null, cycle, new Map(), "2026-11-06");
  assert.equal(info.route, null);
  assert.equal(info.cycle.next, null);
  assert.deepEqual(info.courses, []);
  assert.deepEqual(planInfo(parseRoute(ROUTE), null, new Map(), "2027-02-14").courses, []);
  assert.equal(planInfo(parseRoute(ROUTE), null, new Map(), "2027-02-14").cycle, null);
});

test("monthInfo marks a day's lesson done once the course's 「完成：」 line names it", () => {
  const cycle = parseCycle(CYCLE);
  const text = courseText(aRows, A_DAYS, "- 完成：D1");
  const schedule = readSchedule(text);
  const completed = new Map([
    ["a", { subject: "x", role: "main", name: "离散", rows: schedule.rows, done: completedIds(text), days: schedule.days }],
  ]);
  const info = monthInfo([cycle], "2026-11", { courses: new Map([["C1", completed]]) });
  assert.deepEqual(info.lessons["2026-11-06"], [{ course: "a", id: "D1", content: "第 1 课", done: true }]);
});

test("monthInfo adds each day's lessons, the short names, cycle bounds and recovery days", () => {
  const cycle = parseCycle(CYCLE);
  const courses = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) });
  const info = monthInfo([cycle], "2026-11", { courses: new Map([["C1", courses]]), route: parseRoute(ROUTE) });
  assert.deepEqual(info.lessons["2026-11-06"], [{ course: "a", id: "D1", content: "第 1 课", done: false }]);
  assert.deepEqual(info.lessons["2026-11-10"], [{ course: "b", id: "D1", content: "第 1 课", done: false }]);
  assert.equal(info.lessons["2026-11-08"], undefined);
  assert.deepEqual(info.names, { a: "离散", b: "范式" });
  assert.deepEqual(info.subjects, { x: "离散", y: "范式" });
  assert.equal(info.days["2026-11-10"].course, "b");
  assert.deepEqual(info.cycles, [{ cycle: "C1", start: "2026-11-06", end: "2026-12-24" }]);
  assert.deepEqual(info.recovery, []);
  const feb = monthInfo([cycle], "2027-02", { route: parseRoute(ROUTE) });
  assert.equal(feb.recovery.length, 7);
  assert.equal(feb.recovery[0], "2027-02-12");
  assert.deepEqual(monthInfo([cycle], "2026-11").lessons, {});
});

test("CLI: overview reads route.md and the cycle; check compares route.md with the cycle page", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-overview-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await writeSubjects(vault);
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aRows, A_DAYS));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));
    const noRoute = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-11-06", "--json"])).stdout);
    assert.equal(noRoute.route, null);
    assert.equal(noRoute.cycle.cycle, "C1");
    await writeFile(join(vault, "wiki", "cycles", "route.md"), ROUTE);
    const info = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-11-06", "--json"])).stdout);
    assert.equal(info.route.end, "2027-04-08");
    assert.deepEqual(info.courses.map((item) => [item.name, item.total]), [["离散", 4], ["范式", 4]]);
    const text = (await run("node", [SCRIPT, "overview", vault, "--date", "2026-11-06"])).stdout;
    assert.match(text, /路线 2026-11-06 ~ 2027-04-08/);
    const month = JSON.parse((await run("node", [SCRIPT, "month", vault, "2026-11", "--json"])).stdout);
    assert.equal(month.lessons["2026-11-06"][0].id, "D1");
    assert.match((await run("node", [SCRIPT, "check", vault])).stdout, /OK/);
    await writeFile(join(vault, "wiki", "cycles", "route.md"), ROUTE.replace("| 2026-12-24 | 离散数学", "| 2026-12-31 | 离散数学"));
    await assert.rejects(run("node", [SCRIPT, "check", vault]), (error) => /不一致/.test(error.stdout));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("CLI: loadCourses keeps only courses with a lesson inside the cycle and skips missing pages", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-subjects-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeSubjects(vault);
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE);
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aRows, A_DAYS));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));
    const oldRows = planSchedule(lessons(2), { start: "2026-10-01", end: "2026-10-20", rest: SUN, days: A_DAYS, reviews: "anki" });
    await writeFile(join(vault, "wiki", "courses", "old.md"), courseText(oldRows, A_DAYS));
    const info = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-11-06", "--json"])).stdout);
    assert.deepEqual(info.courses.map((item) => [item.slug, item.subject, item.name]), [["a", "x", "离散"], ["b", "y", "范式"]]);
    assert.deepEqual(JSON.parse((await run("node", [SCRIPT, "check", vault, "--json"])).stdout), { ok: true, problems: [] });
    await rm(join(vault, "wiki", "subjects", "y.md"));
    await assert.rejects(run("node", [SCRIPT, "check", vault, "--json"]), (error) => /subjects\/y\.md/.test(error.stdout));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("parseCycle reads the 辅助 column; dayInfo, monthInfo and checkCycle handle aux courses", () => {
  const cycle = parseCycle(CYCLE_AUX);
  assert.deepEqual(cycle.template[1], { type: "深度", subject: "x", aux: "z" });
  assert.deepEqual(cycle.template[2], { type: "深度", subject: "y", aux: null });
  assert.deepEqual(cycleAuxSubjects(cycle), ["z"]);
  assert.equal(cycle.subjects.z, "C");
  assert.throws(() => parseCycle(CYCLE_AUX.replace("| 周五 | 整合 | — |", "| 周五 | 整合 | — | [[subjects/z\\|C]] |")), /不能排辅助/);
  assert.throws(() => parseCycle(CYCLE_AUX.replace("| 周一 | 深度 | [[subjects/x\\|离散]] | [[subjects/z\\|C]] |", "| 周一 | 深度 | [[subjects/x\\|离散]] | [[subjects/x\\|离散]] |")), /同一个科目/);
  assert.throws(() => parseCycle(CYCLE_AUX.replace("| 周三 | 深度 | [[subjects/x\\|离散]] | [[subjects/z\\|C]] |", "| 周三 | 深度 | [[subjects/x\\|离散]] | [[subjects/y\\|范式]] |")), /既是主项又是辅助/);

  const D_DAYS = parseDays("mon,wed", SUN);
  const dRows = planSchedule(lessons(3), { ...RANGE, days: D_DAYS });
  const courses = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS), d: courseText(dRows, D_DAYS) });
  const mon = dayInfo(cycle, courses, "2026-11-09");
  assert.equal(mon.course, "a");
  assert.equal(mon.aux, "z");
  assert.equal(mon.auxCourse, "d");
  assert.deepEqual(mon.roles, { a: "main", b: "main", d: "aux" });
  assert.deepEqual(mon.lessons.map((item) => item.course).sort(), ["a", "d"]);
  const tue = dayInfo(cycle, courses, "2026-11-10");
  assert.equal(tue.aux, null);
  assert.equal(tue.auxCourse, null);

  const month = monthInfo([cycle], "2026-11", { courses: new Map([["C1", courses]]) });
  assert.deepEqual(month.days["2026-11-09"], { cycle: "C1", week: 1, type: "深度", subject: "x", course: "a", aux: "z", auxCourse: "d" });
  assert.equal(month.roles.d, "aux");

  assert.deepEqual(checkCycle(cycle, courses), []);
  const TUE = parseDays("tue", SUN);
  const wrong = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS), d: courseText(planSchedule(lessons(2), { ...RANGE, days: TUE }), TUE) });
  assert.ok(checkCycle(cycle, wrong).some((problem) => /courses\/d 的上课日（周二）不是 subjects\/z 的深度日/.test(problem)));
  assert.deepEqual(checkCycle(cycle, coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) })), []);
});

test("CLI: overview marks aux courses", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-aux-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeSubjects(vault);
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE_AUX);
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aRows, A_DAYS));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));
    const D_DAYS = parseDays("mon,wed", SUN);
    await writeFile(join(vault, "wiki", "courses", "d.md"), courseText(planSchedule(lessons(3), { ...RANGE, days: D_DAYS }), D_DAYS));
    const info = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-11-06", "--json"])).stdout);
    assert.deepEqual(info.courses.map((item) => [item.slug, item.role]), [["a", "main"], ["b", "main"], ["d", "aux"]]);
    assert.deepEqual(info.cycle.auxSubjects, ["z"]);
    assert.deepEqual(JSON.parse((await run("node", [SCRIPT, "check", vault, "--json"])).stdout), { ok: true, problems: [] });
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("elasticCycles shifts starts by the previous cycle's delay and stretches the end to the last main lesson", () => {
  const c1 = { cycle: "C1", start: "2026-11-06", end: "2026-12-24" };
  const c2 = { cycle: "C2", start: "2026-12-25", end: "2027-02-11" };
  const bounds = (list) => list.map(({ start, end, plannedStart, plannedEnd, delayDays }) => ({ start, end, plannedStart, plannedEnd, delayDays }));

  const onTime = elasticCycles([c1, c2], new Map([["C1", "2026-12-20"], ["C2", null]]));
  assert.deepEqual(bounds(onTime), [
    { start: "2026-11-06", end: "2026-12-24", plannedStart: "2026-11-06", plannedEnd: "2026-12-24", delayDays: 0 },
    { start: "2026-12-25", end: "2027-02-11", plannedStart: "2026-12-25", plannedEnd: "2027-02-11", delayDays: 0 },
  ]);
  assert.deepEqual([c1, c2].map((cycle) => [cycle.start, cycle.end]), [["2026-11-06", "2026-12-24"], ["2026-12-25", "2027-02-11"]]); // 不改入参

  const late = elasticCycles([c1, c2], new Map([["C1", "2026-12-29"], ["C2", null]]));
  assert.deepEqual(bounds(late), [
    { start: "2026-11-06", end: "2026-12-29", plannedStart: "2026-11-06", plannedEnd: "2026-12-24", delayDays: 5 },
    { start: "2026-12-30", end: "2027-02-16", plannedStart: "2026-12-25", plannedEnd: "2027-02-11", delayDays: 5 },
  ]);

  const chained = elasticCycles([c1, c2], new Map([["C1", "2026-12-27"], ["C2", "2027-02-13"]]));
  assert.equal(chained[0].end, "2026-12-27");
  assert.equal(chained[0].delayDays, 3);
  assert.equal(chained[1].start, "2026-12-28"); // 12-25 + 3
  assert.equal(chained[1].end, "2027-02-14"); // max(计划结束 +3, 02-13)
  assert.equal(chained[1].delayDays, 3);

  const later = elasticCycles([c1, c2], new Map([["C1", "2026-12-27"], ["C2", "2027-02-20"]]));
  assert.equal(later[1].end, "2027-02-20"); // 02-11 + 3 < 02-20
  assert.equal(later[1].delayDays, 9);
});

test("shiftRoute shifts rows without a cycle page by the last page-backed cycle's delay", () => {
  const route = parseRoute(ROUTE);
  const elastic = elasticCycles([{ cycle: "C1", start: "2026-11-06", end: "2026-12-24" }], new Map([["C1", "2026-12-29"]]));
  const shifted = shiftRoute(route, elastic);
  assert.equal(shifted.rows[0].start, "2026-11-06");
  assert.equal(shifted.rows[0].end, "2026-12-29");
  assert.equal(shifted.rows[0].plannedStart, "2026-11-06");
  assert.equal(shifted.rows[0].plannedEnd, "2026-12-24");
  assert.deepEqual(
    shifted.rows.slice(1).map((row) => [row.id, row.start, row.end, row.plannedStart, row.plannedEnd]),
    [
      ["C2", "2026-12-30", "2027-02-16", "2026-12-25", "2027-02-11"],
      ["恢复周", "2027-02-17", "2027-02-23", "2027-02-12", "2027-02-18"],
      ["C3", "2027-02-24", "2027-04-13", "2027-02-19", "2027-04-08"],
    ],
  );
  assert.equal(route.rows[0].end, "2026-12-24"); // 不改入参
  assert.equal(route.rows[1].start, "2026-12-25");

  // 顶层 end 同样跟着最后一个有周期页的周期平移
  assert.equal(shifted.plannedEnd, "2027-04-08");
  assert.equal(shifted.end, "2027-04-13");

  const still = shiftRoute(route, elasticCycles([{ cycle: "C1", start: "2026-11-06", end: "2026-12-24" }], new Map([["C1", null]])));
  assert.equal(still.rows[1].start, "2026-12-25");
  assert.equal(still.rows[2].start, "2027-02-12");
  assert.equal(still.plannedEnd, "2027-04-08");
  assert.equal(still.end, "2027-04-08");
  assert.equal(shiftRoute(null, elastic), null);
});

test("shiftRoute also shifts the route's top-level end by the last page-backed cycle's delay", () => {
  const route = parseRoute(ROUTE);
  const late = (last) => elasticCycles([{ cycle: "C1", start: "2026-11-06", end: "2026-12-24" }], new Map([["C1", last]]));

  const onTime = shiftRoute(route, late(null));
  assert.equal(onTime.plannedEnd, "2027-04-08");
  assert.equal(onTime.end, "2027-04-08");
  assert.equal(onTime.start, "2026-11-06");
  assert.equal(onTime.bufferWeeks, 12);

  const shifted = shiftRoute(route, late("2026-12-29"));
  assert.equal(shifted.plannedEnd, "2027-04-08");
  assert.equal(shifted.end, "2027-04-13"); // 04-08 + 5 天
  assert.equal(shifted.start, "2026-11-06");
  assert.equal(shifted.bufferWeeks, 12);
  assert.equal(route.end, "2027-04-08"); // 不改入参
  assert.equal(route.plannedEnd, undefined);
});

test("CLI: 主项课顺延把实际结束日推到计划结束之后；辅助课不推迟", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-elastic-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeSubjects(vault);
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE_AUX);
    await writeFile(join(vault, "wiki", "cycles", "route.md"), ROUTE);
    // 主项课 a 最后一节新课 12-29（计划结束 12-24 之后 5 天）；辅助课 d 最后一节 12-31
    const aLate = planSchedule(lessons(16), { start: "2026-11-06", end: "2026-12-29", rest: SUN, days: A_DAYS, extra: ["2026-12-29"], reviews: "anki" });
    const dLate = planSchedule(lessons(17), { start: "2026-11-06", end: "2026-12-31", rest: SUN, days: A_DAYS, extra: ["2026-12-31"], reviews: "anki" });
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aLate, A_DAYS));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));
    await writeFile(join(vault, "wiki", "courses", "d.md"), courseText(dLate, A_DAYS));

    const day = JSON.parse((await run("node", [SCRIPT, "day", vault, "--date", "2026-12-29", "--json"])).stdout);
    assert.equal(day.cycle, "C1");
    assert.equal(day.week, 8);
    assert.deepEqual(day.lessons.map((item) => [item.course, item.id]), [["a", "D16"]]);

    const after = JSON.parse((await run("node", [SCRIPT, "day", vault, "--date", "2026-12-31", "--json"])).stdout);
    assert.equal(after.cycle, null);

    const info = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-12-20", "--json"])).stdout);
    assert.equal(info.cycle.end, "2026-12-29");
    assert.equal(info.cycle.plannedEnd, "2026-12-24");
    assert.equal(info.cycle.delayDays, 5);
    assert.equal(info.cycle.weeks, 8);
    assert.deepEqual(info.cycle.next, { cycle: "C2", start: "2026-12-30" });
    assert.equal(info.route.cycles.find((row) => row.id === "C2").start, "2026-12-30");
    // 路线顶层 end 也顺延 5 天（route.md 写的是 2027-04-08），weeksLeft 按新的 end 算
    const routePageEnd = parseRoute(ROUTE).end;
    assert.equal(routePageEnd, "2027-04-08");
    assert.equal(info.route.end, "2027-04-13");
    assert.equal(info.route.weeksLeft, 17); // ceil((2027-04-13 - 2026-12-20) / 7)

    const text = (await run("node", [SCRIPT, "overview", vault, "--date", "2026-12-20"])).stdout;
    assert.match(text, /还剩 9 天（比计划晚 5 天，计划结束 2026-12-24）/);
    assert.match(text, /路线 2026-11-06 ~ 2027-04-13 · 还有 17 周/);

    // 带读不设完结（用户 2026-11-11 定）：辅助课晚于实际结束日的课次不再算「在周期之外」。
    assert.deepEqual(JSON.parse((await run("node", [SCRIPT, "check", vault, "--json"])).stdout), { ok: true, problems: [] });

    // 只有辅助课晚（主项最后一节 12-23）：实际结束日仍是 12-24，delayDays 0
    const aOnTime = planSchedule(lessons(14), { start: "2026-11-06", end: "2026-12-24", rest: SUN, days: A_DAYS, reviews: "anki" });
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aOnTime, A_DAYS));
    const steady = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-12-20", "--json"])).stdout);
    assert.equal(steady.cycle.end, "2026-12-24");
    assert.equal(steady.cycle.plannedEnd, "2026-12-24");
    assert.equal(steady.cycle.delayDays, 0);
    assert.equal(steady.route.end, "2027-04-08");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("CLI: 周期实际结束日只看主项课；辅助课（带读）最后一节晚 20 天也不拉长周期", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-aux-elastic-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeSubjects(vault);
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE_AUX);
    // 主项课 a 最后一节 12-23、b 最后一节 12-24（都在周期内）。
    const aOnTime = planSchedule(lessons(14), { start: "2026-11-06", end: "2026-12-24", rest: SUN, days: A_DAYS, reviews: "anki" });
    const bOnTime = planSchedule(lessons(14), { start: "2026-11-06", end: "2026-12-24", rest: SUN, days: B_DAYS, reviews: "anki" });
    // 辅助课 d（科目 z）最后一节在周期结束后 20 天：2026-12-24 + 20 = 2027-01-13。
    const dLate = planSchedule(lessons(20), { start: "2026-11-06", end: "2027-01-13", rest: SUN, days: A_DAYS, reviews: "anki" });
    assert.equal(aOnTime.filter((row) => row.kind === "new").at(-1).date, "2026-12-23");
    assert.equal(bOnTime.filter((row) => row.kind === "new").at(-1).date, "2026-12-24");
    assert.equal(dLate.filter((row) => row.kind === "new").at(-1).date, "2027-01-13");
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aOnTime, A_DAYS));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bOnTime, B_DAYS));
    await writeFile(join(vault, "wiki", "courses", "d.md"), courseText(dLate, A_DAYS));

    const info = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-12-20", "--json"])).stdout);
    // 辅助课确实被读到、且最后一节确实在周期结束后 20 天。
    const aux = info.courses.find((course) => course.slug === "d");
    assert.equal(aux.role, "aux");
    assert.equal(aux.end, "2027-01-13");
    assert.deepEqual(info.courses.filter((course) => course.role === "main").map((course) => course.end), ["2026-12-23", "2026-12-24"]);
    // 实际结束日仍是主项课的最后一天（12-24），不被辅助课拉到 2027-01-13。
    assert.equal(info.cycle.end, "2026-12-24");
    assert.equal(info.cycle.plannedEnd, "2026-12-24");
    assert.equal(info.cycle.delayDays, 0);
    assert.equal(info.cycle.weeks, 7);
    assert.equal(info.cycle.next, null, "没有 C2 页时 next 为 null");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

// ---- 带读跨周期（用户 2026-11-11 定：带读不设完结，没上的课顺延、可以越过周期结束日进入下一周期） ----

const CYCLE2 = CYCLE.replace("cycle: C1", "cycle: C2")
  .replace("start: 2026-11-06", "start: 2026-12-25")
  .replace("end: 2026-12-24", "end: 2027-02-11")
  .replace("# C1 · 离散 + 范式", "# C2 · 离散 + 范式");
const RANGE2 = { start: "2026-12-25", end: "2027-02-11", rest: SUN, reviews: "anki" };
const a2Rows = planSchedule(lessons(4), { ...RANGE2, days: A_DAYS });
const b2Rows = planSchedule(lessons(4), { ...RANGE2, days: B_DAYS });
// 带读 d（科目 z）：周一三上课、不设 end，16 节里 D15（12-28）、D16（12-30）顺延进 C2。
const dCarryRows = planSchedule(lessons(16), { start: "2026-11-06", end: "2026-12-30", rest: SUN, days: A_DAYS, reviews: "anki" });
// x、y 页各加一门 C2 的课；w 是路线外科目（两个周期模板都没有它），它的科目页链接 e 与 f。
const SUBJECT_X2 = SUBJECT_X.replace("[[courses/old]] - 旧课", "[[courses/old]] - 旧课\n- [[courses/a2\\|离散二]]");
const SUBJECT_Y2 = `${SUBJECT_Y}\n## Courses\n\n- [[courses/b2\\|范式二]]\n`;
const SUBJECT_W = "# W\n\n## Courses\n\n- [[courses/e\\|E 书]]\n- [[courses/f\\|W 书]]\n";

/** courseText 之外再补一节 Relationships，写这门课属于哪个科目。 */
function courseTextWithSubject(rows, days, subject, record = "") {
  return courseText(rows, days, record).replace("# 课\n", `# 课\n\n## Relationships\n\n- 科目：[[subjects/${subject}]]\n`);
}

/** C1（x、y 主项，z 辅助）+ C2（x、y 主项，没有 z）+ 路线外课 f 的库。 */
async function writeCarryVault(vault, { record = "" } = {}) {
  await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
  await mkdir(join(vault, "wiki", "courses"), { recursive: true });
  await writeSubjects(vault);
  await writeFile(join(vault, "wiki", "subjects", "x.md"), SUBJECT_X2);
  await writeFile(join(vault, "wiki", "subjects", "y.md"), SUBJECT_Y2);
  await writeFile(join(vault, "wiki", "subjects", "w.md"), SUBJECT_W);
  await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE_AUX);
  await writeFile(join(vault, "wiki", "cycles", "c2.md"), CYCLE2);
  await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aRows, A_DAYS));
  await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));
  await writeFile(join(vault, "wiki", "courses", "a2.md"), courseText(a2Rows, A_DAYS));
  await writeFile(join(vault, "wiki", "courses", "b2.md"), courseText(b2Rows, B_DAYS));
  await writeFile(join(vault, "wiki", "courses", "d.md"), courseTextWithSubject(dCarryRows, A_DAYS, "z", record));
  // f：路线外科目 w 的课，有排期但新课次全在 C1 之前——哪个周期都不该装它。
  const fRows = planSchedule(lessons(4), { start: "2026-10-05", end: "2026-10-14", rest: SUN, days: A_DAYS, reviews: "anki" });
  await writeFile(join(vault, "wiki", "courses", "f.md"), courseTextWithSubject(fRows, A_DAYS, "w"));
}

test("CLI: 带读顺延进下一周期——模板里没有该科目，day / overview / check 照样看得见", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-carry-"));
  try {
    await writeCarryVault(vault);
    const day = JSON.parse((await run("node", [SCRIPT, "day", vault, "--date", "2026-12-28", "--json"])).stdout);
    assert.equal(day.cycle, "C2");
    assert.ok(day.lessons.some((item) => item.course === "d" && item.id === "D15"), JSON.stringify(day.lessons));
    assert.equal(day.roles.d, "aux");
    assert.equal(day.names.d, "C"); // z 科目页里链到 d 的别名

    const info = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-12-28", "--json"])).stdout);
    assert.equal(info.cycle.cycle, "C2");
    const d = info.courses.find((course) => course.slug === "d");
    assert.equal(d.role, "aux");
    assert.equal(d.subject, "z");
    // f 的新课次全在 C2 之前：C2 不装它。
    assert.ok(!info.courses.some((course) => course.slug === "f"));

    // check：d 越过 C1 结束日、落在 C2 都不是问题——C1、C2 都不报「在周期之外」「不是深度日」。
    assert.deepEqual(JSON.parse((await run("node", [SCRIPT, "check", vault, "--json"])).stdout), { ok: true, problems: [] });
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("CLI: 带读在下一周期的课次全部完成后，下一周期不再装它", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-carry-done-"));
  try {
    await writeCarryVault(vault, { record: "### 2026-12-30-01\n完成：D15、D16" });
    const day = JSON.parse((await run("node", [SCRIPT, "day", vault, "--date", "2026-12-28", "--json"])).stdout);
    assert.equal(day.cycle, "C2");
    assert.ok(!day.lessons.some((item) => item.course === "d"));
    assert.equal(day.roles.d, undefined);

    const info = JSON.parse((await run("node", [SCRIPT, "overview", vault, "--date", "2026-12-28", "--json"])).stdout);
    assert.ok(!info.courses.some((course) => course.slug === "d"));
    assert.deepEqual(JSON.parse((await run("node", [SCRIPT, "check", vault, "--json"])).stdout), { ok: true, problems: [] });
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("CLI: 辅助课晚于周期结束日不算越界；早于开始日、主项课越界照报", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-aux-bound-"));
  try {
    await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
    await mkdir(join(vault, "wiki", "courses"), { recursive: true });
    await writeSubjects(vault);
    await writeFile(join(vault, "wiki", "cycles", "c1.md"), CYCLE_AUX);
    await writeFile(join(vault, "wiki", "courses", "a.md"), courseText(aRows, A_DAYS));
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bRows, B_DAYS));
    // 辅助课 d 最后一节 12-30 > C1 结束 12-24：不报「在周期之外」。
    await writeFile(join(vault, "wiki", "courses", "d.md"), courseText(dCarryRows, A_DAYS));
    assert.deepEqual(JSON.parse((await run("node", [SCRIPT, "check", vault, "--json"])).stdout), { ok: true, problems: [] });

    // 早于开始日仍照报：主项 b（11-03、11-05）与辅助 d（11-02、11-04）各两节；d 的 12-30 仍不报。
    const bEarly = planSchedule(lessons(6), { start: "2026-11-03", end: "2026-12-24", rest: SUN, days: B_DAYS, reviews: "anki" });
    const dEarly = planSchedule(lessons(18), { start: "2026-11-02", end: "2026-12-30", rest: SUN, days: A_DAYS, reviews: "anki" });
    await writeFile(join(vault, "wiki", "courses", "b.md"), courseText(bEarly, B_DAYS));
    await writeFile(join(vault, "wiki", "courses", "d.md"), courseText(dEarly, A_DAYS));
    await assert.rejects(run("node", [SCRIPT, "check", vault, "--json"]), (error) => {
      const result = JSON.parse(error.stdout);
      return (
        result.ok === false &&
        result.problems.length === 4 &&
        result.problems.some((problem) => /courses\/b 的 D1（2026-11-03）在周期之外/.test(problem)) &&
        result.problems.some((problem) => /courses\/d 的 D1（2026-11-02）在周期之外/.test(problem)) &&
        !result.problems.some((problem) => /12-30）在周期之外/.test(problem))
      );
    });
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("CLI: 带过来的带读与本周期同科目的课撞同一天，仍报「同时排了」", async () => {
  const vault = await mkdtemp(join(tmpdir(), "cycle-carry-clash-"));
  try {
    await writeCarryVault(vault);
    // e 挂在路线外科目 w 的页面上，但课程页 Relationships 写的是 x——C2 模板里有 x。
    // x 的科目页没有链接 e，所以 e 只能由「带过来」的路径装进 C2（carried）；它与 a2 撞在 12-28。
    const eDays = parseDays("mon", SUN);
    const eRows = planSchedule(lessons(1), { start: "2026-12-28", end: "2026-12-28", rest: SUN, days: eDays, reviews: "anki" });
    await writeFile(join(vault, "wiki", "courses", "e.md"), courseTextWithSubject(eRows, eDays, "x"));
    await assert.rejects(run("node", [SCRIPT, "check", vault, "--json"]), (error) => {
      const result = JSON.parse(error.stdout);
      return (
        result.ok === false &&
        result.problems.length === 1 &&
        result.problems[0] === "C2：subjects/x 在 2026-12-28 同时排了 courses/a2 与 courses/e"
      );
    });
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
