/**
 * Skill description truncation.
 *
 * A skill's description in `SKILL.md` is often a long paragraph; the panel
 * shows only the first sentence by default and reveals the rest on demand. The
 * "first sentence" ends at the first `；` or `。` (the project writes
 * descriptions with those), and is capped at two lines' worth of characters so
 * a run-on sentence still does not fill the row.
 */

import { strings } from "../strings.js";

/** The character count a two-line description holds before it is clipped. */
export const DESCRIPTION_LINE_BUDGET = 60;

/**
 * The first sentence of a description, or the whole text when it has no `；`/`。`.
 *
 * A trailing `；`/`。` is dropped so the summary reads cleanly; text beyond
 * {@link DESCRIPTION_LINE_BUDGET} characters is clipped so at most ~2 lines show.
 */
export function firstSentence(description: string): string {
  const trimmed = description.trim();
  const end = trimmed.search(/[；。]/);
  const sentence = end === -1 ? trimmed : trimmed.slice(0, end);
  return sentence.length > DESCRIPTION_LINE_BUDGET
    ? `${sentence.slice(0, DESCRIPTION_LINE_BUDGET)}…`
    : sentence;
}

/** True when the description has more than its first sentence to reveal. */
export function hasMoreThanFirstSentence(description: string): boolean {
  return firstSentence(description) !== description.trim();
}

/** The name and one line a skill shows: the Chinese pair for a known skill, else its own name and first sentence. */
export function skillLabel(name: string, description: string): { title: string; line: string } {
  const known = strings.skills.known[name];
  if (known) return { title: known[0], line: known[1] };
  return { title: name, line: firstSentence(description) };
}
