/**
 * Teaching-style choices for today's sessions.
 *
 * A style picked in the UI holds only for the session it was picked in (see
 * docs/platform/PRINCIPLES.md §5): it lives in memory, per course and for the
 * free chat, and only for the day it was picked. Anything else is 「默认」, which
 * sends no prefix so 学根 follows the subject's 讲解偏好. Pure: the caller passes today.
 */

import type { TeachingStyle } from "@shared/protocol.js";

export interface SessionStyles {
  /** The local day (YYYY-MM-DD) the choices were made on. */
  date: string;
  /** Style picked per course slug today. */
  byCourse: Record<string, TeachingStyle>;
  /** Style picked for the chat not tied to a course. */
  free: TeachingStyle;
}

export function emptySessionStyles(date: string): SessionStyles {
  return { date, byCourse: {}, free: "default" };
}

/** The style in effect for `courseSlug` (null = free chat) on `today`. */
export function resolveStyle(styles: SessionStyles, today: string, courseSlug: string | null): TeachingStyle {
  if (styles.date !== today) return "default";
  if (courseSlug) return styles.byCourse[courseSlug] ?? "default";
  return styles.free;
}

/** Record a pick for `courseSlug` (null = free chat); choices from an earlier day are dropped. */
export function withStyleChoice(
  styles: SessionStyles,
  today: string,
  courseSlug: string | null,
  next: TeachingStyle,
): SessionStyles {
  const base = styles.date === today ? styles : emptySessionStyles(today);
  return courseSlug ? { ...base, byCourse: { ...base.byCourse, [courseSlug]: next } } : { ...base, free: next };
}

/** Today's per-course picks, for the course cards. */
export function courseStylesOf(styles: SessionStyles, today: string): Record<string, TeachingStyle> {
  return styles.date === today ? styles.byCourse : {};
}
