/**
 * The 今天 window on a study-cycle day.
 *
 * `cycle.mjs` reports where a day sits in its cycle (week, 深度/整合/低强度/休息,
 * lessons, missed lessons). These pure functions turn that into what the window
 * leads with: one headline, one focus block, the missed lessons of other
 * courses, and a line about tomorrow. No clock, no I/O.
 */

import type { AnkiStatus, CourseSummary, CycleDay, CycleLesson } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

/** What the 今天 window leads with on a cycle day. */
export type CycleFocus =
  | { kind: "lesson"; lesson: CycleLesson; name: string; carriedFrom: string | null }
  | { kind: "verify" }
  | { kind: "light" }
  | { kind: "rest" };

export interface CycleTodayView {
  headline: string;
  focus: CycleFocus;
  /** The day's auxiliary lesson (a short preview, not assessed), or null. */
  aux: { lesson: CycleLesson; name: string } | null;
  /** Other courses' lessons that were missed; they shift when that course is opened. */
  missed: { name: string; id: string }[];
  /** Every day but 休息 shows the Anki row. */
  showAnki: boolean;
  /** 「明天：…」, or null when tomorrow is outside every cycle. */
  tomorrow: string | null;
}

/** One course's row on the 整合 day: its 本周 count. */
export interface WeekCheck {
  slug: string;
  name: string;
  done: number;
  total: number;
}

/** The short name the weekly template links a course with, else its slug. */
export function cycleName(day: CycleDay, slug: string): string {
  return day.names[slug] ?? slug;
}

/** 「第 1 周 · 周五 · 整合日（加课）」, or null outside every cycle. */
export function cycleHeadline(day: CycleDay): string | null {
  if (day.cycle === null || day.week === null || day.type === null) return null;
  const extra = day.type !== "深度" && day.lessons.length > 0;
  return strings.cycle.headline(day.week, day.weekday, day.type, extra);
}

/** 「明天：周六 · 低强度日」 (plus the main lesson and 「+ 辅助 X」), or null outside every cycle. */
export function tomorrowLine(day: CycleDay): string | null {
  if (day.type === null) return null;
  const lesson = day.lessons.find((item) => day.roles[item.course] !== "aux");
  const auxLesson = day.lessons.find((item) => day.roles[item.course] === "aux");
  const aux = auxLesson ? cycleName(day, auxLesson.course) : day.aux ? (day.subjects[day.aux] ?? day.aux) : null;
  return strings.cycle.tomorrow(day.weekday, day.type, lesson ? `${cycleName(day, lesson.course)} ${lesson.id}` : null, aux);
}

/**
 * The view for a cycle day, or null outside every cycle.
 *
 * A missed lesson of the course being studied today is carried: the course
 * skill shifts it to today when the course is opened, so it (not today's
 * planned lesson) is the one to start.
 */
export function cycleTodayView(day: CycleDay, tomorrow: CycleDay | null): CycleTodayView | null {
  const headline = cycleHeadline(day);
  if (headline === null) return null;
  const isAux = (slug: string): boolean => day.roles[slug] === "aux";
  const mainLessons = day.lessons.filter((item) => !isAux(item.course));
  const focusCourse = mainLessons[0]?.course ?? day.course;
  const carried = day.overdue.find((row) => row.course === focusCourse) ?? null;
  const lesson = carried ?? mainLessons[0] ?? null;
  const focus: CycleFocus = lesson
    ? {
        kind: "lesson",
        lesson: { course: lesson.course, id: lesson.id, content: lesson.content },
        name: cycleName(day, lesson.course),
        carriedFrom: carried ? carried.date : null,
      }
    : day.type === "整合"
      ? { kind: "verify" }
      : day.type === "休息"
        ? { kind: "rest" }
        : { kind: "light" };
  const missed = day.overdue
    .filter((row) => row !== carried && !isAux(row.course))
    .map((row) => ({ name: cycleName(day, row.course), id: row.id }));
  return {
    headline,
    focus,
    aux: (() => {
      const auxLesson =
        day.lessons.find((item) => isAux(item.course)) ??
        day.overdue.find((item) => item.course === day.auxCourse) ??
        null;
      return auxLesson
        ? { lesson: { course: auxLesson.course, id: auxLesson.id, content: auxLesson.content }, name: cycleName(day, auxLesson.course) }
        : null;
    })(),
    missed,
    showAnki: day.type !== "休息",
    tomorrow: tomorrow ? tomorrowLine(tomorrow) : null,
  };
}

/** The 整合 day's rows: each cycle course's 本周 done/total, in template order. */
export function weekChecks(day: CycleDay, courses: CourseSummary[]): WeekCheck[] {
  return Object.keys(day.names).filter((slug) => day.roles[slug] !== "aux").flatMap((slug) => {
    const course = courses.find((item) => item.slug === slug);
    return course ? [{ slug, name: cycleName(day, slug), done: course.week.done, total: course.week.total }] : [];
  });
}

/** Cards due in Anki today, or null when Anki is not running. */
export function ankiDueCount(status: AnkiStatus): number | null {
  if (!status.running) return null;
  return (status.due ?? []).reduce((sum, deck) => sum + deck.count, 0);
}
