// cycle.mjs 的测试：周期页解析、某天/某周的情况、与课程排期的一致性检查，以及一次真实的 CLI 运行。全部在临时目录。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkCycle, cycleAuxSubjects, cycleSubjects, dayInfo, findCycle, monthInfo, parseCycle, parseRoute, planInfo, subjectCourses, weekInfo, weekOf } from "./cycle.mjs";
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

test("monthInfo adds each day's lessons, the short names, cycle bounds and recovery days", () => {
  const cycle = parseCycle(CYCLE);
  const courses = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) });
  const info = monthInfo([cycle], "2026-11", { courses: new Map([["C1", courses]]), route: parseRoute(ROUTE) });
  assert.deepEqual(info.lessons["2026-11-06"], [{ course: "a", id: "D1", content: "第 1 课" }]);
  assert.deepEqual(info.lessons["2026-11-10"], [{ course: "b", id: "D1", content: "第 1 课" }]);
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
