// 开下一周期向导的两个只读查询（cycle.mjs accept / preview 的实现）：
// accept 把上一周期的验收材料（主课总目标、课次完成度、路线上下一周期的建议）读成 JSON；
// preview 按上一周期的周模板换上新主项，给出新周期第一周的 7 天。
// 只读，不写任何文件。无第三方依赖。
// 对外接口：parseGoals、acceptInfo、previewWeek（纯函数，测试直接调用）；
//   loadAccept、loadPreview（读库，cycle.mjs 的命令层调用）。
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { addDays, isValidDate, weekday } from "../course/course-schedule.mjs";
import {
  cycleSubjects,
  loadCourses,
  loadCycles,
  loadElasticCycles,
  loadRoute,
  shiftRoute,
} from "./cycle.mjs";
import { loadSubjects, stripLinks } from "./subjects.mjs";

const WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** 课程页 `## Overall Goals` 下的复选框 → [{ level, text, done }]。
 * `- [ ] 最低：不查书写出…`；级别取全角冒号前的词，没有冒号时 level 为 ""。 */
export function parseGoals(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^##\s+Overall Goals\s*$/.test(line.trim()));
  if (start === -1) return [];
  const goals = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const match = /^-\s+\[([ xX])\]\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const body = (match[2] ?? "").trim();
    const colon = body.indexOf("：");
    goals.push({
      level: colon === -1 ? "" : body.slice(0, colon).trim(),
      text: colon === -1 ? body : body.slice(colon + 1).trim(),
      done: match[1].toLowerCase() === "x",
    });
  }
  return goals;
}

/**
 * 验收材料。courses：Map<slug, { subject, rows, done, title, goals }>（loadAccept 组装好，只含主课）；
 * next：{ cycle, start, end, mains, status } | null（路线里 cN 的下一个非恢复周行，mains 已是科目 slug）。
 */
export function acceptInfo(cycle, courses, next) {
  const list = [...courses].map(([slug, info]) => {
    const lessons = info.rows.filter((row) => row.kind === "new");
    const remaining = lessons.filter((row) => !info.done.has(row.id)).map((row) => row.id);
    return {
      slug,
      title: info.title,
      subject: info.subject,
      goals: info.goals,
      lessons: { done: lessons.length - remaining.length, total: lessons.length, remaining },
    };
  });
  return {
    cycle: cycle.cycle,
    start: cycle.plannedStart ?? cycle.start,
    end: cycle.plannedEnd ?? cycle.end,
    courses: list,
    next,
  };
}

/**
 * 新周期第一周预览（纯函数）：沿用 cycle 的周模板，把主项科目按顺序换成 mains
 * （`cycleSubjects(cycle)[i] → mains[i]`）；mains 不够长时多出来的主项深度日照旧显示原科目
 * 并标 unchanged: true；辅助列不变。names：{ 科目slug: 短名 }，查不到就用 slug 本身。
 * 返回 { days: [{ date, weekday, type, subject, name, aux, auxName, unchanged? }] }，共 7 天。
 */
export function previewWeek(cycle, mains, names, start) {
  const from = cycleSubjects(cycle);
  const nameOf = (slug) => names[slug] ?? slug;
  const days = [];
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(start, index);
    const day = weekday(date);
    const slot = cycle.template[day];
    let subject = slot.subject;
    let unchanged = false;
    if (subject !== null) {
      const main = from.indexOf(subject);
      if (main !== -1 && main < mains.length) subject = mains[main];
      else if (main !== -1) unchanged = true;
    }
    days.push({
      date,
      weekday: WEEKDAY_ZH[day],
      type: slot.type,
      subject,
      name: subject === null ? null : nameOf(subject),
      aux: slot.aux,
      auxName: slot.aux === null ? null : nameOf(slot.aux),
      ...(unchanged ? { unchanged: true } : {}),
    });
  }
  return { days };
}

// ---- 读库（IO 外壳）----

/** slug → 短名：wiki/subjects.md 里的 [[subjects/<slug>|短名]] 链接优先，其次科目页的 H1。 */
async function subjectNameMap(vault) {
  const names = new Map();
  try {
    const board = await readFile(join(vault, "wiki", "subjects.md"), "utf8");
    for (const match of board.matchAll(/\[\[subjects\/([^\]|\\]+)(?:\\?\|([^\]]+))?\]\]/g)) {
      names.set(match[1].trim(), (match[2] ?? match[1]).trim());
    }
  } catch {
    // 没有科目路线表就靠科目页
  }
  for (const subject of await loadSubjects(vault)) {
    if (!names.has(subject.slug)) names.set(subject.slug, subject.title);
  }
  return names;
}

/** 路线表里 cN 之后第一个非恢复周的行（shiftRoute 平移后的实际日期）；没有返回 null。 */
function nextRouteRow(route, cycleId) {
  if (route === null) return null;
  const index = route.rows.findIndex((row) => row.id === cycleId);
  if (index === -1) return null;
  return route.rows.slice(index + 1).find((row) => !row.recovery) ?? null;
}

/**
 * `cycle.mjs accept`：{ cycle, start, end, courses, next }。
 * courses 是 cN 的主课（辅助/带读不算）；next 是路线里紧跟 cN 的下一周期
 * （mains 由路线上的科目名解析成 slug，对不上科目页标题时原样保留）。
 * cycle 的窗口用顺延后的实际日期：滑过计划结束日的主课课次照样数进完成度。
 */
export async function loadAccept(vault, cN) {
  const cycles = await loadElasticCycles(vault);
  const cycle = cycles.find((item) => item.cycle.toUpperCase() === cN.toUpperCase());
  if (!cycle) throw new Error(`没有这个周期：${cN}`);
  const loaded = await loadCourses(vault, cycle);
  const courses = new Map();
  for (const [slug, info] of loaded) {
    if (info.role !== "main") continue;
    const text = await readFile(join(vault, "wiki", "courses", `${slug}.md`), "utf8");
    const heading = /^#\s+(.+?)\s*$/m.exec(text);
    courses.set(slug, { ...info, title: heading ? heading[1].trim() : slug, goals: parseGoals(text) });
  }
  const route = shiftRoute(await loadRoute(vault), cycles);
  const row = nextRouteRow(route, cycle.cycle);
  let next = null;
  if (row !== null) {
    const titles = new Map();
    for (const subject of await loadSubjects(vault)) titles.set(subject.title, subject.slug);
    const mains = row.main.map((entry) => titles.get(stripLinks(entry)) ?? stripLinks(entry));
    next = { cycle: row.id, start: row.start, end: row.end, mains, status: row.status };
  }
  return acceptInfo(cycle, courses, next);
}

/**
 * `cycle.mjs preview`：{ days: [...] }。from 是沿用模板的周期；start 是新周期第一天；
 * mains 是用户选的主项科目 slug（1–2 个）。
 */
export async function loadPreview(vault, fromCN, start, mains) {
  if (!isValidDate(start)) throw new Error(`--start 必须是 YYYY-MM-DD，收到 ${start}`);
  if (mains.length === 0 || mains.length > 2 || mains.some((slug) => !SLUG_RE.test(slug))) {
    throw new Error(`--main 需要 1–2 个科目 slug（逗号分隔），收到 ${mains.join(",")}`);
  }
  const cycles = await loadCycles(vault);
  const from = cycles.find((item) => item.cycle.toUpperCase() === fromCN.toUpperCase());
  if (!from) throw new Error(`没有这个周期：${fromCN}`);
  // 短名优先用周期页周模板里写的别名（与每日简报一致），其次是科目路线表 / 科目页。
  const names = { ...Object.fromEntries(await subjectNameMap(vault)), ...from.subjects };
  return previewWeek(from, mains, names, start);
}
