/**
 * "接着上次" — the course to resume, and where.
 *
 * At the start of a session the user usually wants to continue whatever they
 * studied most recently. That is the course whose latest `Learning Record`
 * entry has the newest date; its `Next Session` line is the point to resume
 * from. This is a pure function over the course list so it is testable and does
 * not read the clock.
 *
 * This module is also the renderer's only clock: `setTodayOverride` pins
 * "today" to a fixed `YYYY-MM-DD` (the `XUEGEN_TODAY` override, applied in
 * `main.tsx` before the first render), and `now()` / `todayKey()` are the only
 * sanctioned ways to read the current day. Unset, they behave exactly like the
 * real clock.
 */

import type { CalendarDay, CourseSummary } from "@shared/data-protocol.js";
import { withActionMarker } from "./chat/action-marker.js";
// `isoDate` formats a local day exactly like `dateKey` in board/use-calendar;
// importing that hook module here would create an import cycle (use-calendar
// needs `todayKey` for its initial selection), so the format helper it is.
import { isoDate } from "./format.js";

let overrideDay: string | null = null;

/**
 * Pin "today" to a `YYYY-MM-DD`, or restore the real clock with null. Called
 * once from `main.tsx` before the first render; tests reset it in `afterEach`.
 */
export function setTodayOverride(day: string | null): void {
  overrideDay = day;
}

/**
 * "Now": the real `new Date()`, or — under the override — the pinned day at the
 * real local time-of-day. The result is an ordinary local `Date`, so weekday,
 * arithmetic and `toDateString` all keep working.
 */
export function now(): Date {
  const real = new Date();
  if (overrideDay === null) return real;
  const [year = 1970, month = 1, day = 1] = overrideDay.split("-").map(Number);
  return new Date(
    year,
    month - 1,
    day,
    real.getHours(),
    real.getMinutes(),
    real.getSeconds(),
    real.getMilliseconds(),
  );
}

/** Today's `YYYY-MM-DD`: `isoDate(now())`, override applied. */
export function todayKey(): string {
  return isoDate(now());
}

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

/** Where the course file is: its absolute path and the vault root when known, else the vault-relative path. */
export function courseFileHint(course: Pick<CourseSummary, "slug" | "file">): string {
  const file = course.file;
  const root = file && file.endsWith(`/wiki/courses/${course.slug}.md`) ? file.slice(0, -`/wiki/courses/${course.slug}.md`.length) : null;
  if (file && root) {
    return `（课程文件：${file}；库根：${root}。下次起点以此为准，不必先找库、列目录或读看板）`;
  }
  return `（课程文件：wiki/courses/${course.slug}.md，下次起点以此为准，不必先列目录或读看板）`;
}

/** The prompt the "继续学习" button sends for a resume point. */
export function resumePrompt(resume: ResumePoint): string {
  const title = resume.course.title;
  const prompt = resume.nextSession
    ? `继续 ${title}，从下次起点开始：${resume.nextSession}`
    : `继续 ${title}，从下次起点开始`;
  return withActionMarker(`${prompt}${courseFileHint(resume.course)}`, "resume", resume.course);
}

/** The prompt that opens a course's session from the progress panel. */
export function studyPrompt(course: CourseSummary): string {
  const prompt = course.nextSession
    ? `开始今天的 ${course.title}，下次起点：${course.nextSession}`
    : `开始今天的 ${course.title}`;
  return withActionMarker(`${prompt}${courseFileHint(course)}`, "open", course);
}
