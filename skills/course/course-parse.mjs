#!/usr/bin/env node
// 课程状态文件的共享解析：course-state.mjs 与 render-board.mjs 都从这里取 parseCourse。
// 无第三方依赖，不写文件、不读环境变量，纯解析。用法（作为库）：
//   import { parseCourse, listCourses } from "./course-parse.mjs";
// 作为脚本直接运行时给出用法说明：
//   node course-parse.mjs --help
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

/** 状态文件首行标记；脚本据此识别课程状态文件。 */
export const STATE_MARKER = "xuegen:course-state";

/** 计划表段落的标题前缀（标题后可能带括号说明）。 */
const PLAN_HEADING_PREFIX = "计划表";

/** 用脚本渲染时按此顺序展示段落（与 PLAN-STANDARD.md 一致）。 */
export const SECTION_ORDER = [
  "Overall Goals",
  "This Week",
  "Today",
  "Next Session",
  "计划表",
  "Learning Record",
];

/** course-state.mjs verify 需要存在的段落。 */
const REQUIRED_SECTIONS = ["Overall Goals", "This Week", "Today", "Next Session", "Learning Record"];

/** 单个任务标签的最大长度，超出截断（看板与 JSON 一致）。 */
const MAX_LABEL = 80;

function isTask(line) {
  return /^- \[[ xX]\]/.test(line.trim());
}

/** 取某个 `## ` 段落下的行；段落不存在返回 null。 */
function sectionLines(lines, heading) {
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

/** 把一行任务文本净化成展示用标签。 */
function taskLabel(line) {
  let label = line.trim().replace(/^- \[[ xX]\]\s*/, "");
  label = label.replace(/\*\*/g, "");
  const cut = label.search(/[（(](完成条件|已完成|条件)/);
  if (cut > 0) label = label.slice(0, cut);
  label = label.trim();
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 3)}…` : label;
}

/**
 * 计划表一行里的标签：取日期列右边紧邻的内容格。
 *
 * 库里日期表在「天 | 日期 | 内容 | 材料 | 完成条件」里位置固定，日期后一格就是当天要做的事；
 * 取它而不是最长格，避免把「完成条件」当成计划内容。
 */
function planLabel(cells, dateCell) {
  const index = cells.indexOf(dateCell);
  return index >= 0 && index + 1 < cells.length ? cells[index + 1] : "";
}

/** 某段落里的任务列表，或 null（段落不存在）。 */
function tasksOf(lines, heading) {
  const body = sectionLines(lines, heading);
  if (!body) return null;
  return body.filter(isTask).map((line) => ({
    done: /^- \[[xX]\]/.test(line.trim()),
    label: taskLabel(line),
  }));
}

/** 段落里第一条非空、非任务、非标题/引用/表格的正文行。 */
function firstLineAfter(lines, heading) {
  const body = sectionLines(lines, heading);
  if (!body) return null;
  for (const line of body) {
    const text = line.trim();
    if (!text) continue;
    if (isTask(line)) continue;
    if (/^[#>|]/.test(text)) continue;
    return text;
  }
  return null;
}

/** `- 当前周：…` 这类 Key Facts 字段值。 */
function keyFact(lines, name) {
  const match = lines.find((line) => line.trim().startsWith(`- ${name}：`));
  return match ? match.trim().slice(name.length + 3).trim() : null;
}

/** 把 `## ` 标题切分成 [{name, lines}]。 */
function splitSections(lines) {
  const sections = [];
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { name: heading[1], lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return sections;
}

/** 学习记录标题 `### YYYY-MM-DD-NN` → 日期与序号；普通标题只有 heading。 */
function parseRecords(recordLines) {
  const records = [];
  let current = null;
  for (const line of recordLines) {
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      const date = heading[1].match(/(\d{4}-\d{2}-\d{2})(?:-(\d+))?/);
      current = {
        heading: heading[1],
        date: date ? date[1] : "",
        seq: date && date[2] ? date[2] : "",
        lines: [],
      };
      records.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return records;
}

/** 表格行 → 单元格数组；`|` 首尾去掉后按 `|` 切分。 */
function tableCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * 解析 `## 计划表` 里带日期的行。
 *
 * 形如 `| D2 | 10-22 | … |`：日期列是 `MM-DD`，年份取课程上下文（记录年份/当年）；
 * 也认 course-schedule.mjs 生成的 `| D2 | 2026-11-05（周四） | … |`（年份以单元格为准）。
 * 用于日历聚合；其他形态的表格行（如 `| W1 | … |`）不产出计划。
 */
function parsePlanRows(sections, year) {
  const plan = sections.find((section) => section.name.startsWith(PLAN_HEADING_PREFIX));
  if (!plan) return [];
  const found = [];
  for (const line of plan.lines) {
    if (!/^\|/.test(line.trim())) continue;
    const cells = tableCells(line);
    // `10-22`（年份取上下文）或 course-schedule.mjs 写的 `2026-11-05（周四）`。
    const dateCell = cells.find((cell) => /^(\d{4}-)?\d{1,2}-\d{2}(（[^）]*）)?$/.test(cell));
    if (!dateCell) continue;
    const parts = dateCell.replace(/（[^）]*）$/, "").split("-");
    const [y, month, day] = parts.length === 3 ? parts : [String(year), ...parts];
    found.push({ date: `${y}-${month.padStart(2, "0")}-${day}`, label: planLabel(cells, dateCell) });
  }
  return found;
}

/**
 * 解析一份课程状态文件。
 *
 * 返回结构化字段（供 course-state.mjs 的 list）与原始 `sections`（供 render-board
 * 逐段渲染）。本函数只解析，不渲染、不写文件。`options.today` 只用于推断计划表年份。
 */
export function parseCourse(text, slug, options = {}) {
  const lines = text.split("\n");
  const titleLine = lines.find((line) => line.startsWith("# "));
  const sections = splitSections(lines);
  const overall = tasksOf(lines, "## Overall Goals") ?? [];
  const week = tasksOf(lines, "## This Week") ?? [];
  const recordSection = sections.find((section) => section.name === "Learning Record");
  const records = parseRecords(recordSection ? recordSection.lines : []);
  const last = records.length ? records[records.length - 1] : null;
  const year = inferYear(records, options.today);

  return {
    slug,
    title: titleLine ? titleLine.slice(2).trim() : slug,
    currentWeek: keyFact(lines, "当前周"),
    weekLabel: firstLineAfter(lines, "## This Week"),
    position: keyFact(lines, "当前位置") ?? keyFact(lines, "阅读位置"),
    today: keyFact(sectionLines(lines, "## Today") ?? [], "日期"),
    overall,
    week,
    lastRecord: last ? { date: last.date, seq: last.seq } : null,
    nextSession: firstLineAfter(lines, "## Next Session"),
    plan: parsePlanRows(sections, year),
    records,
    sections,
    marked: text.includes(STATE_MARKER),
    missingSections: REQUIRED_SECTIONS.filter((name) => sectionLines(lines, `## ${name}`) === null),
    styleHint: null,
  };
}

/** 年份：优先用最近记录的年份，其次 options.today，最后本机当年。 */
function inferYear(records, today) {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const match = records[i].date.match(/^(\d{4})-/);
    if (match) return match[1];
  }
  if (today && /^\d{4}-/.test(today)) return today.slice(0, 4);
  const now = new Date();
  return String(now.getFullYear());
}

/** 汇总任务完成情况：`{done, total, tasks}`。 */
export function progressOf(tasks) {
  const done = tasks.filter((task) => task.done).length;
  return { done, total: tasks.length };
}

/** 把解析结果裁剪成 list --json 的条目（日期一律 YYYY-MM-DD）。 */
export function toListEntry(course) {
  return {
    slug: course.slug,
    title: course.title,
    weekLabel: course.weekLabel,
    week: { ...progressOf(course.week), tasks: course.week.map((task) => ({ label: task.label, done: task.done })) },
    overall: progressOf(course.overall),
    lastRecord: course.lastRecord,
    nextSession: course.nextSession,
    styleHint: course.styleHint ?? null,
  };
}

/** 判断一个文件是否为课程状态文件（含标记）。 */
export function isCourseFile(text) {
  return text.includes(STATE_MARKER);
}

/**
 * 读取目录下所有课程状态文件并解析。
 *
 * 只收带 `xuegen:course-state` 标记的 `.md`；跳过其他文件（如截图）。
 * `requireMarker` 为 false 时（测试构造样例）也接受无标记文件。
 */
export async function listCourses(dir, options = {}) {
  const requireMarker = options.requireMarker ?? true;
  const names = existsSync(dir) ? await readdir(dir) : [];
  const slugs = names
    .filter((name) => name.endsWith(".md") && !name.startsWith("."))
    .map((name) => basename(name, ".md"))
    .sort();
  const courses = [];
  for (const slug of slugs) {
    const text = await readFile(join(dir, `${slug}.md`), "utf8");
    if (requireMarker && !isCourseFile(text)) continue;
    courses.push(parseCourse(text, slug, options));
  }
  return courses;
}

/** 段落查找：先精确名后前缀名，供渲染器复用。 */
export function findSection(sections, name) {
  return (
    sections.find((section) => section.name === name) ||
    sections.find((section) => section.name.startsWith(name))
  );
}

/** 作为脚本直接运行 `node course-parse.mjs --help` 时给出说明（非命令）。 */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(
    [
      "课程状态文件共享解析（course-parse）",
      "",
      "这是模块，不是命令。被 course-state.mjs 与 render-board.mjs 导入：",
      "  import { parseCourse, listCourses, toListEntry } from \"./course-parse.mjs\";",
      "",
    ].join("\n"),
  );
}
