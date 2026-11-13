// course-schedule.mjs 的测试：日期计算、排期、复习间隔、顺延、标记段替换，以及一次真实的 CLI 运行。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  addDays,
  addStudyDays,
  completedIds,
  isValidDate,
  lastNewLessonDate,
  nextStudyDay,
  parseDays,
  parseExtra,
  parseRest,
  parseReviews,
  planSchedule,
  readSchedule,
  renderTable,
  shiftSchedule,
  studyDaysBetween,
  weekday,
  writeSchedule,
} from "./course-schedule.mjs";

const run = promisify(execFile);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "course-schedule.mjs");
const SUN = parseRest("sun");
const lessons = (n) => Array.from({ length: n }, (_, i) => ({ content: `第 ${i + 1} 课：主题${i + 1}` }));

test("date helpers handle month ends and rest days", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(weekday("2026-11-08"), 0); // 周日
  assert.equal(nextStudyDay("2026-11-08", SUN), "2026-11-09");
  assert.equal(addStudyDays("2026-11-07", 1, SUN), "2026-11-09"); // 跳过周日
  assert.equal(studyDaysBetween("2026-11-04", "2026-11-11", SUN), 6);
  assert.equal(isValidDate("2026-02-30"), false);
  assert.throws(() => parseRest("xyz"));
  assert.throws(() => parseRest("sun,mon,tue,wed,thu,fri,sat"));
  assert.equal(parseRest("none").size, 0);
});

test("plan puts lessons on study days in order and skips rest days", () => {
  const rows = planSchedule(lessons(6), { start: "2026-11-04", end: "2026-11-10", rest: SUN });
  const fresh = rows.filter((row) => row.kind === "new");
  assert.deepEqual(
    fresh.map((row) => [row.id, row.date]),
    [
      ["D1", "2026-11-04"],
      ["D2", "2026-11-05"],
      ["D3", "2026-11-06"],
      ["D4", "2026-11-07"],
      ["D5", "2026-11-09"],
      ["D6", "2026-11-10"],
    ],
  );
  assert.ok(rows.every((row) => weekday(row.date) !== 0), "no row on a Sunday");
});

test("each lesson gets reviews at +1/+3/+7/+14, snapped to study days, late ones marked", () => {
  const rows = planSchedule(lessons(1), { start: "2026-11-04", end: "2026-11-10", rest: SUN });
  const reviews = rows.filter((row) => row.kind === "review");
  assert.deepEqual(
    reviews.map((row) => [row.id, row.date]),
    [
      ["R1-D1", "2026-11-05"],
      ["R2-D1", "2026-11-07"],
      ["R3-D1", "2026-11-11"],
      ["R4-D1", "2026-11-18"],
    ],
  );
  assert.match(reviews[2].content, /课后复习/);
  assert.doesNotMatch(reviews[0].content, /课后复习/);
});

test("spare study days become flex rows; too many lessons is an error with a suggestion", () => {
  const rows = planSchedule(lessons(2), { start: "2026-11-04", end: "2026-11-06", rest: SUN });
  assert.deepEqual(
    rows.filter((row) => row.kind === "flex").map((row) => row.date),
    ["2026-11-06"],
  );
  assert.throws(
    () => planSchedule(lessons(5), { start: "2026-11-04", end: "2026-11-06", rest: SUN }),
    (error) => error.suggestedEnd === "2026-11-09",
  );
  assert.throws(() => planSchedule([], { start: "2026-11-04", end: "2026-11-06", rest: SUN }));
  assert.throws(() => planSchedule([{ id: "A", content: "x" }, { id: "A", content: "y" }], {
    start: "2026-11-04",
    end: "2026-11-06",
    rest: SUN,
  }));
});

const course = (body) =>
  [
    "<!-- xuegen:course-state -->",
    "# 测试课",
    "",
    "## 计划表（参考）",
    "人工备注：第三周可能出差。",
    "",
    body,
    "## Learning Record",
    "### 2026-11-04-01",
    "完成：D1、R1-D0",
    "",
  ].join("\n");

test("write replaces only the marked table and keeps hand-written notes", () => {
  const rows = planSchedule(lessons(2), { start: "2026-11-04", end: "2026-11-06", rest: SUN });
  const once = writeSchedule(course(""), renderTable(rows, SUN));
  assert.match(once, /人工备注：第三周可能出差。/);
  const parsed = readSchedule(once);
  assert.equal(parsed.rows.length, rows.length);
  assert.equal([...parsed.rest][0], 0);

  const again = writeSchedule(once, renderTable(rows.slice(0, 1), SUN));
  assert.equal(readSchedule(again).rows.length, 1);
  assert.equal((again.match(/xuegen:schedule:start/g) ?? []).length, 1);
  assert.match(again, /人工备注/);
  assert.match(again, /## Learning Record/);
});

test("a course without a plan section gets one before Learning Record", () => {
  const text = "# 课\n\n## Next Session\nx\n\n## Learning Record\n";
  const rows = planSchedule(lessons(1), { start: "2026-11-04", end: "2026-11-04", rest: SUN });
  const written = writeSchedule(text, renderTable(rows, SUN));
  assert.ok(written.indexOf("## 计划表") < written.indexOf("## Learning Record"));
});

test("completedIds reads 完成： lines from Learning Record only", () => {
  const done = completedIds(course(""));
  assert.deepEqual([...done].sort(), ["D1", "R1-D0"]);
  assert.equal(completedIds("## Today\n完成：D9\n").size, 0);
});

test("shift moves the earliest missed row to today and everything after it by the same study days", () => {
  const rows = planSchedule(lessons(4), { start: "2026-11-04", end: "2026-11-09", rest: SUN });
  // D1 done on 11-04; 11-05 (D2, R1-D1) missed; today 11-06.
  const done = new Set(["D1"]);
  const { rows: moved, shiftedDays } = shiftSchedule(rows, done, "2026-11-06", SUN);
  assert.equal(shiftedDays, 1);
  const byId = Object.fromEntries(moved.map((row) => [row.id, row.date]));
  assert.equal(byId.D1, "2026-11-04"); // 已完成不动
  assert.equal(byId.D2, "2026-11-06");
  assert.equal(byId["R1-D1"], "2026-11-06");
  assert.equal(byId.D3, "2026-11-07");
  assert.equal(byId.D4, "2026-11-09"); // 11-08 是周日
  assert.ok(moved.every((row) => row.kind !== "flex"), "flex rows are dropped on shift");
});

test("shift is a no-op when nothing is overdue", () => {
  const rows = planSchedule(lessons(2), { start: "2026-11-04", end: "2026-11-06", rest: SUN });
  assert.equal(shiftSchedule(rows, new Set(), "2026-11-04", SUN).shiftedDays, 0);
  assert.equal(shiftSchedule(rows, new Set(["D1", "R1-D1", "D2"]), "2026-11-06", SUN).shiftedDays, 0);
});

test("CLI: plan --write, next, shift --write, and the read-only lock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-"));
  try {
    const file = join(dir, "c.md");
    const lessonsFile = join(dir, "lessons.json");
    await writeFile(file, course(""));
    await writeFile(lessonsFile, JSON.stringify(lessons(3)));

    const planned = await run("node", [SCRIPT, "plan", file, "--start", "2026-11-04", "--end", "2026-11-07", "--rest", "sun", "--lessons", lessonsFile, "--write", "--json"]);
    assert.equal(JSON.parse(planned.stdout).lastLesson, "2026-11-06");
    assert.match(await readFile(file, "utf8"), /\| D2 \| 2026-11-05（周四） \|/);

    const next = await run("node", [SCRIPT, "next", file, "--date", "2026-11-05", "--json"]);
    assert.deepEqual(JSON.parse(next.stdout).rows.map((row) => row.id), ["D2", "R1-D1"]);

    const shifted = await run("node", [SCRIPT, "shift", file, "--today", "2026-11-07", "--write", "--json"]);
    const result = JSON.parse(shifted.stdout);
    assert.equal(result.shiftedDays, 2);
    assert.equal(result.written, true);

    await chmod(file, 0o444);
    await assert.rejects(
      run("node", [SCRIPT, "shift", file, "--today", "2026-11-12", "--write"]),
      (error) => /只读/.test(error.stderr),
    );
  } finally {
    await chmod(join(dir, "c.md"), 0o644).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

const MW = parseDays("mon,wed", SUN);

test("parseDays defaults to every non-rest day and rejects rest or unknown days", () => {
  assert.deepEqual([...parseDays("", SUN)].sort(), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...MW].sort(), [1, 3]);
  assert.throws(() => parseDays("sun", SUN), /休息日/);
  assert.throws(() => parseDays("xyz", SUN), /未知上课日/);
});

test("plan with --days puts new lessons only on those weekdays; reviews still land on any non-rest day", () => {
  const rows = planSchedule(lessons(4), { start: "2026-11-05", end: "2026-11-18", rest: SUN, days: MW });
  assert.deepEqual(
    rows.filter((row) => row.kind === "new").map((row) => [row.id, row.date]),
    [
      ["D1", "2026-11-09"],
      ["D2", "2026-11-11"],
      ["D3", "2026-11-16"],
      ["D4", "2026-11-18"],
    ],
  );
  assert.deepEqual(
    rows.filter((row) => row.id.endsWith("-D1")).map((row) => [row.id, row.date]),
    [
      ["R1-D1", "2026-11-10"],
      ["R2-D1", "2026-11-12"],
      ["R3-D1", "2026-11-16"],
      ["R4-D1", "2026-11-23"],
    ],
  );
  assert.equal(rows.filter((row) => row.kind === "flex").length, 0);
  assert.ok(rows.every((row) => weekday(row.date) !== 0), "no row on a Sunday");
  assert.throws(
    () => planSchedule(lessons(5), { start: "2026-11-05", end: "2026-11-18", rest: SUN, days: MW }),
    (error) => error.suggestedEnd === "2026-11-23",
  );
});

test("days round-trip through the schedule marker; default days keep the old marker", () => {
  const rows = planSchedule(lessons(2), { start: "2026-11-05", end: "2026-11-18", rest: SUN, days: MW });
  const table = renderTable(rows, SUN, MW);
  assert.match(table, /xuegen:schedule:start rest=sun days=mon,wed -->/);
  assert.deepEqual([...readSchedule(course(table + "\n")).days].sort(), [1, 3]);
  assert.match(renderTable(rows, SUN), /xuegen:schedule:start rest=sun -->/);
  assert.match(renderTable(rows, SUN, parseDays("", SUN)), /xuegen:schedule:start rest=sun -->/);
  assert.equal(readSchedule(course(renderTable(rows, SUN) + "\n")).days.size, 6);
});

test("shift with days moves missed lessons to the next lesson day and recomputes their reviews", () => {
  const rows = planSchedule(lessons(4), { start: "2026-11-05", end: "2026-11-18", rest: SUN, days: MW });
  // D1 (Mon 11-09) missed; today is Tue 11-10.
  const { rows: moved, shiftedDays, movedReviews } = shiftSchedule(rows, new Set(), "2026-11-10", SUN, MW);
  assert.equal(shiftedDays, 1);
  assert.equal(movedReviews, 0);
  const byId = Object.fromEntries(moved.map((row) => [row.id, row.date]));
  assert.equal(byId.D1, "2026-11-11");
  assert.equal(byId.D2, "2026-11-16");
  assert.equal(byId.D3, "2026-11-18");
  assert.equal(byId.D4, "2026-11-23");
  assert.equal(byId["R1-D1"], "2026-11-12");
  assert.equal(byId["R2-D1"], "2026-11-14");
  assert.equal(byId["R4-D4"], "2026-12-07");
});

test("shift without finished lessons keeps the pre-fix result exactly (regression guard)", () => {
  const rows = planSchedule(lessons(4), { start: "2026-11-05", end: "2026-11-30", rest: SUN, days: MW });
  const { rows: moved, shiftedDays, movedReviews, dropped } = shiftSchedule(rows, new Set(), "2026-11-10", SUN, MW);
  assert.equal(shiftedDays, 1);
  assert.equal(movedReviews, 0);
  assert.deepEqual(dropped, []);
  assert.deepEqual(moved.map((row) => [row.id, row.date]), [
    ["D1", "2026-11-11"],
    ["R1-D1", "2026-11-12"],
    ["R2-D1", "2026-11-14"],
    ["D2", "2026-11-16"],
    ["R1-D2", "2026-11-17"],
    ["D3", "2026-11-18"],
    ["R3-D1", "2026-11-18"],
    ["R2-D2", "2026-11-19"],
    ["R1-D3", "2026-11-19"],
    ["R2-D3", "2026-11-21"],
    ["D4", "2026-11-23"],
    ["R3-D2", "2026-11-23"],
    ["R1-D4", "2026-11-24"],
    ["R4-D1", "2026-11-25"],
    ["R3-D3", "2026-11-25"],
    ["R2-D4", "2026-11-26"],
    ["R4-D2", "2026-11-30"],
    ["R3-D4", "2026-11-30"],
    ["R4-D3", "2026-12-02"],
    ["R4-D4", "2026-12-07"],
  ]);
});

test("shift puts an unfinished lesson on today even if a finished lesson already sits there", () => {
  // D1（11-09 周一）没学，D2（11-11 周三）提前学完了；today 就是 11-11。
  // 已完成的课不占日子：D1 就落在今天，与已完成的 D2 同一天（D2 显示为已完成）。
  const rows = planSchedule(lessons(4), { start: "2026-11-09", end: "2026-11-30", rest: SUN, days: MW });
  const { rows: moved, shiftedDays } = shiftSchedule(rows, new Set(["D2"]), "2026-11-11", SUN, MW);
  assert.equal(shiftedDays, 1);
  const byId = Object.fromEntries(moved.map((row) => [row.id, row.date]));
  assert.equal(byId.D2, "2026-11-11", "已完成的 D2 不动");
  assert.equal(byId.D1, "2026-11-11", "D1 落在今天，不被已完成的 D2 挡住");
  assert.equal(byId.D3, "2026-11-18");
  assert.equal(byId.D4, "2026-11-23");
  assert.equal(byId["R1-D1"], "2026-11-12", "复习跟着 D1 的新日期算");
  assert.equal(byId["R2-D1"], "2026-11-14");
  assert.equal(byId["R3-D1"], "2026-11-18");
  assert.equal(byId["R4-D1"], "2026-11-25");
  assert.equal(byId["R1-D4"], "2026-11-24");
  const news = moved
    .filter((row) => row.kind === "new" && !new Set(["D2"]).has(row.id))
    .map((row) => row.date);
  assert.equal(new Set(news).size, news.length, "没有两节未完成的新课落在同一天");
  assert.deepEqual(news, [...news].sort(), "未完成的新课日期严格递增");
});

test("shift moves an overdue review of a finished lesson to today without moving lessons", () => {
  const rows = planSchedule(lessons(4), { start: "2026-11-05", end: "2026-11-18", rest: SUN, days: MW });
  // D1, D2 done; R1-D1 (Tue 11-10) missed; today is Thu 11-12.
  const result = shiftSchedule(rows, new Set(["D1", "D2"]), "2026-11-12", SUN, MW);
  assert.equal(result.shiftedDays, 0);
  assert.equal(result.movedReviews, 1);
  const byId = Object.fromEntries(result.rows.map((row) => [row.id, row.date]));
  assert.equal(byId["R1-D1"], "2026-11-12");
  assert.equal(byId["R2-D1"], "2026-11-12");
  assert.equal(byId.D3, "2026-11-16");
});

test("CLI: plan --days writes the marker; shift keeps it and reports moved reviews", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-days-"));
  try {
    const file = join(dir, "c.md");
    const lessonsFile = join(dir, "lessons.json");
    await writeFile(file, course(""));
    await writeFile(lessonsFile, JSON.stringify(lessons(4)));

    const planned = await run("node", [SCRIPT, "plan", file, "--start", "2026-11-05", "--end", "2026-11-18", "--rest", "sun", "--days", "mon,wed", "--lessons", lessonsFile, "--write", "--json"]);
    assert.equal(JSON.parse(planned.stdout).lastLesson, "2026-11-18");
    assert.match(await readFile(file, "utf8"), /rest=sun days=mon,wed/);

    // The fixture's Learning Record marks D1 done. D2 (Wed 11-11) missed and R1-D1 (Tue 11-10) missed; today Thu 11-12.
    const shifted = await run("node", [SCRIPT, "shift", file, "--today", "2026-11-12", "--write", "--json"]);
    const result = JSON.parse(shifted.stdout);
    assert.equal(result.shiftedDays, 1);
    assert.equal(result.movedReviews, 1);
    assert.equal(result.written, true);
    const after = readSchedule(await readFile(file, "utf8"));
    assert.deepEqual([...after.days].sort(), [1, 3]);
    const byId = Object.fromEntries(after.rows.map((row) => [row.id, row.date]));
    assert.equal(byId.D2, "2026-11-16");
    assert.equal(byId["R1-D1"], "2026-11-12");

    await assert.rejects(
      run("node", [SCRIPT, "plan", file, "--start", "2026-11-05", "--end", "2026-11-18", "--rest", "sun", "--days", "sun", "--lessons", lessonsFile]),
      (error) => /休息日/.test(error.stderr),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const EXTRA_RANGE = { start: "2026-11-06", end: "2026-11-18", rest: SUN };

test("parseReviews and parseExtra validate their input", () => {
  assert.equal(parseReviews(undefined), "spaced");
  assert.equal(parseReviews("anki"), "anki");
  assert.throws(() => parseReviews("weekly"), /未知复习方式/);
  assert.deepEqual(parseExtra("2026-11-06", EXTRA_RANGE), ["2026-11-06"]);
  assert.deepEqual(parseExtra("", EXTRA_RANGE), []);
  assert.throws(() => parseExtra("2026-11-08", EXTRA_RANGE), /休息日/);
  assert.throws(() => parseExtra("2026-11-30", EXTRA_RANGE), /不在/);
  assert.throws(() => parseExtra("11-06", EXTRA_RANGE), /YYYY-MM-DD/);
});

test("reviews=anki leaves out review rows; extra adds a lesson day outside the weekly template", () => {
  const rows = planSchedule(lessons(4), { ...EXTRA_RANGE, days: MW, extra: ["2026-11-06"], reviews: "anki" });
  assert.deepEqual(
    rows.filter((row) => row.kind === "new").map((row) => [row.id, row.date]),
    [
      ["D1", "2026-11-06"],
      ["D2", "2026-11-09"],
      ["D3", "2026-11-11"],
      ["D4", "2026-11-16"],
    ],
  );
  assert.equal(rows.filter((row) => row.kind === "review").length, 0);
  assert.deepEqual(rows.filter((row) => row.kind === "flex").map((row) => row.date), ["2026-11-18"]);
  assert.throws(
    () => planSchedule(lessons(6), { ...EXTRA_RANGE, days: MW, extra: ["2026-11-06"], reviews: "anki" }),
    (error) => error.suggestedEnd === "2026-11-23",
  );
});

test("reviews=anki round-trips through the marker; default keeps the old marker", () => {
  const rows = planSchedule(lessons(2), { ...EXTRA_RANGE, days: MW, reviews: "anki" });
  const table = renderTable(rows, SUN, MW, "anki");
  assert.match(table, /xuegen:schedule:start rest=sun days=mon,wed reviews=anki -->/);
  assert.equal(readSchedule(course(table + "\n")).reviews, "anki");
  assert.doesNotMatch(renderTable(rows, SUN, MW), /reviews=/);
  assert.equal(readSchedule(course(renderTable(rows, SUN) + "\n")).reviews, "spaced");
});

test("CLI: plan --extra --reviews anki writes no review rows; shift keeps reviews=anki", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-anki-"));
  try {
    const file = join(dir, "c.md");
    const lessonsFile = join(dir, "lessons.json");
    await writeFile(file, course(""));
    await writeFile(lessonsFile, JSON.stringify(lessons(4)));

    const planned = await run("node", [SCRIPT, "plan", file, "--start", "2026-11-06", "--end", "2026-11-18", "--rest", "sun", "--days", "mon,wed", "--extra", "2026-11-06", "--reviews", "anki", "--lessons", lessonsFile, "--write", "--json"]);
    assert.equal(JSON.parse(planned.stdout).lastLesson, "2026-11-16");
    const text = await readFile(file, "utf8");
    assert.match(text, /rest=sun days=mon,wed reviews=anki/);
    assert.doesNotMatch(text, /\| R1-/);

    // The fixture's Learning Record marks D1 done. D2 (Mon 11-09) missed; today Tue 11-10.
    const shifted = await run("node", [SCRIPT, "shift", file, "--today", "2026-11-10", "--write", "--json"]);
    const result = JSON.parse(shifted.stdout);
    assert.equal(result.shiftedDays, 1);
    assert.equal(result.movedReviews, 0);
    const after = readSchedule(await readFile(file, "utf8"));
    assert.equal(after.reviews, "anki");
    assert.deepEqual([...after.days].sort(), [1, 3]);
    const byId = Object.fromEntries(after.rows.map((row) => [row.id, row.date]));
    assert.equal(byId.D2, "2026-11-11");
    assert.equal(byId.D4, "2026-11-18");

    await assert.rejects(
      run("node", [SCRIPT, "plan", file, "--start", "2026-11-06", "--end", "2026-11-18", "--extra", "2026-11-08", "--lessons", lessonsFile]),
      (error) => /休息日/.test(error.stderr),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- 顺延不越过周期结束日：挤出去的课次进「留到下个周期」 ----

const CYCLE_END = "2026-12-24";

// 与真实库 `~/学根/库/wiki/courses/c-language.md` 同形的样本：计划表里先有「### 留到下个周期」占位行。
const sampleCourse = (table) =>
  [
    "<!-- xuegen:course-state -->",
    "# C 语言",
    "",
    "## 计划表（参考；勾选只出现在上方 Overall Goals / This Week / Today）",
    "",
    "> 逐日课次、材料与完成条件见下方由脚本生成的表格。",
    "",
    "### 留到下个周期",
    "",
    "- 无：Effective C 全书在 C1 内过完一遍。",
    "",
    table,
    "",
    "## Learning Record",
    "### 2026-11-06-01",
    "完成：无",
    "",
  ].join("\n");

const cLanguage = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `D${i + 1}`,
    content: `Ch${i + 1} 主题${i + 1}`,
    material: `Effective C 2nd · Ch${i + 1}`,
    done_when: `能说出 Ch${i + 1} 的要点`,
  }));

const deferredSection = (text) => {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^###\s+留到下个周期\s*$/.test(line));
  assert.notEqual(start, -1, "找不到「留到下个周期」一节");
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##+\s/.test(line) || /xuegen:schedule:start/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
};

test("shift stops at the cycle end: over-the-end lessons move to 留到下个周期", () => {
  const rows = planSchedule(cLanguage(14), {
    start: "2026-11-09",
    end: CYCLE_END,
    rest: SUN,
    days: MW,
    reviews: "anki",
  });
  const table = renderTable(rows, SUN, MW, "anki", CYCLE_END);
  assert.match(table, /xuegen:schedule:start rest=sun days=mon,wed reviews=anki end=2026-12-24 -->/);
  assert.equal(readSchedule(sampleCourse(table)).end, CYCLE_END);

  const shifted = shiftSchedule(rows, new Set(), "2026-11-10", SUN, MW, CYCLE_END);
  assert.equal(shifted.shiftedDays, 1);
  const byId = Object.fromEntries(shifted.rows.map((row) => [row.id, row.date]));
  assert.equal(byId.D1, "2026-11-11");
  assert.equal(byId.D14, undefined, "越过结束日的新课不再留在表里");
  assert.ok(shifted.rows.every((row) => row.date <= CYCLE_END), "表里不再有晚于结束日的行");
  assert.deepEqual(shifted.dropped.map((row) => row.id), ["D14"]);
});

test("writeSchedule replaces the 无 placeholder with the deferred lessons", () => {
  const rows = planSchedule(cLanguage(4), { start: "2026-11-09", end: "2026-11-18", rest: SUN, days: MW, reviews: "anki" });
  const table = renderTable(rows, SUN, MW, "anki", "2026-11-16");
  const page = writeSchedule(sampleCourse(table), table, [
    { id: "D5", content: "Ch5 控制流", material: "Effective C 2nd · Ch5" },
  ]);
  const section = deferredSection(page);
  assert.doesNotMatch(section, /- 无：/, "占位行被替换");
  assert.match(section, /^- D5：Ch5 控制流（Effective C 2nd · Ch5）$/m);
  assert.equal(page.indexOf("### 留到下个周期") < page.indexOf("<!-- xuegen:schedule:start"), true);

  // 没有「留到下个周期」一节时，在标记之前新建。
  const plain = "# C\n\n## 计划表\n\n" + table + "\n";
  const created = writeSchedule(plain, table, [{ id: "D5", content: "Ch5 控制流", material: "Effective C 2nd · Ch5" }]);
  assert.match(deferredSection(created), /^- D5：Ch5 控制流（Effective C 2nd · Ch5）$/m);
  assert.equal(created.indexOf("### 留到下个周期") < created.indexOf("<!-- xuegen:schedule:start"), true);
});

test("--end overrides the marker; a missing end keeps the old behaviour", () => {
  // 标记里没有 end（旧格式）→ shift 完全照旧，最后一节仍在表里。
  const legacy = planSchedule(cLanguage(12), { start: "2026-11-05", end: "2026-12-18", rest: SUN, days: MW, reviews: "anki" });
  const legacyTable = renderTable(legacy, SUN, MW, "anki");
  assert.equal(readSchedule(sampleCourse(legacyTable)).end, null);
  const noEnd = shiftSchedule(legacy, new Set(), "2026-11-10", SUN, MW);
  assert.equal(noEnd.dropped.length, 0);
  assert.equal(noEnd.rows.filter((row) => row.kind === "new").length, 12);

  // 有结束日时，越界的新课只进「留到下个周期」，复习行照旧留在表里（超出结束日也不挪）。
  const rows = planSchedule(cLanguage(4), { start: "2026-11-09", end: "2026-12-24", rest: SUN, days: MW });
  const shifted = shiftSchedule(rows, new Set(), "2026-12-10", SUN, MW, "2026-12-16");
  assert.deepEqual(shifted.dropped.map((row) => row.id), ["D3", "D4"]);
  assert.ok(shifted.rows.filter((row) => row.kind === "new").every((row) => row.date <= "2026-12-16"));
  const lateReview = shifted.rows.find((row) => row.kind === "review" && row.date > "2026-12-16");
  assert.ok(lateReview, "复习行仍留在表里（不因结束日被移走）");
});

test("repeated shift is idempotent: dropped lessons stay out and are not appended twice", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-end-"));
  try {
    const file = join(dir, "c.md");
    const lessonsFile = join(dir, "lessons.json");
    // 14 个课次刚好排满 11-09 ~ 12-24 的 14 个周一/周三；顺延一天后 D14 排不进。
    await writeFile(file, sampleCourse(""));
    await writeFile(lessonsFile, JSON.stringify(cLanguage(14)));
    await run("node", [SCRIPT, "plan", file, "--start", "2026-11-09", "--end", CYCLE_END, "--rest", "sun", "--days", "mon,wed", "--reviews", "anki", "--lessons", lessonsFile, "--write", "--json"]);

    const first = JSON.parse((await run("node", [SCRIPT, "shift", file, "--today", "2026-11-10", "--write", "--json"])).stdout);
    assert.equal(first.dropped.length, 1);
    assert.match(first.deferred, /1 节排不进本周期，已移到「留到下个周期」：D14/);
    const once = await readFile(file, "utf8");
    assert.match(once, /^- D14：Ch14 主题14（Effective C 2nd · Ch14）$/m);
    assert.doesNotMatch(deferredSection(once), /- 无：/);

    const second = JSON.parse((await run("node", [SCRIPT, "shift", file, "--today", "2026-11-10", "--write", "--json"])).stdout);
    assert.equal(second.dropped.length, 0);
    const twice = await readFile(file, "utf8");
    assert.equal((twice.match(/^- D14：/gm) ?? []).length, 1, "不重复追加");
    assert.equal(readSchedule(twice).end, CYCLE_END);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI: plan --elastic 照 --end 铺课但不写 end=；之后 shift 不受结束日限制", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-elastic-"));
  try {
    const file = join(dir, "c.md");
    const elasticFile = join(dir, "e.md");
    const lessonsFile = join(dir, "lessons.json");
    await writeFile(file, sampleCourse(""));
    await writeFile(elasticFile, sampleCourse(""));
    await writeFile(lessonsFile, JSON.stringify(cLanguage(14)));

    // 锁住旧行为：不加 --elastic 时标记仍写 end=。
    const plain = JSON.parse(
      (await run("node", [SCRIPT, "plan", file, "--start", "2026-11-09", "--end", CYCLE_END, "--rest", "sun", "--days", "mon,wed", "--reviews", "anki", "--lessons", lessonsFile, "--write", "--json"])).stdout,
    );
    assert.match(await readFile(file, "utf8"), /xuegen:schedule:start[^\n]* end=2026-12-24 /);

    // --elastic 紧跟 --write 也要按开关解析（不吃掉后面的标志）。
    const elastic = JSON.parse(
      (await run("node", [SCRIPT, "plan", elasticFile, "--start", "2026-11-09", "--end", CYCLE_END, "--rest", "sun", "--days", "mon,wed", "--reviews", "anki", "--lessons", lessonsFile, "--elastic", "--write", "--json"])).stdout,
    );
    assert.equal(elastic.ok, true);
    assert.equal(elastic.elastic, true);
    assert.equal(elastic.written, true);
    assert.deepEqual(elastic.schedule, plain.schedule, "课次日期与不加 --elastic 完全相同");
    const elasticText = await readFile(elasticFile, "utf8");
    const mark = elasticText.match(/<!-- xuegen:schedule:start[^\n]*-->/)[0];
    assert.doesNotMatch(mark, /end=/);
    assert.equal(readSchedule(elasticText).end, null);

    // 用 --elastic 排出的课页再 shift：最后一节落在 12-24 之后，也不进「留到下个周期」。
    const shifted = JSON.parse(
      (await run("node", [SCRIPT, "shift", elasticFile, "--today", "2026-11-10", "--write", "--json"])).stdout,
    );
    assert.equal(shifted.dropped.length, 0);
    assert.equal(shifted.written, true);
    const after = await readFile(elasticFile, "utf8");
    const lastLesson = lastNewLessonDate(readSchedule(after).rows);
    assert.ok(lastLesson > CYCLE_END, `最后一节 ${lastLesson} 越过 ${CYCLE_END}`);
    assert.match(deferredSection(after), /- 无：/, "没有课次被挤进「留到下个周期」");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI: shift --end reports the deferred lessons and does not write without --write", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-end-cli-"));
  try {
    const file = join(dir, "c.md");
    const lessonsFile = join(dir, "lessons.json");
    await writeFile(file, sampleCourse(""));
    await writeFile(lessonsFile, JSON.stringify(cLanguage(14)));
    await run("node", [SCRIPT, "plan", file, "--start", "2026-11-09", "--end", CYCLE_END, "--rest", "sun", "--days", "mon,wed", "--reviews", "anki", "--lessons", lessonsFile, "--write", "--json"]);
    // 标记里改成 2026-12-18，命令行 --end 应优先于它。
    const strict = (await readFile(file, "utf8")).replace("end=2026-12-24", "end=2026-12-18");
    await writeFile(file, strict);
    assert.equal(readSchedule(strict).end, "2026-12-18");

    const preview = JSON.parse((await run("node", [SCRIPT, "shift", file, "--today", "2026-11-10", "--json"])).stdout);
    assert.deepEqual(preview.dropped.map((row) => row.id), ["D12", "D13", "D14"], "按标记里的结束日");
    assert.equal(preview.written, false);
    assert.equal(await readFile(file, "utf8"), strict, "--write 之前不改文件");

    const applied = JSON.parse((await run("node", [SCRIPT, "shift", file, "--today", "2026-11-10", "--end", CYCLE_END, "--write", "--json"])).stdout);
    assert.deepEqual(applied.dropped.map((row) => row.id), ["D14"], "--end 优先于标记");
    assert.equal(applied.written, true);
    const after = await readFile(file, "utf8");
    assert.match(deferredSection(after), /^- D14：/m);
    assert.doesNotMatch(deferredSection(after), /^- D12：/);
    assert.doesNotMatch(deferredSection(after), /^- D13：/);
    assert.equal(readSchedule(after).end, CYCLE_END);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---- 带读（辅助课）不设完结：排期一律 elastic，shift 不加 --end ----

// 辅助课页：没有「### 留到下个周期」一节（用户 2026-11-11 定，辅助课不再进这一节）。
const auxCourse = (table) =>
  [
    "<!-- xuegen:course-state -->",
    "# C 语言",
    "",
    "## 计划表（参考；勾选只出现在上方 Overall Goals / This Week / Today）",
    "",
    "> 逐日课次、材料与完成条件见下方由脚本生成的表格。",
    "",
    table,
    "",
    "## Learning Record",
    "### 2026-11-06-01",
    "完成：无",
    "",
  ].join("\n");

const monWed = (date) => [1, 3].includes(weekday(date));

test("CLI: 辅助课（带读）排 --elastic，shift 不加 --end 时 6 节全留在表里、不建「留到下个周期」", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-aux-"));
  try {
    const file = join(dir, "c.md");
    const lessonsFile = join(dir, "lessons.json");
    await writeFile(file, auxCourse(""));
    await writeFile(lessonsFile, JSON.stringify(cLanguage(6)));

    const planned = JSON.parse(
      (await run("node", [SCRIPT, "plan", file, "--start", "2026-11-09", "--end", "2026-12-28", "--rest", "sun", "--days", "mon,wed", "--reviews", "anki", "--elastic", "--lessons", lessonsFile, "--write", "--json"])).stdout,
    );
    assert.equal(planned.ok, true);
    assert.equal(planned.lastLesson, "2026-11-25", "6 节排到 11-25");
    const mark = (await readFile(file, "utf8")).match(/<!-- xuegen:schedule:start[^\n]*-->/)[0];
    assert.doesNotMatch(mark, /end=/, "辅助课标记里不写 end=");
    assert.equal(readSchedule(await readFile(file, "utf8")).end, null);

    // 比最后一节（11-25）晚 10 天顺延：越过 --end（12-28）也不进「留到下个周期」。
    const shifted = JSON.parse((await run("node", [SCRIPT, "shift", file, "--today", "2026-12-05", "--write", "--json"])).stdout);
    assert.deepEqual(shifted.dropped, [], "没有课被移出表");
    assert.equal(shifted.end, null, "shift 的 end 为 null（标记里没有 end=）");
    assert.equal(shifted.written, true);

    const after = await readFile(file, "utf8");
    const { rows } = readSchedule(after);
    const fresh = rows.filter((row) => row.kind === "new");
    assert.equal(fresh.length, 6, "6 节都还在表里");
    assert.deepEqual(fresh.map((row) => row.id), ["D1", "D2", "D3", "D4", "D5", "D6"]);
    assert.ok(fresh.every((row) => row.date > "2026-12-05"), `每节都在今天之后：${fresh.map((row) => row.date).join(",")}`);
    assert.ok(fresh.every((row) => monWed(row.date)), `每节都落在周一或周三：${fresh.map((row) => row.date).join(",")}`);
    assert.doesNotMatch(after, /###\s+留到下个周期/, "文件里没有「留到下个周期」一节");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI: 辅助课课次多于到 --end 的上课日时报建议截止日期；用该日期加 --elastic 重跑成功且不写 end=", async () => {
  const dir = await mkdtemp(join(tmpdir(), "course-schedule-aux-suggest-"));
  try {
    const file = join(dir, "c.md");
    const lessonsFile = join(dir, "lessons.json");
    await writeFile(file, auxCourse(""));
    await writeFile(lessonsFile, JSON.stringify(cLanguage(6)));

    // 11-09 ~ 11-18 的周一/周三只有 4 个上课日，放不下 6 节。
    const failed = await run("node", [SCRIPT, "plan", file, "--start", "2026-11-09", "--end", "2026-11-18", "--rest", "sun", "--days", "mon,wed", "--reviews", "anki", "--elastic", "--lessons", lessonsFile, "--write", "--json"]).then(
      () => null,
      (error) => error,
    );
    assert.ok(failed, "课次放不下时 plan 退出码非 0");
    assert.notEqual(failed.code, 0);
    const failure = JSON.parse(failed.stdout);
    assert.equal(failure.ok, false);
    assert.match(failure.error, /建议截止日期 2026-11-25/);
    assert.equal(failure.suggestedEnd, "2026-11-25");
    assert.equal(await readFile(file, "utf8"), auxCourse(""), "失败时不写文件");

    // 不加 --json 时同样的原因写在 stderr（用户看到的就是这一行）。
    await assert.rejects(
      run("node", [SCRIPT, "plan", file, "--start", "2026-11-09", "--end", "2026-11-18", "--rest", "sun", "--days", "mon,wed", "--reviews", "anki", "--elastic", "--lessons", lessonsFile, "--write"]),
      (error) => error.code !== 0 && /建议截止日期 2026-11-25/.test(error.stderr),
    );

    // 用建议日期作 --end 再加 --elastic：成功，标记里没有 end=。
    const ok = JSON.parse(
      (await run("node", [SCRIPT, "plan", file, "--start", "2026-11-09", "--end", failure.suggestedEnd, "--rest", "sun", "--days", "mon,wed", "--reviews", "anki", "--elastic", "--lessons", lessonsFile, "--write", "--json"])).stdout,
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.lastLesson, "2026-11-25");
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text.match(/<!-- xuegen:schedule:start[^\n]*-->/)[0], /end=/);
    assert.equal(readSchedule(text).end, null);
    assert.equal(readSchedule(text).rows.filter((row) => row.kind === "new").length, 6);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
