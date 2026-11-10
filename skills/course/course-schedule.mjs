#!/usr/bin/env node
// Xuegen 课程逐日排期：把模型列出的课次按学习日排到截止日期，按间隔重复插入复习，没学的天整体顺延。
// 无第三方依赖。日期只由本脚本计算，模型只给课次内容。
//   node course-schedule.mjs plan <course.md> --start YYYY-MM-DD --end YYYY-MM-DD [--rest sun|sat,sun|none] [--days mon,wed] [--extra YYYY-MM-DD,…] [--reviews spaced|anki] [--elastic] --lessons <lessons.json> [--write] [--json]
//   node course-schedule.mjs shift <course.md> [--today YYYY-MM-DD] [--end YYYY-MM-DD] [--write] [--json]
//   node course-schedule.mjs next <course.md> [--date YYYY-MM-DD] [--json]
// lessons.json：[{ "id"?: "D1", "content": "…", "material"?: "…", "done_when"?: "…" }]，按学习顺序。
// 排期表写在课程页 `## 计划表` 段内的标记之间（标记外的人工内容不动）：
//   <!-- xuegen:schedule:start rest=sun days=mon,wed reviews=anki end=YYYY-MM-DD -->（days 只在不等于「所有非休息日」时写出；reviews 只在为 anki 时写出；end 是周期结束日，shift 顺延不越过它（plan 加 --elastic 时不写 end，主项课用）；extra 不记录）
//   | 天 | 日期 | 内容 | 材料 | 完成条件 |
//   <!-- xuegen:schedule:end -->
// 顺延后越过结束日的新课次不留在表里，登记到标记外的「### 留到下个周期」一节。
// 完成判定：`## Learning Record` 里出现「完成：D3、R1-D2」这样的行（收课时由 course 技能写入）。
// --write 只改课程页本身；课程页默认只读，写入前先用 course-state.mjs unlock，写完再 lock。
import { readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** 复习间隔（学完后第 N 天）。 */
export const REVIEW_OFFSETS = [1, 3, 7, 14];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const MARK_START = /<!--\s*xuegen:schedule:start([^>]*)-->/;
const MARK_END = "<!-- xuegen:schedule:end -->";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REVIEW_DONE_WHEN = "不看笔记复述要点，或重做一道检查题";
const PLAN_HEADING = "## 计划表（参考；勾选只出现在上方 Overall Goals / This Week / Today）";
/** 周期内排不下的课次登记在这里（计划表段内、排期标记之外）。 */
const DEFER_HEADING = "### 留到下个周期";
const DEFER_PLACEHOLDER = /^-\s*(无|none)\s*[：:]/;

// ---- 日期（本地日期字符串，按 UTC 计算以避开时区与夏令时） ----

function toUtc(date) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms) {
  const value = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

export function addDays(date, days) {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

export function weekday(date) {
  return new Date(toUtc(date)).getUTCDay();
}

export function isValidDate(date) {
  return typeof date === "string" && DATE_RE.test(date) && fromUtc(toUtc(date)) === date;
}

/** `sun` / `sat,sun` / `none` → 休息日的星期序号集合。 */
export function parseRest(value) {
  if (!value || value === "none") return new Set();
  const days = new Set();
  for (const part of value.split(",").map((item) => item.trim().toLowerCase())) {
    const index = WEEKDAYS.indexOf(part);
    if (index === -1) throw new Error(`未知休息日：${part}（可用 ${WEEKDAYS.join("/")} 或 none）`);
    days.add(index);
  }
  if (days.size === 7) throw new Error("一周七天都休息，排不出学习日");
  return days;
}

export function formatRest(rest) {
  return rest.size === 0 ? "none" : [...rest].sort().map((day) => WEEKDAYS[day]).join(",");
}

/** `mon,wed` → 上新课的星期序号集合；不给（空串 / undefined）时为所有非休息日。 */
export function parseDays(value, rest) {
  if (!value) return new Set([0, 1, 2, 3, 4, 5, 6].filter((day) => !rest.has(day)));
  const days = new Set();
  for (const part of value.split(",").map((item) => item.trim().toLowerCase())) {
    const index = WEEKDAYS.indexOf(part);
    if (index === -1) throw new Error(`未知上课日：${part}（可用 ${WEEKDAYS.join("/")}）`);
    if (rest.has(index)) throw new Error(`上课日 ${part} 同时是休息日`);
    days.add(index);
  }
  return days;
}

export function formatDays(days) {
  return [...days].sort().map((day) => WEEKDAYS[day]).join(",");
}

/** 不上新课的星期（休息日 + 只做复习的日子），用来复用 nextStudyDay / addStudyDays 数上课日。 */
function offDays(days) {
  return new Set([0, 1, 2, 3, 4, 5, 6].filter((day) => !days.has(day)));
}

/** days 是否等于「所有非休息日」（此时排期标记里不写 days=，保持旧格式）。 */
function isDefaultDays(days, rest) {
  return days.size + rest.size === 7;
}

/** 复习方式：spaced（默认，计划表里排 +1/3/7/14 天复习）或 anki（不排复习行，复习交给 Anki）。 */
export function parseReviews(value) {
  if (!value || value === "spaced") return "spaced";
  if (value === "anki") return "anki";
  throw new Error(`未知复习方式：${value}（可用 spaced / anki）`);
}

/** `2026-11-06,2026-11-13` → 周模板之外的额外上课日；须在 start..end 之内且不是休息日。 */
export function parseExtra(value, { start, end, rest }) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).map((date) => {
    if (!isValidDate(date)) throw new Error(`额外上课日必须是 YYYY-MM-DD：${date}`);
    if (date < start || date > end) throw new Error(`额外上课日 ${date} 不在 ${start} ~ ${end} 之内`);
    if (rest.has(weekday(date))) throw new Error(`额外上课日 ${date} 是休息日`);
    return date;
  });
}

function isStudyDay(date, rest) {
  return !rest.has(weekday(date));
}

/** 当天或之后的第一个学习日。 */
export function nextStudyDay(date, rest) {
  let day = date;
  while (!isStudyDay(day, rest)) day = addDays(day, 1);
  return day;
}

/** 从 `date` 起往后数 `count` 个学习日（`date` 本身不计）。 */
export function addStudyDays(date, count, rest) {
  let day = date;
  for (let moved = 0; moved < count; ) {
    day = addDays(day, 1);
    if (isStudyDay(day, rest)) moved += 1;
  }
  return day;
}

/** [from, to) 之间的学习日个数。 */
export function studyDaysBetween(from, to, rest) {
  let count = 0;
  for (let day = from; day < to; day = addDays(day, 1)) if (isStudyDay(day, rest)) count += 1;
  return count;
}

export function studyDays(start, end, rest) {
  const days = [];
  for (let day = start; day <= end; day = addDays(day, 1)) if (isStudyDay(day, rest)) days.push(day);
  return days;
}

function dateLabel(date) {
  return `${date}（${WEEKDAY_ZH[weekday(date)]}）`;
}

// ---- 排期 ----

/** 课次内容的简称，用在复习行里。 */
function shortName(content) {
  const head = content.split(/[：:；;。]/)[0].trim();
  return head.length > 24 ? `${head.slice(0, 23)}…` : head;
}

function normalizeLessons(lessons) {
  if (!Array.isArray(lessons) || lessons.length === 0) throw new Error("lessons 必须是非空数组");
  const seen = new Set();
  return lessons.map((lesson, index) => {
    if (!lesson || typeof lesson.content !== "string" || !lesson.content.trim()) {
      throw new Error(`第 ${index + 1} 个课次缺少 content`);
    }
    const id = typeof lesson.id === "string" && lesson.id.trim() ? lesson.id.trim() : `D${index + 1}`;
    if (seen.has(id)) throw new Error(`课次 id 重复：${id}`);
    seen.add(id);
    return {
      id,
      content: lesson.content.trim(),
      material: typeof lesson.material === "string" && lesson.material.trim() ? lesson.material.trim() : "—",
      doneWhen: typeof lesson.done_when === "string" && lesson.done_when.trim() ? lesson.done_when.trim() : "—",
    };
  });
}

/**
 * 把课次排进 start..end 的上课日（days，默认所有非休息日；extra 为额外上课日），reviews 为 spaced 时为每个课次插入 D+1/3/7/14 的复习（落在任何非休息日），为 anki 时不排复习行。
 * 返回按日期排序的行：{ id, date, kind: "new"|"review"|"flex", content, material, doneWhen }。
 */
export function planSchedule(lessons, { start, end, rest, days, extra = [], reviews = "spaced" }) {
  if (!isValidDate(start) || !isValidDate(end)) throw new Error("start / end 必须是 YYYY-MM-DD");
  if (end < start) throw new Error("截止日期早于开始日期");
  const items = normalizeLessons(lessons);
  const off = offDays(days ?? parseDays("", rest));
  const regular = studyDays(start, end, off);
  const extraOnly = extra.filter((date) => !regular.includes(date));
  const slots = [...regular, ...extraOnly].sort();
  if (items.length > slots.length) {
    const first = nextStudyDay(start, off);
    const needed = addStudyDays(first, items.length - extraOnly.length - 1, off);
    const error = new Error(
      `${items.length} 个课次只有 ${slots.length} 个上课日：至少需要 ${items.length} 个上课日，建议截止日期 ${needed}`,
    );
    error.suggestedEnd = needed;
    throw error;
  }
  const rows = [];
  items.forEach((lesson, index) => {
    const date = slots[index];
    rows.push({ id: lesson.id, date, kind: "new", content: lesson.content, material: lesson.material, doneWhen: lesson.doneWhen });
    if (reviews !== "anki") {
      REVIEW_OFFSETS.forEach((offset, n) => {
        const reviewDate = nextStudyDay(addDays(date, offset), rest);
        const after = reviewDate > end ? "（课后复习）" : "";
        rows.push({
          id: `R${n + 1}-${lesson.id}`,
          date: reviewDate,
          kind: "review",
          content: `复习：${shortName(lesson.content)}${after}`,
          material: "笔记 / 检查题",
          doneWhen: REVIEW_DONE_WHEN,
        });
      });
    }
  });
  for (const day of slots.slice(items.length)) {
    rows.push({ id: "机动", date: day, kind: "flex", content: "机动：补进度或提前复习", material: "—", doneWhen: "—" });
  }
  return sortRows(rows);
}

const KIND_ORDER = { new: 0, review: 1, flex: 2 };

function sortRows(rows) {
  return [...rows].sort((a, b) => (a.date === b.date ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] : a.date < b.date ? -1 : 1));
}

function cell(text) {
  return String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderTable(rows, rest, days, reviews = "spaced", end = null) {
  const daysAttr = days && !isDefaultDays(days, rest) ? ` days=${formatDays(days)}` : "";
  const reviewsAttr = reviews === "anki" ? " reviews=anki" : "";
  const endAttr = isValidDate(end) ? ` end=${end}` : "";
  const lines = [
    `<!-- xuegen:schedule:start rest=${formatRest(rest)}${daysAttr}${reviewsAttr}${endAttr} -->`,
    "| 天 | 日期 | 内容 | 材料 | 完成条件 |",
    "|---|---|---|---|---|",
  ];
  for (const row of rows) {
    lines.push(`| ${cell(row.id)} | ${dateLabel(row.date)} | ${cell(row.content)} | ${cell(row.material)} | ${cell(row.doneWhen)} |`);
  }
  lines.push(MARK_END);
  return lines.join("\n");
}

// ---- 读写课程页 ----

function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((value) => value.trim().replace(/\\\|/g, "|"));
}

function kindOf(id) {
  if (id === "机动") return "flex";
  return /^R\d+-/.test(id) ? "review" : "new";
}

/** 课程页里由本脚本生成的排期：{ rows, rest, days, reviews, end, startIndex, endIndex } 或 null。 */
export function readSchedule(text) {
  const lines = text.split("\n");
  const startIndex = lines.findIndex((line) => MARK_START.test(line));
  if (startIndex === -1) return null;
  const endIndex = lines.findIndex((line, index) => index > startIndex && line.trim() === MARK_END);
  if (endIndex === -1) throw new Error("排期标记不完整：缺少 xuegen:schedule:end");
  const attrs = lines[startIndex].match(MARK_START)[1];
  const restMatch = attrs.match(/rest=([a-z,]+)/);
  const rest = parseRest(restMatch ? restMatch[1] : "none");
  const daysMatch = attrs.match(/days=([a-z,]+)/);
  const days = parseDays(daysMatch ? daysMatch[1] : "", rest);
  const reviewsMatch = attrs.match(/reviews=([a-z]+)/);
  const reviews = parseReviews(reviewsMatch ? reviewsMatch[1] : undefined);
  const endMatch = attrs.match(/end=(\d{4}-\d{2}-\d{2})/);
  const end = endMatch ? endMatch[1] : null;
  const rows = [];
  for (const line of lines.slice(startIndex + 1, endIndex)) {
    if (!/^\|/.test(line.trim())) continue;
    const [id, dateCell, content, material, doneWhen] = tableCells(line);
    const date = (dateCell ?? "").slice(0, 10);
    if (!isValidDate(date)) continue;
    rows.push({ id, date, kind: kindOf(id), content, material, doneWhen });
  }
  return { rows, rest, days, reviews, end, startIndex, endIndex };
}

/** Learning Record 里「完成：…」列出的课次 id。 */
export function completedIds(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^##\s+Learning Record\s*$/.test(line));
  if (start === -1) return new Set();
  const done = new Set();
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const match = line.match(/完成[:：]\s*(.+)$/);
    if (!match) continue;
    for (const id of match[1].split(/[,，、\s]+/)) if (id) done.add(id.trim());
  }
  return done;
}

/**
 * 把排期表写进课程页：替换旧标记段，没有就放进（或新建）计划表段。
 * deferred 非空时把这些课次追加到「### 留到下个周期」一节（该节原来只有一行「- 无：…」时替换掉它）。
 */
export function writeSchedule(text, table, deferred = []) {
  return mergeDeferred(replaceTable(text, table), deferred);
}

/** 只替换（或新建）标记段里的表格，不动「留到下个周期」一节。 */
function replaceTable(text, table) {
  const lines = text.split("\n");
  const existing = readSchedule(text);
  if (existing) {
    return [...lines.slice(0, existing.startIndex), table, ...lines.slice(existing.endIndex + 1)].join("\n");
  }
  const planIndex = lines.findIndex((line) => /^##\s+计划表/.test(line));
  if (planIndex !== -1) {
    let insertAt = lines.findIndex((line, index) => index > planIndex && /^##\s/.test(line));
    if (insertAt === -1) insertAt = lines.length;
    while (insertAt > planIndex + 1 && lines[insertAt - 1].trim() === "") insertAt -= 1;
    return [...lines.slice(0, insertAt), "", table, "", ...lines.slice(insertAt)].join("\n");
  }
  const recordIndex = lines.findIndex((line) => /^##\s+Learning Record\s*$/.test(line));
  const block = [PLAN_HEADING, "", table, ""];
  if (recordIndex === -1) return [...lines, "", ...block].join("\n");
  return [...lines.slice(0, recordIndex), ...block, ...lines.slice(recordIndex)].join("\n");
}

/** 「留到下个周期」里的一行：`- D14：内容（材料）`。 */
function deferLine(row) {
  return `- ${row.id}：${row.content}（${row.material || "—"}）`;
}

/** 把越出周期的课次登记进「### 留到下个周期」（没有这一节就在排期标记之前新建）。 */
function mergeDeferred(text, deferred) {
  if (!deferred || deferred.length === 0) return text;
  const lines = text.split("\n");
  const additions = deferred.map(deferLine);
  const headingIndex = lines.findIndex((line) => line.trim() === DEFER_HEADING);
  if (headingIndex === -1) {
    const markIndex = lines.findIndex((line) => MARK_START.test(line));
    const insertAt = markIndex === -1 ? lines.length : markIndex;
    const block = [DEFER_HEADING, "", ...additions, ""];
    if (insertAt > 0 && lines[insertAt - 1].trim() !== "") block.unshift("");
    return [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)].join("\n");
  }
  let sectionEnd = lines.findIndex((line, index) => index > headingIndex && (/^#{2,}\s/.test(line) || MARK_START.test(line)));
  if (sectionEnd === -1) sectionEnd = lines.length;
  const kept = [];
  const existing = new Set();
  for (const line of lines.slice(headingIndex + 1, sectionEnd)) {
    if (line.trim() === "") continue;
    if (DEFER_PLACEHOLDER.test(line.trim())) continue;
    const match = line.match(/^-\s*([^：:]+)[：:]/);
    if (match) existing.add(match[1].trim());
    kept.push(line);
  }
  const fresh = additions.filter((line, index) => !existing.has(deferred[index].id));
  if (fresh.length === 0) return text;
  return [
    ...lines.slice(0, headingIndex + 1),
    "",
    ...kept,
    ...fresh,
    "",
    ...lines.slice(sectionEnd),
  ].join("\n");
}

/**
 * 没学的补上（已完成的行不动，机动行丢弃）：
 * - 今天之前没学的新课次：从最早的那一个起，所有没学的新课次后移同样多的「上课日」（只落在 days 里的星期）；
 *   这些课次没做的复习按新日期重算（+1/3/7/14 天，落在非休息日）。
 * - 其余过期未做的复习（所属课次已学或没有后移）：挪到今天（今天是休息日则挪到之后第一个非休息日）。
 * 给了结束日 end 时，顺延后晚于 end 的**新课**不留在表里，单独作为 dropped 返回（由调用方登记进「留到下个周期」）；
 * 复习行不看 end，照上面的规则处理。
 * 返回 { rows, shiftedDays（新课后移的上课日数）, movedReviews（挪到今天的复习条数）, dropped（越过结束日的新课）}。
 */
export function shiftSchedule(rows, done, today, rest, days = parseDays("", rest), end = null) {
  const off = offDays(days);
  const kept = rows.filter((row) => row.kind !== "flex");
  const overdueNew = kept.filter((row) => row.kind === "new" && !done.has(row.id) && row.date < today);
  const first = overdueNew.reduce((min, row) => (row.date < min ? row.date : min), today);
  const shiftedDays = overdueNew.length === 0 ? 0 : studyDaysBetween(first, today, off);
  const lessons = new Map();
  for (const row of kept) {
    if (row.kind !== "new") continue;
    const moved = shiftedDays > 0 && !done.has(row.id) && row.date >= first;
    lessons.set(row.id, { date: moved ? addStudyDays(row.date, shiftedDays, off) : row.date, moved });
  }
  const dueNow = nextStudyDay(today, rest);
  let movedReviews = 0;
  const result = kept.map((row) => {
    if (done.has(row.id)) return row;
    if (row.kind === "new") return { ...row, date: lessons.get(row.id).date };
    const match = /^R(\d+)-(.+)$/.exec(row.id);
    const lesson = match ? lessons.get(match[2]) : undefined;
    const offset = match ? REVIEW_OFFSETS[Number(match[1]) - 1] : undefined;
    if (lesson && lesson.moved && offset !== undefined) {
      return { ...row, date: nextStudyDay(addDays(lesson.date, offset), rest) };
    }
    if (row.date < today) {
      movedReviews += 1;
      return { ...row, date: dueNow };
    }
    return row;
  });
  const dropped = isValidDate(end) ? result.filter((row) => row.kind === "new" && !done.has(row.id) && row.date > end) : [];
  if (shiftedDays === 0 && movedReviews === 0 && dropped.length === 0) {
    return { rows, shiftedDays: 0, movedReviews: 0, dropped: [] };
  }
  const outOfCycle = new Set(dropped.map((row) => row.id));
  return { rows: sortRows(result.filter((row) => !outOfCycle.has(row.id))), shiftedDays, movedReviews, dropped };
}

export function lastNewLessonDate(rows) {
  return rows.filter((row) => row.kind === "new").reduce((max, row) => (row.date > max ? row.date : max), "");
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
    if (["write", "json", "help", "elastic"].includes(key)) flags[key] = true;
    else {
      flags[key] = argv[i + 1];
      i += 1;
    }
  }
  return { positional, flags };
}

function fail(message) {
  process.stderr.write(`course-schedule: ${message}\n`);
  process.exit(1);
}

async function save(file, text) {
  try {
    await writeFile(file, text);
  } catch (error) {
    if (error && error.code === "EACCES") fail(`${file} 是只读的：先用 course-state.mjs unlock，写完再 lock`);
    throw error;
  }
}

function requireDate(value, name) {
  if (!isValidDate(value)) fail(`${name} 必须是 YYYY-MM-DD，收到 ${value ?? "（空）"}`);
  return value;
}

function usage() {
  return [
    "用法：",
    "  node course-schedule.mjs plan <course.md> --start YYYY-MM-DD --end YYYY-MM-DD [--rest sun|sat,sun|none] [--days mon,wed] [--extra YYYY-MM-DD,…] [--reviews spaced|anki] [--elastic] --lessons <lessons.json> [--write] [--json]",
    "  node course-schedule.mjs shift <course.md> [--today YYYY-MM-DD] [--end YYYY-MM-DD] [--write] [--json]",
    "  node course-schedule.mjs next <course.md> [--date YYYY-MM-DD] [--json]",
    "  --elastic：照 --end 铺课，但不把 end 记进排期标记（主项课：以后顺延不受周期结束日限制）",
  ].join("\n");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, file] = positional;
  if (flags.help || !command) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!file) fail(`缺少课程页路径\n${usage()}`);
  const text = await readFile(file, "utf8").catch(() => fail(`读不到 ${file}`));

  if (command === "plan") {
    const start = requireDate(flags.start, "--start");
    const end = requireDate(flags.end, "--end");
    if (!flags.lessons) fail("plan 需要 --lessons <lessons.json>");
    let lessons;
    try {
      lessons = JSON.parse(await readFile(flags.lessons, "utf8"));
    } catch (error) {
      fail(`lessons.json 无法解析：${error.message}`);
    }
    let rest;
    let rows;
    let days;
    let extra;
    let reviews;
    try {
      rest = parseRest(flags.rest ?? "sun");
      days = parseDays(flags.days, rest);
      extra = parseExtra(flags.extra, { start, end, rest });
      reviews = parseReviews(flags.reviews);
      rows = planSchedule(lessons, { start, end, rest, days, extra, reviews });
    } catch (error) {
      if (flags.json && error.suggestedEnd) {
        process.stdout.write(`${JSON.stringify({ ok: false, error: error.message, suggestedEnd: error.suggestedEnd })}\n`);
        process.exit(1);
      }
      fail(error.message);
    }
    const table = renderTable(rows, rest, days, reviews, flags.elastic === true ? null : end);
    if (flags.write) await save(file, writeSchedule(text, table));
    const summary = {
      ok: true,
      rows: rows.length,
      lastLesson: lastNewLessonDate(rows),
      end,
      elastic: flags.elastic === true,
      written: Boolean(flags.write),
    };
    process.stdout.write(flags.json ? `${JSON.stringify({ ...summary, schedule: rows })}\n` : `${table}\n`);
    return;
  }

  const schedule = (() => {
    try {
      return readSchedule(text);
    } catch (error) {
      return fail(error.message);
    }
  })();
  if (!schedule) fail(`${file} 里没有排期标记；先用 plan 生成`);

  if (command === "shift") {
    const today = flags.today ? requireDate(flags.today, "--today") : localToday();
    const end = flags.end ? requireDate(flags.end, "--end") : schedule.end;
    const done = completedIds(text);
    const { rows, shiftedDays, movedReviews, dropped } = shiftSchedule(schedule.rows, done, today, schedule.rest, schedule.days, end);
    const changed = shiftedDays > 0 || movedReviews > 0 || dropped.length > 0;
    const lastLesson = lastNewLessonDate(rows);
    const deferred = dropped.length === 0 ? "" : `${dropped.length} 节排不进本周期，已移到「留到下个周期」：${dropped.map((row) => row.id).join("、")}`;
    const result = {
      ok: true,
      shiftedDays,
      movedReviews,
      lastLesson,
      end: end ?? null,
      dropped,
      deferred,
      written: false,
    };
    if (changed && flags.write) {
      await save(
        file,
        writeSchedule(text, renderTable(rows, schedule.rest, schedule.days, schedule.reviews, end), dropped),
      );
      result.written = true;
    }
    const head = `没学的新课顺延 ${shiftedDays} 个上课日（最后一节 ${lastLesson}），${movedReviews} 条过期复习挪到今天`;
    process.stdout.write(
      flags.json
        ? `${JSON.stringify(result)}\n`
        : changed
          ? `${head}${deferred ? `；${deferred}` : ""}${result.written ? "（已写入）" : "（未写入，加 --write）"}\n`
          : "没有需要顺延的安排\n",
    );
    return;
  }

  if (command === "next") {
    const date = flags.date ? requireDate(flags.date, "--date") : localToday();
    const rows = schedule.rows.filter((row) => row.date === date);
    if (flags.json) process.stdout.write(`${JSON.stringify({ date, rows })}\n`);
    else if (rows.length === 0) process.stdout.write(`${date} 没有安排\n`);
    else for (const row of rows) process.stdout.write(`${row.id}  ${row.content}\n`);
    return;
  }

  fail(`未知命令：${command}\n${usage()}`);
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
