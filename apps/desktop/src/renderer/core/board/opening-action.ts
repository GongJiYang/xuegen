/**
 * What a course button does when clicked, given what happened today.
 *
 * A course gets a fresh session for each day's first lesson, so a click can mean two different
 * things: start today's lesson (send an opening message) or merely switch back
 * to a course already opened today (no message). This pure decision keeps the
 * hooks and skins from re-deriving the rule. The caller passes `today` in; the
 * function never reads the clock or the settings file.
 */

/** The three outcomes a course-opening click can have. */
export type OpeningAction = "send-opening" | "switch-only" | "focus-only";

/**
 * Decide what clicking a course (or 继续学习) should do.
 *
 * - Not opened today → `send-opening`.
 * - Opened today but another course is active → `switch-only`.
 * - Opened today and already the active course → `focus-only`.
 */
export function openingAction(
  slug: string,
  today: string,
  courseStartedOn: Record<string, string>,
  activeCourse: string | null,
): OpeningAction {
  if (courseStartedOn[slug] !== today) return "send-opening";
  return activeCourse === slug ? "focus-only" : "switch-only";
}

/** The courses opened on `today`, as `{ slug: true }`, for the button labels. */
export function startedTodayMap(
  courseStartedOn: Record<string, string>,
  today: string,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [slug, day] of Object.entries(courseStartedOn)) {
    if (day === today) result[slug] = true;
  }
  return result;
}
