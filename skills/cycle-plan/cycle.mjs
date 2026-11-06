#!/usr/bin/env node
// Xuegen 学习周期：读 wiki/cycles/<cN>.md 的 frontmatter 与周模板、wiki/cycles/route.md 的两年路线，
// 按天给出类型、当天课次与过期未学的课次，以及总进度顶部的路线 / 本周期 / 每门课进度。
// 只读，不写任何文件。无第三方依赖；排期表的解析复用 course 技能的 course-schedule.mjs。
//   node cycle.mjs day <vault> [--date YYYY-MM-DD] [--json]
//   node cycle.mjs week <vault> [--date YYYY-MM-DD] [--json]
//   node cycle.mjs month <vault> YYYY-MM [--json]
//   node cycle.mjs overview <vault> [--date YYYY-MM-DD] [--json]
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

/**
 * 解析周期页：{ cycle, start, end, title, template: { 0..6: { type, subject } }, subjects: { slug: 短名 } }（0 = 周日）。
 * 深度日必须链接一个科目 [[subjects/slug\|短名]]；同一格里的 [[courses/…]] 忽略（旧格式过渡用）。格式不对就抛错。
 */
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
  const heading = lines.find((line) => /^#\s+/.test(line));
  const title = heading ? heading.replace(/^#\s+/, "").replace(/^C\d+\s*·\s*/, "").trim() : "";
  const head = lines.findIndex((line) => /^##\s+Weekly Template\s*$/.test(line));
  if (head === -1) throw new Error(`${name} 缺少 ## Weekly Template`);
  const template = {};
  const subjects = {};
  for (const line of lines.slice(head + 1)) {
    if (/^##\s/.test(line)) break;
    if (!/^\|/.test(line.trim())) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim());
    const day = WEEKDAY_ZH.indexOf(cells[0]);
    if (day === -1) continue;
    const type = cells[1];
    if (!TYPES.includes(type)) throw new Error(`${name} 的${cells[0]}类型「${type}」不认识（可用 ${TYPES.join(" / ")}）`);
    const link = /\[\[subjects\/([^\]|\\]+)(?:\\?\|([^\]]+))?\]\]/.exec(cells[2] ?? "");
    if (type === "深度" && !link) throw new Error(`${name} 的${cells[0]}是深度日，但没有链接科目（[[subjects/…]]）`);
    if (template[day]) throw new Error(`${name} 的${cells[0]}出现了两次`);
    template[day] = { type, subject: link ? link[1].trim() : null };
    if (link) subjects[link[1].trim()] = (link[2] ?? link[1]).trim();
  }
  const missing = WEEKDAY_ZH.filter((_, day) => !template[day]);
  if (missing.length) throw new Error(`${name} 的周模板缺少 ${missing.join("、")}`);
  return { cycle, start, end, title, template, subjects };
}

/** date 在周期里的第几周（从 start 那天起每 7 天一周，第一周是 1）。 */
export function weekOf(cycle, date) {
  return Math.floor(daysBetween(cycle.start, date) / 7) + 1;
}

export function findCycle(cycles, date) {
  return cycles.find((cycle) => cycle.start <= date && date <= cycle.end) ?? null;
}

/** 周模板深度日链接到的科目 slug（去重，按出现顺序）。 */
export function cycleSubjects(cycle) {
  return [...new Set(Object.values(cycle.template).map((slot) => slot.subject).filter(Boolean))];
}

/** 科目页里 ## Materials 与 ## Courses 两节链接的课程：[{ slug, name }]；name 取链接别名，没有别名就是 slug。 */
export function subjectCourses(text) {
  const found = new Map();
  let section = "";
  for (const line of text.split("\n")) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      section = h2[1];
      continue;
    }
    if (section !== "Materials" && section !== "Courses") continue;
    for (const match of line.matchAll(/\[\[courses\/([^\]|\\]+)(?:\\?\|([^\]]+))?\]\]/g)) {
      const slug = match[1].trim();
      const alias = match[2] ? match[2].trim() : null;
      if (!found.has(slug) || (alias && !found.get(slug))) found.set(slug, alias);
    }
  }
  return [...found].map(([slug, alias]) => ({ slug, name: alias ?? slug }));
}

/**
 * 某天的情况。courses：loadCourses 的结果 Map<slug, { subject, name, rows, done, days }>。
 * lessons：这天的计划行（新课与机动，不含复习）；overdue：这天之前、没写进「完成：」的新课次。
 */
export function dayInfo(cycle, courses, date) {
  const base = { date, weekday: WEEKDAY_ZH[weekday(date)] };
  if (!cycle) {
    return { ...base, cycle: null, week: null, type: null, subject: null, course: null, names: {}, subjects: {}, lessons: [], overdue: [] };
  }
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
  const own = slot.subject ? [...courses].filter(([, info]) => info.subject === slot.subject).map(([slug]) => slug) : [];
  const course =
    lessons.find((item) => own.includes(item.course))?.course ??
    overdue.find((item) => own.includes(item.course))?.course ??
    own[0] ??
    null;
  const names = Object.fromEntries([...courses].map(([slug, info]) => [slug, info.name]));
  return {
    ...base,
    cycle: cycle.cycle,
    week: weekOf(cycle, date),
    type: slot.type,
    subject: slot.subject,
    course,
    names,
    subjects: cycle.subjects,
    lessons,
    overdue,
  };
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
 * 一个月的周期信息：
 * { month, days: { 'YYYY-MM-DD': { cycle, week, type, subject, course } }, lessons: { 'YYYY-MM-DD': [{ course, id, content }] },
 *   names: { slug: 短名 }, subjects: { 科目 slug: 短名 }, cycles: [{ cycle, start, end }], recovery: ['YYYY-MM-DD'] }。
 * days 只含落在周期内的日子；lessons 是这些日子的计划行（新课与机动，不含复习）；recovery 是路线页里恢复周落在本月的日子。
 * extra.courses：Map<周期名, loadCourses 的结果>；extra.route：parseRoute 的结果或 null。
 */
export function monthInfo(cycles, month, { courses = new Map(), route = null } = {}) {
  const days = {};
  const lessons = {};
  const names = {};
  const subjects = {};
  const recovery = [];
  for (let date = `${month}-01`; date.startsWith(month); date = addDays(date, 1)) {
    if (route && route.rows.some((row) => row.recovery && row.start <= date && date <= row.end)) recovery.push(date);
    const cycle = findCycle(cycles, date);
    if (!cycle) continue;
    Object.assign(subjects, cycle.subjects);
    const cycleCourseMap = courses.get(cycle.cycle) ?? new Map();
    for (const [slug, info] of cycleCourseMap) names[slug] = info.name;
    const slot = cycle.template[weekday(date)];
    const rows = [];
    for (const [slug, info] of cycleCourseMap) {
      for (const row of info.rows) {
        if (row.kind !== "review" && row.date === date) rows.push({ course: slug, id: row.id, content: row.content });
      }
    }
    const own = slot.subject ? rows.find((row) => cycleCourseMap.get(row.course)?.subject === slot.subject) : null;
    days[date] = { cycle: cycle.cycle, week: weekOf(cycle, date), type: slot.type, subject: slot.subject, course: own ? own.course : null };
    if (rows.length > 0) lessons[date] = rows;
  }
  return { month, days, lessons, names, subjects, cycles: cycles.map(({ cycle, start, end }) => ({ cycle, start, end })), recovery };
}

// ---- 两年路线（wiki/cycles/route.md）----

/**
 * 解析路线页：{ start, end, bufferWeeks, rows: [{ id, start, end, main, aux, status, recovery }] }。
 * rows 来自 ## Cycles 表：周期（C1… 或 [[cycles/c1\|C1]] 或 恢复周）| 开始 | 结束 | 主项 | 辅助 | 状态。格式不对就抛错。
 */
export function parseRoute(text, name = "cycles/route.md") {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!fm) throw new Error(`${name} 缺少 frontmatter`);
  const field = (key) => {
    const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(fm[1]);
    return match ? match[1].trim() : "";
  };
  const start = field("start");
  const end = field("end");
  if (!isValidDate(start) || !isValidDate(end)) throw new Error(`${name} 的 start / end 必须是 YYYY-MM-DD`);
  const bufferWeeks = Number(field("buffer_weeks") || "0");
  if (!Number.isInteger(bufferWeeks) || bufferWeeks < 0) throw new Error(`${name} 的 buffer_weeks 必须是非负整数`);
  const lines = text.split("\n");
  const head = lines.findIndex((line) => /^##\s+Cycles\s*$/.test(line));
  if (head === -1) throw new Error(`${name} 缺少 ## Cycles`);
  const list = (cell) => (cell && cell !== "—" ? cell.split("、").map((item) => item.trim()).filter(Boolean) : []);
  const rows = [];
  for (const line of lines.slice(head + 1)) {
    if (/^##\s/.test(line)) break;
    if (!/^\|/.test(line.trim())) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim());
    if (!isValidDate(cells[1] ?? "")) continue; // 表头与分隔行
    const alias = /\[\[[^\]|\\]+\\?\|([^\]]+)\]\]/.exec(cells[0]);
    const plain = /^\[\[cycles\/(c\d+)\]\]$/.exec(cells[0]);
    const id = alias ? alias[1].trim() : plain ? plain[1].toUpperCase() : cells[0];
    const recovery = id === "恢复周";
    if (!recovery && !/^C\d+$/.test(id)) throw new Error(`${name} 的周期「${cells[0]}」不认识（应为 C1… 或 恢复周）`);
    if (!isValidDate(cells[2] ?? "") || cells[2] < cells[1]) throw new Error(`${name} 的 ${id}（${cells[1]}）结束日期不对`);
    rows.push({ id, start: cells[1], end: cells[2], main: list(cells[3]), aux: list(cells[4]), status: cells[5] ?? "", recovery });
  }
  if (rows.length === 0) throw new Error(`${name} 的 ## Cycles 没有行`);
  return { start, end, bufferWeeks, rows };
}

/**
 * 总进度顶部：{ date, route, cycle, courses }。
 * route（没有路线页时为 null）：{ start, end, bufferWeeks, weeksLeft, cycles: [{ id, start, end, main, aux, status }], recovery: [{ start, end }] }。
 * cycle（不在周期内时为 null）：{ cycle, title, start, end, week, weeks, daysLeft, next: { cycle, start } | null }。
 * courses：本周期的每门课（loadCourses 的顺序）{ slug, subject, name, total, done, end, next: { id, date, content } | null }，只算新课次。
 */
export function planInfo(route, cycle, courses, date) {
  const routeInfo = route
    ? {
        start: route.start,
        end: route.end,
        bufferWeeks: route.bufferWeeks,
        weeksLeft: Math.max(0, Math.ceil(daysBetween(date, route.end) / 7)),
        cycles: route.rows
          .filter((row) => !row.recovery)
          .map(({ id, start, end, main, aux, status }) => ({ id, start, end, main, aux, status })),
        recovery: route.rows.filter((row) => row.recovery).map(({ start, end }) => ({ start, end })),
      }
    : null;
  if (!cycle) return { date, route: routeInfo, cycle: null, courses: [] };
  const next = route ? (route.rows.find((row) => !row.recovery && row.start > cycle.end) ?? null) : null;
  const cycleInfo = {
    cycle: cycle.cycle,
    title: cycle.title,
    start: cycle.start,
    end: cycle.end,
    week: weekOf(cycle, date),
    weeks: Math.ceil((daysBetween(cycle.start, cycle.end) + 1) / 7),
    daysLeft: Math.max(0, daysBetween(date, cycle.end)),
    next: next ? { cycle: next.id, start: next.start } : null,
  };
  const list = [...courses].map(([slug, info]) => {
    const lessons = info.rows.filter((row) => row.kind === "new");
    const open = lessons.filter((row) => !info.done.has(row.id));
    const first = open[0] ?? null;
    return {
      slug,
      subject: info.subject,
      name: info.name,
      total: lessons.length,
      done: lessons.length - open.length,
      end: lessons.length > 0 ? lessons[lessons.length - 1].date : null,
      next: first ? { id: first.id, date: first.date, content: first.content } : null,
    };
  });
  return { date, route: routeInfo, cycle: cycleInfo, courses: list };
}

/**
 * 检查一个周期：长度、休息日、模板里每个科目本周期有课、每门课的上课日都是它科目的深度日、
 * 同一科目同一天不排两门课、新课次都在周期内。courses：loadCourses 的结果。返回问题清单（空数组 = 通过）。
 */
export function checkCycle(cycle, courses) {
  const problems = [];
  const span = daysBetween(cycle.start, cycle.end) + 1;
  if (span !== CYCLE_DAYS) problems.push(`${cycle.cycle}：start ~ end 共 ${span} 天，应为 ${CYCLE_DAYS} 天（7 周）`);
  if (!Object.values(cycle.template).some((slot) => slot.type === "休息")) problems.push(`${cycle.cycle}：周模板没有休息日`);
  const names = (list) => list.map((day) => WEEKDAY_ZH[day]).join("、");
  const deepDays = (subject) =>
    Object.entries(cycle.template)
      .filter(([, slot]) => slot.subject === subject)
      .map(([day]) => Number(day))
      .sort((a, b) => a - b);
  for (const subject of cycleSubjects(cycle)) {
    if (![...courses.values()].some((info) => info.subject === subject)) {
      problems.push(`${cycle.cycle}：周模板里的 subjects/${subject} 本周期没有排课的课程`);
    }
  }
  const taken = new Map();
  for (const [slug, info] of courses) {
    const deep = deepDays(info.subject);
    const outside = [...info.days].filter((day) => !deep.includes(day)).sort((a, b) => a - b);
    if (outside.length > 0) {
      problems.push(`${cycle.cycle}：courses/${slug} 的上课日（${names(outside)}）不是 subjects/${info.subject} 的深度日（${names(deep)}）`);
    }
    for (const row of info.rows) {
      if (row.kind !== "new") continue;
      if (row.date < cycle.start || row.date > cycle.end) {
        problems.push(`${cycle.cycle}：courses/${slug} 的 ${row.id}（${row.date}）在周期之外`);
      }
      const key = `${info.subject} ${row.date}`;
      const other = taken.get(key);
      if (other && other !== slug) {
        problems.push(`${cycle.cycle}：subjects/${info.subject} 在 ${row.date} 同时排了 courses/${other} 与 courses/${slug}`);
      } else {
        taken.set(key, slug);
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
  for (const name of names.filter((item) => /^c\d+\.md$/.test(item)).sort()) {
    files.push({ name: `cycles/${name}`, text: await readFile(join(dir, name), "utf8") });
  }
  return files;
}

export async function loadCycles(vault) {
  const cycles = (await readCycleFiles(vault)).map((file) => parseCycle(file.text, file.name));
  return cycles.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** 读 wiki/cycles/route.md；没有这页返回 null，格式不对抛错。 */
export async function loadRoute(vault) {
  let text;
  try {
    text = await readFile(join(vault, "wiki", "cycles", "route.md"), "utf8");
  } catch {
    return null;
  }
  return parseRoute(text);
}

/**
 * 本周期的课：周模板各科目的科目页链接的课程中，至少有一节新课落在周期内的那些。
 * 返回 Map<slug, { subject, name, rows, done, days }>，按科目在模板里的顺序、科目页里的链接顺序。
 * 科目页不存在就抛错；科目页链接的课程页不存在或没有排期就跳过。
 */
export async function loadCourses(vault, cycle) {
  const courses = new Map();
  for (const subject of cycleSubjects(cycle)) {
    let subjectText;
    try {
      subjectText = await readFile(join(vault, "wiki", "subjects", `${subject}.md`), "utf8");
    } catch {
      throw new Error(`周期 ${cycle.cycle} 链接的科目页不存在：subjects/${subject}.md`);
    }
    for (const { slug, name } of subjectCourses(subjectText)) {
      if (courses.has(slug)) continue;
      let text;
      try {
        text = await readFile(join(vault, "wiki", "courses", `${slug}.md`), "utf8");
      } catch {
        continue;
      }
      const schedule = readSchedule(text);
      if (!schedule) continue;
      if (!schedule.rows.some((row) => row.kind === "new" && cycle.start <= row.date && row.date <= cycle.end)) continue;
      courses.set(slug, { subject, name, rows: schedule.rows, done: completedIds(text), days: schedule.days });
    }
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
    "  node cycle.mjs month <vault> YYYY-MM [--json]",
    "  node cycle.mjs overview <vault> [--date YYYY-MM-DD] [--json]",
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
    try {
      const route = await loadRoute(vault);
      for (const cycle of route ? cycles : []) {
        const row = route.rows.find((item) => item.id === cycle.cycle);
        if (!row) problems.push(`route.md 没有 ${cycle.cycle} 这一行`);
        else if (row.start !== cycle.start || row.end !== cycle.end) {
          problems.push(
            `route.md 的 ${cycle.cycle}（${row.start} ~ ${row.end}）与 cycles/${cycle.cycle.toLowerCase()}.md（${cycle.start} ~ ${cycle.end}）不一致`,
          );
        }
      }
    } catch (error) {
      problems.push(error.message);
    }
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

  if (command === "month") {
    const month = positional[2];
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? "")) fail(`month 需要 YYYY-MM，收到 ${month ?? "（空）"}`);
    let cycles;
    let route;
    const courses = new Map();
    try {
      cycles = await loadCycles(vault);
      route = await loadRoute(vault);
      for (const cycle of cycles) {
        if (cycle.start.slice(0, 7) <= month && month <= cycle.end.slice(0, 7)) {
          courses.set(cycle.cycle, await loadCourses(vault, cycle));
        }
      }
    } catch (error) {
      fail(error.message);
    }
    const info = monthInfo(cycles, month, { courses, route });
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(info)}\n`);
      return;
    }
    const lines = Object.entries(info.days).map(
      ([date, day]) => `${date.slice(5)} ${WEEKDAY_ZH[weekday(date)]} ${day.type}${day.course ? ` ${day.course}` : ""}`,
    );
    process.stdout.write(`${lines.length > 0 ? lines.join("\n") : `${month} 不在任何周期内`}\n`);
    return;
  }

  if (command === "overview") {
    const date = flags.date ?? localToday();
    if (!isValidDate(date)) fail(`--date 必须是 YYYY-MM-DD，收到 ${date}`);
    let info;
    try {
      const cycle = findCycle(await loadCycles(vault), date);
      info = planInfo(await loadRoute(vault), cycle, cycle ? await loadCourses(vault, cycle) : new Map(), date);
    } catch (error) {
      fail(error.message);
    }
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(info)}\n`);
      return;
    }
    const lines = [];
    if (info.route) {
      lines.push(`路线 ${info.route.start} ~ ${info.route.end} · 还有 ${info.route.weeksLeft} 周 · 缓冲 ${info.route.bufferWeeks} 周`);
    }
    if (info.cycle) {
      const { cycle, start, end, week, weeks, daysLeft } = info.cycle;
      lines.push(`${cycle} · ${start} ~ ${end} · 第 ${week} / ${weeks} 周 · 还剩 ${daysLeft} 天`);
    }
    for (const course of info.courses) {
      const next = course.next ? ` · 下一节 ${course.next.id} ${course.next.date}` : "";
      lines.push(`${course.name} ${course.done}/${course.total} 节 · 结课 ${course.end ?? "—"}${next}`);
    }
    process.stdout.write(`${lines.length > 0 ? lines.join("\n") : `${date} 没有路线页，也不在任何周期内`}\n`);
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
