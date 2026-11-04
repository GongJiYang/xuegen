/**
 * Finding the course a 「新课程」 request just created.
 *
 * The request only reaches 学根 as a prompt; the course file appears later,
 * when the agent has created it and the course list is reloaded. The panel
 * remembers the slug set from before the request and, on the refreshed list,
 * claims the first slug that was not there. Pure, so it is tested.
 */

import type { CourseSummary } from "@shared/data-protocol.js";

/** The first course in `after` whose slug was not in `before`, or null. */
export function findNewCourseSlug(before: readonly string[], after: CourseSummary[]): string | null {
  const known = new Set(before);
  return after.find((course) => !known.has(course.slug))?.slug ?? null;
}
