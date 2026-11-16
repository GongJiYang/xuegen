/**
 * 总控「开课前回想一下」(design `docs/desktop/mockups/recall.html`, user 11-16):
 * for each main course with a lesson still to teach today, the concept pages
 * its previous lesson saved. Read-only; built from the 术语 data (`terms.list`).
 */

import type { CycleDay, SubjectInfo } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import type { TermChip, TermLessonView } from "./terms.js";
import { compareText } from "../../../shared/text-order.js";

/** At most this many pages per lesson; the rest are counted. */
export const RECALL_MAX = 8;

export interface RecallGroup {
  key: string; // `${course}|${prev}`
  course: string;
  /** 「CTM D2 · 11-14」 when the previous lesson saved pages, else 「CTM D2」. */
  label: string;
  /** Up to RECALL_MAX pages, titles without the course prefix (「CTM：」). */
  terms: TermChip[];
  /** Pages past RECALL_MAX (0 when none). */
  more: number;
  /** The 领域 page to open: subject id and its title; null when unknown. */
  domain: { id: string; title: string } | null;
  /** The course's short name (「CTM」), for 「CTM 全部概念页 → 领域」. */
  name: string;
}

/** The lesson before `id` (`D4` → `D3`, `R1-D3` → `R1-D2`), or null for the first one. */
export function previousLesson(id: string): string | null {
  const parts = /^(.*?)(\d+)$/.exec(id);
  if (parts === null || Number(parts[2]) <= 1) return null;
  return `${parts[1]}${Number(parts[2]) - 1}`;
}

/** A concept page's title without its course prefix (`CTM：闭包…` → `闭包…`). */
export function stripCoursePrefix(title: string): string {
  const stripped = title.replace(/^.{1,12}?[：:]\s*/, "");
  return stripped === "" ? title : stripped;
}

/**
 * One lesson per main course still to teach today: today's first, in
 * `day.lessons` order, then a course whose lesson is overdue (earliest date
 * first). A course with several candidates keeps its earliest one.
 */
export function recallLessons(day: CycleDay): { course: string; id: string }[] {
  if (day.type === null) return [];
  const isMain = (course: string): boolean => day.roles[course] === "main";
  const today = day.lessons.filter((lesson) => isMain(lesson.course) && lesson.done !== true);
  const overdue = day.overdue.filter((lesson) => isMain(lesson.course) && lesson.done !== true);
  const earliest = (course: string): { course: string; id: string; date: string } | null =>
    overdue.filter((lesson) => lesson.course === course).reduce<{ course: string; id: string; date: string } | null>(
      (best, lesson) => (best === null || lesson.date < best.date ? lesson : best),
      null,
    );
  const courses = [...new Set(today.map((lesson) => lesson.course))];
  const rest = [...new Set(overdue.map((lesson) => lesson.course))].filter(
    (course) => !courses.includes(course),
  );
  const rows: { course: string; id: string }[] = courses.map((course) => {
    const missed = earliest(course);
    // A course with anything overdue recalls from that lesson, not today's later one.
    return { course, id: (missed ?? today.find((lesson) => lesson.course === course))?.id ?? "" };
  });
  const others = rest
    .map((course) => earliest(course))
    .filter((row): row is { course: string; id: string; date: string } => row !== null)
    .sort((a, b) => (a.date === b.date ? compareText(a.course, b.course) : a.date < b.date ? -1 : 1));
  return [...rows, ...others.map((row) => ({ course: row.course, id: row.id }))];
}

/** The 领域 entry for `course`: its subject's slug resolved to a domain title. */
function domainOf(
  course: string,
  subjects: readonly SubjectInfo[] | null,
  domains: readonly { id: string; title: string }[] | null,
): { id: string; title: string } | null {
  const subject = subjects?.find((item) => item.courses.includes(course));
  if (subject === undefined) return null;
  const domain = domains?.find((item) => item.id === subject.slug);
  if (domain === undefined) return null;
  return { id: domain.id, title: domain.title };
}

/**
 * The block's groups, in the order `recallLessons` gives. Empty while the day
 * or the terms are not available — the block simply does not show.
 */
export function recallView(input: {
  day: CycleDay | null;
  terms: readonly TermLessonView[] | null | "failed";
  subjects: readonly SubjectInfo[] | null;
  domains: readonly { id: string; title: string }[] | null;
}): RecallGroup[] {
  const { day, terms: maybeTerms, subjects, domains } = input;
  if (day === null || !Array.isArray(maybeTerms)) return [];
  const terms: readonly TermLessonView[] = maybeTerms;
  const groups: RecallGroup[] = [];
  for (const lesson of recallLessons(day)) {
    const prev = previousLesson(lesson.id);
    if (prev === null) continue;
    const name = day.names[lesson.course] ?? lesson.course;
    const found = terms.find((item) => item.course === lesson.course && item.lesson === prev);
    const pages = found === undefined ? [] : found.terms.filter((term) => !term.missing);
    groups.push({
      key: `${lesson.course}|${prev}`,
      course: lesson.course,
      label: found === undefined ? `${name} ${prev}` : strings.panel.termsLesson(name, prev, found.date),
      terms: pages
        .slice(0, RECALL_MAX)
        .map((term) => ({ ...term, title: stripCoursePrefix(term.title) })),
      more: Math.max(0, pages.length - RECALL_MAX),
      domain: domainOf(lesson.course, subjects, domains),
      name,
    });
  }
  return groups;
}
