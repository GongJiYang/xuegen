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
