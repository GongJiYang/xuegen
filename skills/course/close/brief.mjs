// 收课用的现成信息（issue「收课提速」）：stage --json 时随 { staging } 一起返回，
// 模型不用再自己翻课程页、周期页推算「今天哪节、第几周、记录编几号、课后读排哪天、要不要归档」。
// 只读，不写任何文件：课程页读暂存里的副本，周期/其他课程/概念目录读正式库（manifest.vault）。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, completedIds, readSchedule, weekday } from "../course-schedule.mjs";
import { dayInfo, findCycle, loadCourses, loadElasticCycles, weekOf } from "../../cycle-plan/cycle.mjs";
import { recordBlocks, RECORD_HEADING_RE } from "./rules.mjs";

const WEEK_HEADING_RE = /^###\s+(W\d+)\s+—\s+(.+?)｜(\d{4}-\d{2}-\d{2})\s*~\s*(\d{2}-\d{2}|\d{4}-\d{2}-\d{2})/;

/** 所在周（周一到周日）的周一。 */
function mondayOf(date) {
  return addDays(date, -((weekday(date) + 6) % 7));
}

/** 课程页里「### W2 — 标题｜起 ~ 止」行中含 today 的那一周；结束日只有 MM-DD 时补开始日的年份。 */
function weekOfPage(text, today) {
  for (const line of text.split("\n")) {
    const match = WEEK_HEADING_RE.exec(line);
    if (!match) continue;
    const from = match[3];
    const to = match[4].length === 5 ? `${from.slice(0, 4)}-${match[4]}` : match[4];
    if (from <= today && today <= to) return { label: `${match[1]} — ${match[2]}`, from, to };
  }
  return null;
}

/** 今天第几条记录：课程页与暂存 records/*.md 里 `### <today>-NN` 的最大 NN + 1。 */
function recordId(staging, slug, today, text) {
  const re = new RegExp(`^###\\s+${today}-(\\d{2})`);
  let max = 0;
  const scan = (body) => {
    for (const line of body.split("\n")) {
      const match = re.exec(line);
      if (match) max = Math.max(max, Number(match[1]));
    }
  };
  scan(text);
  const dir = join(staging, "wiki", "courses", slug, "records");
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".md")) scan(readFileSync(join(dir, name), "utf8"));
    }
  }
  return `${today}-${String(max + 1).padStart(2, "0")}`;
}

/** 课后读排哪天：本课是主课才算；周六的课当天读，否则排另一门主课的下一个上课日（落在下周就改排本周六）。 */
function afterReadDate(cycle, courses, slug, today) {
  if (!cycle) return null;
  const own = courses.get(slug);
  if (!own || own.role !== "main") return null;
  if (weekday(today) === 6) return { date: today, reason: "周六的课当天读" };
  const monday = mondayOf(today);
  let candidate = null;
  for (let i = 1; i <= 7; i += 1) {
    const day = addDays(today, i);
    const info = dayInfo(cycle, courses, day);
    const otherMain = info.lessons.some((lesson) => lesson.course !== slug && courses.get(lesson.course)?.role === "main");
    if (otherMain) {
      candidate = day;
      break;
    }
  }
  if (candidate && mondayOf(candidate) === monday) {
    return { date: candidate, reason: "另一门主课的下一个上课日" };
  }
  return { date: addDays(monday, 5), reason: "落到下周，改排本周六" };
}

/** 本科目概念目录：目录在正式库里；subject 为空时整项为 null。 */
function concepts(vault, subject) {
  if (!subject) return null;
  const rel = `wiki/knowledge/concepts/${subject}/`;
  let pages = [];
  const dir = join(vault, rel);
  if (existsSync(dir)) {
    pages = readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -3))
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }
  return { dir: rel, pages };
}

export async function closeBrief(staging, manifest, today) {
  const slug = manifest.slug;
  const courseAbs = join(staging, "wiki", "courses", `${slug}.md`);
  const text = existsSync(courseAbs) ? readFileSync(courseAbs, "utf8") : "";
  const done = completedIds(text);
  const schedule = readSchedule(text);
  let lesson = null;
  let next = null;
  if (schedule) {
    const open = (row) => row.kind === "new" && !done.has(row.id);
    const todayRow = schedule.rows.find((row) => open(row) && row.date === today);
    const overdue = schedule.rows.filter((row) => open(row) && row.date < today).sort((a, b) => (a.date < b.date ? -1 : 1));
    const row = todayRow ?? overdue[0] ?? null;
    if (row) {
      lesson = { id: row.id, date: row.date, content: row.content, material: row.material, doneWhen: row.doneWhen };
      const after = schedule.rows.slice(schedule.rows.indexOf(row) + 1).find((item) => open(item) && item.id !== row.id);
      if (after) next = { id: after.id, date: after.date, content: after.content };
    }
  }
  const cycle = findCycle(await loadElasticCycles(manifest.vault), today);
  const courses = cycle ? await loadCourses(manifest.vault, cycle) : new Map();
  const count = recordBlocks(text).filter((block) => RECORD_HEADING_RE.test(block.heading)).length;
  return {
    today,
    lesson,
    next,
    week: weekOfPage(text, today),
    cycleWeek: cycle ? weekOf(cycle, today) : null,
    recordId: recordId(staging, slug, today, text),
    records: { count, archiveAfterThis: count + 1 > 2 },
    afterRead: afterReadDate(cycle, courses, slug, today),
    concepts: concepts(manifest.vault, manifest.subject),
  };
}
