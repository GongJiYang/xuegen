/**
 * Teaching-style resolution for the active session.
 *
 * The user's style is chosen per course and remembered (`desktop.json`
 * `courseStyles`), falling back to the session default (`sessionStyle`), then to
 * 大白话 (`plain`) — the style they have always used. Keeping the precedence in
 * one pure function means the composer, the menu, and the progress panel all
 * agree on what "the current style" is.
 *
 * The style marker itself is built by `chat/style-prefix.ts`; this module only
 * decides which style is in effect.
 */

import type { DesktopSettings, TeachingStyle } from "@shared/protocol.js";

/**
 * The style for a course, or the session default when the course has none.
 *
 * `courseSlug` is null for a session not tied to a course (e.g. a free chat),
 * which uses `sessionStyle`.
 */
export function resolveStyle(settings: DesktopSettings, courseSlug: string | null): TeachingStyle {
  if (courseSlug) {
    const perCourse = settings.courseStyles[courseSlug];
    if (perCourse) return perCourse;
  }
  return settings.sessionStyle;
}

/**
 * Where a style change should be written.
 *
 * A course owns its style only once its session is running (`activeCourse` is
 * its slug); otherwise the change belongs to the session default. This keeps a
 * `/细讲` on a fresh window from silently editing the 接着上次 course's remembered
 * style.
 */
export type StyleWriteTarget = { kind: "course"; slug: string } | { kind: "session" };

export function styleWriteTarget(activeCourse: string | null): StyleWriteTarget {
  return activeCourse ? { kind: "course", slug: activeCourse } : { kind: "session" };
}
