// cycle.mjs 的端到端补测（全量测试 B1）：周期首末日、推迟后的 W8、周期之间与路线之后、没有 route.md、
// 只有辅助课晚、主项提前完成、推迟两个周期，最后对库副本逐日冒烟 + check。
// 全部在 mkdtemp 临时目录里造库；fixture 与 cycle.test.mjs 开头一致（各自复制，不从旧测试 import）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dayInfo, findCycle, loadCourses, loadElasticCycles, loadRoute, planInfo, shiftRoute, weekOf } from "./cycle.mjs";
import { addDays, parseDays, parseRest, planSchedule, readSchedule, renderTable } from "../course/course-schedule.mjs";

const run = promisify(execFile);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "cycle.mjs");
const SUN = parseRest("sun");
// 只读的库副本（真实 Wiki 的拷贝）；不碰 ~/xuegen-data。
const VAULT_COPY = "/tmp/xg-e2e/vault/GJY";

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

// C2 的周模板链接 subjects/w（科目页只链接 c），C2 的主项课是 c。
const CYCLE_C2 = `---
cycle: C2
start: 2026-12-25
end: 2027-02-11
---

# C2 · 继续

## Weekly Template

| 星期 | 类型 | 课程 |
|---|---|---|
| 周一 | 深度 | [[subjects/w\\|范式]] |
| 周二 | 深度 | [[subjects/w\\|范式]] |
| 周三 | 深度 | [[subjects/w\\|范式]] |
| 周四 | 深度 | [[subjects/w\\|范式]] |
| 周五 | 整合 | — |
| 周六 | 低强度 | — |
| 周日 | 休息 | — |

## Log
- 2026-12-25: 创建
`;
const SUBJECT_W = "# 范式\n\n## Courses\n- [[courses/c\\|范式]]\n";

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
// 主项 a 最后一节新课 12-29（计划结束 12-24 之后 5 天）；辅助 d 最后一节 12-31。
const aLate = planSchedule(lessons(16), { start: "2026-11-06", end: "2026-12-29", rest: SUN, days: A_DAYS, extra: ["2026-12-29"], reviews: "anki" });
const dLate = planSchedule(lessons(17), { start: "2026-11-06", end: "2026-12-31", rest: SUN, days: A_DAYS, extra: ["2026-12-31"], reviews: "anki" });
// 主项准时：最后一节 12-23 / 12-24。
const aOnTime = planSchedule(lessons(14), { start: "2026-11-06", end: "2026-12-24", rest: SUN, days: A_DAYS, reviews: "anki" });
// 主项提前完成：最后一节 12-10。
const aEarly = planSchedule(lessons(11), { start: "2026-11-06", end: "2026-12-10", rest: SUN, days: A_DAYS, extra: ["2026-12-10"], reviews: "anki" });
// C2 的主项课：12-30 ~ 2027-02-19 共 16 节（比计划结束 02-11 晚 8 天）。
const cC2 = planSchedule(lessons(16), { start: "2026-12-30", end: "2027-02-19", rest: SUN, days: A_DAYS, extra: ["2027-02-19"], reviews: "anki" });

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

/** 造一个临时库：files 的键是 wiki/ 下的相对路径。 */
async function makeVault(files) {
  const vault = await mkdtemp(join(tmpdir(), "cycle-full-"));
  await mkdir(join(vault, "wiki", "cycles"), { recursive: true });
  await mkdir(join(vault, "wiki", "courses"), { recursive: true });
  await writeSubjects(vault);
  for (const [rel, text] of Object.entries(files)) await writeFile(join(vault, "wiki", rel), text);
  return vault;
}

/** 跑 CLI 并解析 --json 输出；退出码非 0 时返回 { code, json } 供「不该报错」的用例检查。 */
async function cli(vault, command, ...rest) {
  try {
    const { stdout } = await run("node", [SCRIPT, command, vault, ...rest, "--json"]);
    return { code: 0, json: JSON.parse(stdout) };
  } catch (error) {
    return { code: error.code ?? 1, json: error.stdout ? JSON.parse(error.stdout) : null };
  }
}

test("情况 1：周期首日 11-06（周五）与末日 12-24 的 day / week", async () => {
  const vault = await makeVault({ "cycles/c1.md": CYCLE, "courses/a.md": courseText(aRows, A_DAYS), "courses/b.md": courseText(bRows, B_DAYS) });
  try {
    const first = (await cli(vault, "day", "--date", "2026-11-06")).json;
    assert.equal(first.cycle, "C1");
    assert.equal(first.week, 1);
    assert.equal(first.weekday, "周五");
    assert.equal(first.type, "整合");
    assert.deepEqual(first.lessons.map((item) => item.id), ["D1"]);

    const last = (await cli(vault, "day", "--date", "2026-12-24")).json;
    assert.equal(last.cycle, "C1");
    assert.equal(last.week, 7);
    assert.equal(last.type, "深度");
    assert.equal(last.subject, "y");
    assert.equal(last.course, "b");

    const week = (await cli(vault, "week", "--date", "2026-12-24")).json;
    assert.equal(week.cycle, "C1");
    assert.equal(week.week, 7);
    assert.equal(week.days.length, 7);
    assert.equal(week.start, "2026-12-18");
    assert.equal(week.end, "2026-12-24");
    assert.ok(week.days.some((day) => day.date === "2026-12-24"));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("情况 2：主项推到 12-29 后 W8 与 12 月的周期归属", async () => {
  const vault = await makeVault({
    "cycles/c1.md": CYCLE,
    "cycles/route.md": ROUTE,
    "courses/a.md": courseText(aLate, A_DAYS),
    "courses/b.md": courseText(bRows, B_DAYS),
  });
  try {
    const week = (await cli(vault, "week", "--date", "2026-12-28")).json;
    assert.equal(week.cycle, "C1");
    assert.equal(week.week, 8);
    assert.equal(week.days.length, 7);
    // 周从周期首日（周五）起算 7 天，所以 W8 = 12-25 ~ 12-31。
    assert.equal(week.start, "2026-12-25");
    assert.equal(week.end, "2026-12-31");
    const tue = week.days.find((day) => day.date === "2026-12-29");
    assert.deepEqual(tue.lessons.map((item) => item.course), ["a"]);

    const month = (await cli(vault, "month", "2026-12")).json;
    for (const date of ["2026-12-25", "2026-12-26", "2026-12-27", "2026-12-28", "2026-12-29"]) {
      assert.equal(month.days[date]?.cycle, "C1", `${date} 应算 C1`);
    }
    // C2 没有周期页：平移后的 C2 起点（12-30）不再出现在 month 的 days 里（month 只列有周期页的周期）。
    assert.equal(month.days["2026-12-30"], undefined);
    // 平移后的 C2 起点由 overview 的 next 给出。
    const info = (await cli(vault, "overview", "--date", "2026-12-20")).json;
    assert.equal(info.cycle.end, "2026-12-29");
    assert.equal(info.cycle.delayDays, 5);
    assert.deepEqual(info.cycle.next, { cycle: "C2", start: "2026-12-30" });
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("情况 3：周期之间 12-25 与路线之后 2028-01-01", async () => {
  const vault = await makeVault({
    "cycles/c1.md": CYCLE,
    "cycles/route.md": ROUTE,
    "courses/a.md": courseText(aOnTime, A_DAYS),
    "courses/b.md": courseText(bRows, B_DAYS),
  });
  try {
    // C1 不推迟：12-25 落在 C1 之后、C2（没有周期页）之内 → cycle 为 null。
    const between = await cli(vault, "day", "--date", "2026-12-25");
    assert.equal(between.code, 0);
    assert.equal(between.json.cycle, null);
    assert.equal(between.json.week, null);
    assert.equal(between.json.type, null);

    const far = await cli(vault, "day", "--date", "2028-01-01");
    assert.equal(far.code, 0);
    assert.equal(far.json.cycle, null);
    assert.deepEqual(far.json.lessons, []);

    const overview = await cli(vault, "overview", "--date", "2028-01-01");
    assert.equal(overview.code, 0);
    assert.equal(overview.json.cycle, null);
    assert.equal(overview.json.route.end, "2027-04-08");
    assert.equal(overview.json.route.weeksLeft, 0);
    assert.deepEqual(overview.json.courses, []);

    const week = await cli(vault, "week", "--date", "2028-01-01");
    assert.equal(week.code, 0);
    assert.equal(week.json.cycle, null);
    assert.deepEqual(week.json.days, []);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("情况 4：没有 route.md 时 day / week / overview / check 都不崩溃", async () => {
  const vault = await makeVault({ "cycles/c1.md": CYCLE, "courses/a.md": courseText(aRows, A_DAYS), "courses/b.md": courseText(bRows, B_DAYS) });
  try {
    const day = await cli(vault, "day", "--date", "2026-11-09");
    assert.equal(day.code, 0);
    assert.equal(day.json.cycle, "C1");

    const week = await cli(vault, "week", "--date", "2026-11-09");
    assert.equal(week.code, 0);
    assert.equal(week.json.days.length, 7);

    const overview = await cli(vault, "overview", "--date", "2026-11-09");
    assert.equal(overview.code, 0);
    assert.equal(overview.json.route, null);
    assert.equal(overview.json.cycle.cycle, "C1");
    assert.equal(overview.json.cycle.next, null);
    assert.deepEqual(overview.json.cycle.auxSubjects, []);

    const check = await cli(vault, "check");
    assert.equal(check.code, 0);
    assert.deepEqual(check.json, { ok: true, problems: [] });
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("情况 5：只有辅助课晚（d 到 12-31）不影响周期结束日，check 报 d 在周期之外", async () => {
  const vault = await makeVault({
    "cycles/c1.md": CYCLE_AUX,
    "cycles/route.md": ROUTE,
    "courses/a.md": courseText(aOnTime, A_DAYS),
    "courses/b.md": courseText(bRows, B_DAYS),
    "courses/d.md": courseText(dLate, A_DAYS),
  });
  try {
    const info = (await cli(vault, "overview", "--date", "2026-12-20")).json;
    assert.equal(info.cycle.end, "2026-12-24");
    assert.equal(info.cycle.plannedEnd, "2026-12-24");
    assert.equal(info.cycle.delayDays, 0);
    assert.equal(info.cycle.weeks, 7);
    assert.equal(info.route.end, "2027-04-08");
    assert.deepEqual(info.cycle.next, { cycle: "C2", start: "2026-12-25" });

    const check = await cli(vault, "check");
    assert.notEqual(check.code, 0);
    assert.equal(check.json.ok, false);
    assert.ok(check.json.problems.some((problem) => /courses\/d 的 D17（2026-12-31）在周期之外/.test(problem)), check.json.problems.join("\n"));
    assert.ok(!check.json.problems.some((problem) => /应为 49 天/.test(problem)));
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("情况 6：主项提前完成（最后一节 12-10）不应缩短周期", async () => {
  const vault = await makeVault({
    "cycles/c1.md": CYCLE,
    "cycles/route.md": ROUTE,
    "courses/a.md": courseText(aEarly, A_DAYS),
    "courses/b.md": courseText(bRows, B_DAYS),
  });
  try {
    const info = (await cli(vault, "overview", "--date", "2026-12-01")).json;
    // 设计：周期固定 7 周学时，提前完成不让周期变短。
    assert.equal(info.cycle.end, "2026-12-24");
    assert.equal(info.cycle.plannedEnd, "2026-12-24");
    assert.equal(info.cycle.delayDays, 0);
    assert.equal(info.cycle.weeks, 7);
    assert.equal(info.cycle.next.start, "2026-12-25");
    // 提前完成后没有「下一节」，但课程仍在列表里。
    const a = info.courses.find((course) => course.slug === "a");
    assert.equal(a.end, "2026-12-10");
    assert.equal(a.total, 11);
    // 库里没有「完成：」记录，所以所有课次都还没学，next 是第一节。
    assert.deepEqual(a.next, { id: "D1", date: "2026-11-09", content: "第 1 课" });
    assert.equal(a.done, 0);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("情况 7：C1 晚 5 天、C2 再晚 3 天，路线后续整体平移 8 天", async () => {
  const vault = await makeVault({
    "cycles/c1.md": CYCLE,
    "cycles/c2.md": CYCLE_C2,
    "cycles/route.md": ROUTE,
    "subjects/w.md": SUBJECT_W,
    "courses/a.md": courseText(aLate, A_DAYS),
    "courses/b.md": courseText(bRows, B_DAYS),
    "courses/c.md": courseText(cC2, A_DAYS),
  });
  try {
    const c1 = (await cli(vault, "overview", "--date", "2026-12-20")).json;
    assert.equal(c1.cycle.end, "2026-12-29");
    assert.equal(c1.cycle.delayDays, 5);

    const c2 = (await cli(vault, "overview", "--date", "2027-01-15")).json;
    assert.equal(c2.cycle.cycle, "C2");
    assert.equal(c2.cycle.start, "2026-12-30");
    assert.equal(c2.cycle.plannedEnd, "2027-02-11");
    assert.equal(c2.cycle.end, "2027-02-19");
    assert.equal(c2.cycle.delayDays, 8);
    assert.equal(c2.cycle.weeks, 8);
    assert.deepEqual(
      c2.route.cycles.slice(0, 2).map((row) => [row.id, row.start, row.end]),
      [
        ["C1", "2026-11-06", "2026-12-29"],
        ["C2", "2026-12-30", "2027-02-19"],
      ],
    );
    const c3 = c2.route.cycles.find((row) => row.id === "C3");
    assert.deepEqual([c3.start, c3.end], ["2027-02-27", "2027-04-16"]);
    assert.deepEqual(c2.route.recovery, [{ start: "2027-02-20", end: "2027-02-26" }]);
    assert.equal(c2.route.end, "2027-04-16");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test(
  "情况 8：库副本逐日冒烟（day 与 overview 一致），并输出 check 的问题",
  { skip: existsSync(VAULT_COPY) ? false : `${VAULT_COPY} 不存在（需要有库副本的机器）` },
  async () => {
    const days = [];
    for (let date = "2026-11-01"; date <= "2027-03-31"; date = addDays(date, 1)) days.push(date);
    assert.equal(days.length, 151);

    const problems = [];
    for (const date of days) {
      const cycles = await loadElasticCycles(VAULT_COPY);
      const route = shiftRoute(await loadRoute(VAULT_COPY), cycles);
      const cycle = findCycle(cycles, date);
      const courses = cycle ? await loadCourses(VAULT_COPY, cycle) : new Map();
      const day = dayInfo(cycle, courses, date);
      const overview = planInfo(route, cycle, courses, date);
      if ((day.cycle === null) !== (overview.cycle === null)) problems.push(`${date}：day 与 overview 的 cycle 有无不一致`);
      if (day.cycle !== (overview.cycle?.cycle ?? null)) problems.push(`${date}：day 的 cycle 与 overview 的 cycle 不一致`);
      if (day.cycle !== null) {
        if (!(day.week >= 1)) problems.push(`${date}：week 为 ${day.week}`);
        if (date < cycle.start || date > cycle.end) problems.push(`${date}：不在 ${cycle.start} ~ ${cycle.end} 之内`);
        if (day.week !== weekOf(cycle, date)) problems.push(`${date}：week 与 weekOf 不一致`);
        if (overview.cycle.week !== day.week) problems.push(`${date}：overview 的 week 与 day 不一致`);
        if (day.type === null) problems.push(`${date}：有周期但 type 为 null`);
      }
    }
    assert.deepEqual(problems, []);

    // C1 从 11-06 开始；C1 实际结束日的次日，若有别的周期覆盖就是那个周期，否则 cycle null。
    const cycles = await loadElasticCycles(VAULT_COPY);
    const first = dayInfo(findCycle(cycles, "2026-11-06"), new Map(), "2026-11-06");
    assert.equal(first.cycle, "C1");
    const c1 = cycles.find((row) => row.cycle === "C1");
    assert.ok(c1, "库副本里应有 C1");
    const afterC1 = addDays(c1.end, 1);
    const covering = findCycle(cycles, afterC1);
    assert.equal(dayInfo(covering, new Map(), afterC1).cycle, covering ? covering.cycle : null);

    const check = await cli(VAULT_COPY, "check");
    assert.ok(check.json !== null, "check 应输出 JSON");
    // 不断言内容，原样留给报告。
    assert.equal(typeof check.json.ok, "boolean");
    assert.ok(Array.isArray(check.json.problems));
  },
);
