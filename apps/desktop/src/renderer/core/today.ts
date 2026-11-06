/**
 * "接着上次" — the course to resume, and where.
 *
 * At the start of a session the user usually wants to continue whatever they
 * studied most recently. That is the course whose latest `Learning Record`
 * entry has the newest date; its `Next Session` line is the point to resume
 * from. This is a pure function over the course list so it is testable and does
 * not read the clock.
 */

import type { CalendarDay, CourseSummary } from "@shared/data-protocol.js";

/** The course to resume plus the point to resume from. */
export interface ResumePoint {
  course: CourseSummary;
  /** The course's `Next Session` line, or null when it is unset. */
  nextSession: string | null;
}

/** One concrete thing planned or done today, shown under 「今天计划」. */
export interface TodayPlanItem {
  kind: "record" | "plan" | "reading";
  /** The course or reading title to show before the detail. */
  label: string;
  /** The detail (a heading, a task label, a reading title). */
  detail: string;
}

/** The `YYYY-MM-DD` (or `YYYY-MM-DD-NN`) date key of a record, for ordering. */
function recordDateKey(course: CourseSummary): string | null {
  const record = course.lastRecord;
  if (!record) return null;
  return `${record.date}-${record.seq}`;
}

/**
 * The concrete items that make up a day's 「今天计划」.
 *
 * Combines the course learning records, the course plan rows, and the reading
 * items due that day — the same sources the calendar aggregates. Course slugs are
 * resolved to titles through `courseTitles`, falling back to the slug when a
 * course is unknown. Pure: the day and the title map are arguments.
 */
export function todayPlanItems(
  day: CalendarDay | undefined,
  courseTitles: Record<string, string>,
): TodayPlanItem[] {
  if (!day) return [];
  const titleOf = (slug: string): string => courseTitles[slug] ?? slug;
  const items: TodayPlanItem[] = [];
  for (const record of day.records) {
    items.push({ kind: "record", label: titleOf(record.course), detail: record.heading });
  }
  for (const plan of day.plans) {
    items.push({ kind: "plan", label: titleOf(plan.course), detail: plan.label });
  }
  for (const reading of day.readingDue) {
    items.push({ kind: "reading", label: reading.title, detail: reading.title });
  }
  return items;
}

/**
 * Pick the course to resume.
 *
 * The course with the newest `lastRecord` wins; ties break toward the one with a
 * `Next Session` set (there is a point to resume), then by slug so the result is
 * deterministic. Returns null when no course has a record yet.
 */
export function resumePoint(courses: CourseSummary[]): ResumePoint | null {
  let best: CourseSummary | null = null;
  let bestKey: string | null = null;
  for (const course of courses) {
    const key = recordDateKey(course);
    if (!key) continue;
    if (best === null || bestKey === null || key > bestKey) {
      best = course;
      bestKey = key;
      continue;
    }
    if (key === bestKey && !best.nextSession && course.nextSession) best = course;
  }
  if (!best) return null;
  return { course: best, nextSession: best.nextSession };
}

/**
 * The course file hint appended to every opening prompt.
 *
 * The file is the single source of truth (`course-state.mjs` also derives the
 * slug from the file name), so naming it here saves the agent a directory scan
 * and a board read before it can start teaching.
 */
function courseFileHint(slug: string): string {
  return `（课程文件：wiki/courses/${slug}.md，下次起点以此为准，不必先列目录或读看板）`;
}

/** The prompt the "继续学习" button sends for a resume point. */
export function resumePrompt(resume: ResumePoint): string {
  const title = resume.course.title;
  const prompt = resume.nextSession
    ? `继续 ${title}，从下次起点开始：${resume.nextSession}`
    : `继续 ${title}，从下次起点开始`;
  return `${prompt}${courseFileHint(resume.course.slug)}`;
}

/** The prompt that opens a course's session from the progress panel. */
export function studyPrompt(course: CourseSummary): string {
  const prompt = course.nextSession
    ? `开始今天的 ${course.title}，下次起点：${course.nextSession}`
    : `开始今天的 ${course.title}`;
  return `${prompt}${courseFileHint(course.slug)}`;
}
