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
 * 解析周期页：{ cycle, start, end, title, template: { 0..6: { type, subject, aux } }, subjects: { slug: 短名 } }（0 = 周日）。
 * 深度日必须链接一个科目 [[subjects/slug\|短名]]；第 4 列（可省略）是辅助科目，只能出现在深度日；同一格里的 [[courses/…]] 忽略（旧格式过渡用）。格式不对就抛错。
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
    const SUBJECT_LINK = /\[\[subjects\/([^\]|\\]+)(?:\\?\|([^\]]+))?\]\]/;
    const link = SUBJECT_LINK.exec(cells[2] ?? "");
    const auxLink = SUBJECT_LINK.exec(cells[3] ?? "");
    if (type === "深度" && !link) throw new Error(`${name} 的${cells[0]}是深度日，但没有链接科目（[[subjects/…]]）`);
    if (auxLink && type !== "深度") throw new Error(`${name} 的${cells[0]}是${type}日，不能排辅助`);
    if (link && auxLink && link[1].trim() === auxLink[1].trim()) throw new Error(`${name} 的${cells[0]}主项和辅助是同一个科目`);
    if (template[day]) throw new Error(`${name} 的${cells[0]}出现了两次`);
    template[day] = { type, subject: link ? link[1].trim() : null, aux: auxLink ? auxLink[1].trim() : null };
    for (const item of [link, auxLink]) if (item) subjects[item[1].trim()] = (item[2] ?? item[1]).trim();
  }
  const mains = new Set(Object.values(template).map((slot) => slot.subject).filter(Boolean));
  const both = Object.values(template).find((slot) => slot.aux && mains.has(slot.aux));
  if (both) throw new Error(`${name} 的 subjects/${both.aux} 既是主项又是辅助`);
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

/** 周模板辅助列链接到的科目 slug（去重，按出现顺序）。 */
export function cycleAuxSubjects(cycle) {
  return [...new Set(Object.values(cycle.template).map((slot) => slot.aux).filter(Boolean))];
}

/** 课程页 ## Relationships 一节里第一个 [[subjects/<s>]] 的 <s>；没有这一节或没有链接返回 null。（与 skills/course/close/rules.mjs 的 subjectOf 相同，就近复制，不跨目录 import。） */
function subjectOf(courseText) {
  const lines = courseText.split("\n");
  const start = lines.findIndex((line) => /^##\s+Relationships\s*$/.test(line.trim()));
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    const match = /\[\[subjects\/([^\]|#\s]+)/.exec(lines[i]);
    if (match) return match[1];
  }
  return null;
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
 * 某天的情况。courses：loadCourses 的结果 Map<slug, { subject, role, name, rows, done, days }>。
 * lessons：这天的计划行（新课与机动，不含复习；每项带 done：已写进该课「完成：」的新课次）；overdue：这天之前、没写进「完成：」的新课次。
 */
export function dayInfo(cycle, courses, date) {
  const base = { date, weekday: WEEKDAY_ZH[weekday(date)] };
  if (!cycle) {
    return { ...base, cycle: null, week: null, type: null, subject: null, course: null, aux: null, auxCourse: null, names: {}, subjects: {}, roles: {}, lessons: [], overdue: [] };
  }
  const slot = cycle.template[weekday(date)];
  const lessons = [];
  const overdue = [];
  for (const [slug, info] of courses) {
    for (const row of info.rows) {
      if (row.kind === "review") continue;
      if (row.date === date) lessons.push({ course: slug, id: row.id, content: row.content, done: info.done.has(row.id) });
      else if (row.kind === "new" && row.date < date && !info.done.has(row.id)) {
        overdue.push({ course: slug, id: row.id, date: row.date, content: row.content });
      }
    }
  }
  overdue.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  const pick = (subject) => {
    if (!subject) return null;
    const own = [...courses].filter(([, info]) => info.subject === subject).map(([slug]) => slug);
    return (
      lessons.find((item) => own.includes(item.course))?.course ??
      overdue.find((item) => own.includes(item.course))?.course ??
      own[0] ??
      null
    );
  };
  const course = pick(slot.subject);
  const auxCourse = pick(slot.aux);
  const roles = Object.fromEntries([...courses].map(([slug, info]) => [slug, info.role]));
  const names = Object.fromEntries([...courses].map(([slug, info]) => [slug, info.name]));
  return {
    ...base,
    cycle: cycle.cycle,
    week: weekOf(cycle, date),
    type: slot.type,
    subject: slot.subject,
    course,
    aux: slot.aux,
    auxCourse,
    names,
    subjects: cycle.subjects,
    roles,
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
 * { month, days: { 'YYYY-MM-DD': { cycle, week, type, subject, course, aux, auxCourse } }, lessons: { 'YYYY-MM-DD': [{ course, id, content, done }] },
 *   names: { slug: 短名 }, subjects: { 科目 slug: 短名 }, roles: { 课程 slug: "main" | "aux" }, cycles: [{ cycle, start, end }], recovery: ['YYYY-MM-DD'] }。
 * days 只含落在周期内的日子；lessons 是这些日子的计划行（新课与机动，不含复习；每项带 done：已写进该课「完成：」）；recovery 是路线页里恢复周落在本月的日子。
 * extra.courses：Map<周期名, loadCourses 的结果>；extra.route：parseRoute 的结果或 null。
 */
export function monthInfo(cycles, month, { courses = new Map(), route = null } = {}) {
  const days = {};
  const lessons = {};
  const names = {};
  const subjects = {};
  const roles = {};
  const recovery = [];
  for (let date = `${month}-01`; date.startsWith(month); date = addDays(date, 1)) {
    if (route && route.rows.some((row) => row.recovery && row.start <= date && date <= row.end)) recovery.push(date);
    const cycle = findCycle(cycles, date);
    if (!cycle) continue;
    Object.assign(subjects, cycle.subjects);
    const cycleCourseMap = courses.get(cycle.cycle) ?? new Map();
    for (const [slug, info] of cycleCourseMap) {
      names[slug] = info.name;
      roles[slug] = info.role;
    }
    const slot = cycle.template[weekday(date)];
    const rows = [];
    for (const [slug, info] of cycleCourseMap) {
      for (const row of info.rows) {
        if (row.kind !== "review" && row.date === date) {
          rows.push({ course: slug, id: row.id, content: row.content, done: info.done.has(row.id) });
        }
      }
    }
    const ofSubject = (subject) =>
      subject ? (rows.find((row) => cycleCourseMap.get(row.course)?.subject === subject)?.course ?? null) : null;
    days[date] = {
      cycle: cycle.cycle,
      week: weekOf(cycle, date),
      type: slot.type,
      subject: slot.subject,
      course: ofSubject(slot.subject),
      aux: slot.aux,
      auxCourse: ofSubject(slot.aux),
    };
    if (rows.length > 0) lessons[date] = rows;
  }
  return { month, days, lessons, names, subjects, roles, cycles: cycles.map(({ cycle, start, end }) => ({ cycle, start, end })), recovery };
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
 *   route.end 是 shiftRoute 平移后的实际结束日（plannedEnd 是路线页上的计划值）。
 * cycle（不在周期内时为 null）：{ cycle, title, start, end, plannedEnd, delayDays, week, weeks, daysLeft, next: { cycle, start } | null, subjects, auxSubjects, subjectDays }。
 *   start / end 是按主项课顺延推算的实际日期；plannedEnd 是周期页上的计划结束日，delayDays 是实际结束比计划晚的天数。
 * courses：本周期的每门课（loadCourses 的顺序）{ slug, subject, role, name, total, done, end, next: { id, date, content } | null, lessons: [{ id, date, content, done }] }，只算新课次。
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
    plannedEnd: cycle.plannedEnd ?? cycle.end,
    delayDays: cycle.delayDays ?? 0,
    week: weekOf(cycle, date),
    weeks: Math.ceil((daysBetween(cycle.start, cycle.end) + 1) / 7),
    daysLeft: Math.max(0, daysBetween(date, cycle.end)),
    next: next ? { cycle: next.id, start: next.start } : null,
    subjects: cycle.subjects,
    auxSubjects: cycleAuxSubjects(cycle),
    subjectDays: Object.fromEntries(
      Object.keys(cycle.subjects).map((slug) => [
        slug,
        [1, 2, 3, 4, 5, 6, 0]
          .filter((day) => cycle.template[day].subject === slug || cycle.template[day].aux === slug)
          .map((day) => WEEKDAY_ZH[day]),
      ]),
    ),
  };
  const list = [...courses].map(([slug, info]) => {
    const lessons = info.rows.filter((row) => row.kind === "new");
    const open = lessons.filter((row) => !info.done.has(row.id));
    const first = open[0] ?? null;
    return {
      slug,
      subject: info.subject,
      role: info.role,
      name: info.name,
      total: lessons.length,
      done: lessons.length - open.length,
      end: lessons.length > 0 ? lessons[lessons.length - 1].date : null,
      next: first ? { id: first.id, date: first.date, content: first.content } : null,
      lessons: lessons.map((row) => ({ id: row.id, date: row.date, content: row.content, done: info.done.has(row.id) })),
    };
  });
  return { date, route: routeInfo, cycle: cycleInfo, courses: list };
}

/**
 * 检查一个周期：长度、休息日、模板里每个科目本周期有课、每门课的上课日都是它科目的深度日、
 * 同一科目同一天不排两门课、新课次都在周期内。辅助科目可以暂时没有课。
 * 带读（辅助课）不设完结（用户 2026-11-11 定）：模板辅助课晚于 end 的课次不报「在周期之外」（早于 start 照报）；
 * carried 课（不在本周期模板里、顺延带过来的带读）跳过「上课日不是深度日」与「在周期之外」两条，
 * 「同一科目同一天两门课」照查（subject 为 null 时跳过）。
 * courses：loadCourses 的结果。返回问题清单（空数组 = 通过）。
 */
export function checkCycle(cycle, courses) {
  const problems = [];
  const span = daysBetween(cycle.plannedStart ?? cycle.start, cycle.plannedEnd ?? cycle.end) + 1;
  if (span !== CYCLE_DAYS) problems.push(`${cycle.cycle}：start ~ end 共 ${span} 天，应为 ${CYCLE_DAYS} 天（7 周）`);
  if (!Object.values(cycle.template).some((slot) => slot.type === "休息")) problems.push(`${cycle.cycle}：周模板没有休息日`);
  const names = (list) => list.map((day) => WEEKDAY_ZH[day]).join("、");
  const deepDays = (subject) =>
    Object.entries(cycle.template)
      .filter(([, slot]) => slot.subject === subject || slot.aux === subject)
      .map(([day]) => Number(day))
      .sort((a, b) => a - b);
  for (const subject of cycleSubjects(cycle)) {
    if (![...courses.values()].some((info) => info.subject === subject)) {
      problems.push(`${cycle.cycle}：周模板里的 subjects/${subject} 本周期没有排课的课程`);
    }
  }
  const taken = new Map();
  for (const [slug, info] of courses) {
    // carried 的课不属于本周期模板：它科目在这模板里没有深度日，课次也可以越过周期边界。
    if (!info.carried) {
      const deep = deepDays(info.subject);
      const outside = [...info.days].filter((day) => !deep.includes(day)).sort((a, b) => a - b);
      if (outside.length > 0) {
        problems.push(`${cycle.cycle}：courses/${slug} 的上课日（${names(outside)}）不是 subjects/${info.subject} 的深度日（${names(deep)}）`);
      }
    }
    for (const row of info.rows) {
      if (row.kind !== "new") continue;
      if (!info.carried && (row.date < cycle.start || (row.date > cycle.end && info.role !== "aux"))) {
        problems.push(`${cycle.cycle}：courses/${slug} 的 ${row.id}（${row.date}）在周期之外`);
      }
      if (info.subject == null) continue;
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

/**
 * 把计划日期推成实际日期。cycles：按 start 排序的 parseCycle 结果；mainLastDates：Map<周期名, 该周期主项课最晚新课次日期 | null>。
 * 返回新数组（不改入参），每项多 plannedStart、plannedEnd、delayDays（本周期结束比计划晚几天，≥ 0），start / end 换成实际日期。
 */
export function elasticCycles(cycles, mainLastDates) {
  let carry = 0;
  return cycles.map((cycle) => {
    const start = addDays(cycle.start, carry);
    const end0 = addDays(cycle.end, carry);
    const last = mainLastDates.get(cycle.cycle);
    const end = last && last > end0 ? last : end0;
    const delayDays = daysBetween(cycle.end, end);
    carry = delayDays;
    return { ...cycle, plannedStart: cycle.start, plannedEnd: cycle.end, start, end, delayDays };
  });
}

/**
 * 路线表按周期推迟平移：有周期页的行用实际日期；其后的行（含恢复周）按前面最后一个有周期页的周期的 delayDays 平移。
 * 顶层 end 同样平移（多出 plannedEnd 记入参原值），start、bufferWeeks 不变。不改入参。
 */
export function shiftRoute(route, elastic) {
  if (!route) return null;
  const byName = new Map(elastic.map((cycle) => [cycle.cycle, cycle]));
  let delay = 0;
  const rows = route.rows.map((row) => {
    const actual = byName.get(row.id);
    let start;
    let end;
    if (actual) {
      ({ start, end } = actual);
      delay = actual.delayDays;
    } else {
      start = addDays(row.start, delay);
      end = addDays(row.end, delay);
    }
    return { ...row, plannedStart: row.start, plannedEnd: row.end, start, end };
  });
  return { ...route, plannedEnd: route.end, end: addDays(route.end, delay), rows };
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

/**
 * 计划周期 + 各周期主项课最晚新课次日期 → 实际周期（elasticCycles 的结果）。
 * 每个周期先用前面周期累计的推迟天数得到候选窗口，对该窗口调 loadCourses（它按窗口过滤），
 * 取其中 role === "main" 的课所有 kind === "new" 行的最晚日期；辅助课不影响结束日。
 */
export async function loadElasticCycles(vault) {
  const planned = await loadCycles(vault);
  const mainLastDates = new Map();
  let carry = 0;
  for (const cycle of planned) {
    const window = { ...cycle, start: addDays(cycle.start, carry), end: addDays(cycle.end, carry) };
    const courses = await loadCourses(vault, window);
    let last = null;
    for (const info of courses.values()) {
      if (info.role !== "main") continue;
      for (const row of info.rows) {
        if (row.kind === "new" && (last === null || row.date > last)) last = row.date;
      }
    }
    mainLastDates.set(cycle.cycle, last);
    carry = daysBetween(cycle.end, last && last > window.end ? last : window.end);
  }
  return elasticCycles(planned, mainLastDates);
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
 * 本周期的课：周模板主项列与辅助列各科目的科目页链接的课程中，至少有一节新课落在周期内的那些；
 * 再补「带过来的带读」（carried: true）。返回 Map<slug, { subject, role, name, rows, done, days, carried? }>
 * （role 为 "main" 或 "aux"），先主项后辅助，按科目在模板里的顺序、科目页里的链接顺序，carried 在最后按文件名排序。
 * 科目页不存在就抛错；科目页链接的课程页不存在或没有排期就跳过。
 *
 * 为什么有 carried 这一步：用户 2026-11-11 定带读（辅助课）不设完结，没上的课次一直往后顺延，
 * 可以越过周期结束日、进入下一个周期。下一周期模板里没有这个科目时，上面两组装不到它，
 * day / month / overview 就都看不见。所以装完模板再扫一遍 wiki/courses/，
 * 只装「本周期窗口内至少有一节没完成的新课」的课——新课全都上完的就不再跟着走。
 */
export async function loadCourses(vault, cycle) {
  const courses = new Map();
  const groups = [
    ["main", cycleSubjects(cycle)],
    ["aux", cycleAuxSubjects(cycle)],
  ];
  for (const [role, subjectList] of groups) {
    for (const subject of subjectList) {
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
        courses.set(slug, { subject, role, name, rows: schedule.rows, done: completedIds(text), days: schedule.days });
      }
    }
  }
  let files;
  try {
    files = await readdir(join(vault, "wiki", "courses"));
  } catch {
    return courses;
  }
  for (const file of files.filter((item) => item.endsWith(".md")).sort()) {
    const slug = file.slice(0, -3);
    if (courses.has(slug)) continue;
    let text;
    let schedule;
    try {
      text = await readFile(join(vault, "wiki", "courses", file), "utf8");
      schedule = readSchedule(text);
    } catch {
      continue;
    }
    if (!schedule) continue;
    const done = completedIds(text);
    const pending = schedule.rows.some(
      (row) => row.kind === "new" && cycle.start <= row.date && row.date <= cycle.end && !done.has(row.id),
    );
    if (!pending) continue;
    const subject = subjectOf(text);
    courses.set(slug, {
      subject,
      role: "aux",
      carried: true,
      name: await carriedName(vault, slug, subject, text),
      rows: schedule.rows,
      done,
      days: schedule.days,
    });
  }
  return courses;
}

/** 带过来的课的名字：科目页里链到这门课的别名；科目页不存在或没别名时用课程页第一个 # 标题，再没有就用 slug。 */
async function carriedName(vault, slug, subject, text) {
  if (subject) {
    try {
      const subjectText = await readFile(join(vault, "wiki", "subjects", `${subject}.md`), "utf8");
      const entry = subjectCourses(subjectText).find((item) => item.slug === slug && item.name !== slug);
      if (entry) return entry.name;
    } catch {
      // 科目页不存在就退回课程页标题
    }
  }
  const heading = /^#\s+(.+?)\s*$/m.exec(text);
  return heading ? heading[1] : slug;
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
    "",
    "  周期页与 route.md 的日期是计划日期；day / week / month / overview 输出的是按主课顺延推算的实际日期。",
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
    let elastic = [];
    try {
      elastic = await loadElasticCycles(vault);
    } catch (error) {
      if (!problems.includes(error.message)) problems.push(error.message);
    }
    for (const cycle of elastic) {
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
      cycles = await loadElasticCycles(vault);
      route = shiftRoute(await loadRoute(vault), cycles);
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
      const cycles = await loadElasticCycles(vault);
      const cycle = findCycle(cycles, date);
      const route = shiftRoute(await loadRoute(vault), cycles);
      info = planInfo(route, cycle, cycle ? await loadCourses(vault, cycle) : new Map(), date);
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
      const { cycle, start, end, week, weeks, daysLeft, delayDays, plannedEnd } = info.cycle;
      const late = delayDays > 0 ? `（比计划晚 ${delayDays} 天，计划结束 ${plannedEnd}）` : "";
      lines.push(`${cycle} · ${start} ~ ${end} · 第 ${week} / ${weeks} 周 · 还剩 ${daysLeft} 天${late}`);
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
    cycle = findCycle(await loadElasticCycles(vault), date);
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
