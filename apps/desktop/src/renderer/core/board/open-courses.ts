/**
 * The 「＋」 popover's 开一门课 rows (user 11-15).
 *
 * The tab strip's 「＋」 opens the session list; above it the popover offers one
 * row per course that still has work left. Picking a row does exactly what
 * 「开课 →」 on the 总控 card does — open that course's session for today — so
 * this module only decides *which* courses to list, in what order, and what
 * lesson each row names. Pure: no clock, no I/O.
 */

import type { CourseSummary, CycleDay } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

/** One 「开一门课」 row: the course, its label, and the lesson line under it. */
export interface OpenCourseRow {
  slug: string;
  label: string;
  sub: string | null;
  /** `cycle` = today's cycle (main first, then aux); `other` = every other course. */
  group: "cycle" | "other";
}

/** A course with no planned lessons at all (0/0) is not finished — it is untouched. */
function isFinished(course: CourseSummary | undefined): boolean {
  if (course === undefined) return false;
  return course.overall.total > 0 && course.overall.done === course.overall.total;
}

/** The lesson line under a row: today's first lesson, else the earliest missed one, else null. */
function lessonLine(day: CycleDay, slug: string): string | null {
  const today = day.lessons.find((lesson) => lesson.course === slug);
  if (today !== undefined) return strings.sessions.todayLesson(today.id);
  let earliest: { id: string; date: string } | null = null;
  for (const lesson of day.overdue) {
    if (lesson.course !== slug) continue;
    if (earliest === null || lesson.date < earliest.date) earliest = { id: lesson.id, date: lesson.date };
  }
  return earliest === null ? null : strings.sessions.missedLesson(earliest.id, earliest.date.slice(5));
}

/**
 * The courses the 「＋」 popover lists.
 *
 * @param day     Today's cycle day, or null while it is still loading (then every course is 其他).
 * @param courses The course list (`courses.list`).
 */
export function openCourses(day: CycleDay | null, courses: CourseSummary[]): OpenCourseRow[] {
  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  const rows: OpenCourseRow[] = [];
  const listed = new Set<string>();

  if (day !== null) {
    const roles = Object.keys(day.roles);
    const ordered = [
      ...roles.filter((slug) => day.roles[slug] === "main"),
      ...roles.filter((slug) => day.roles[slug] === "aux"),
    ];
    for (const slug of ordered) {
      const course = bySlug.get(slug);
      if (isFinished(course)) continue;
      listed.add(slug);
      const name = day.names[slug] ?? course?.title ?? slug;
      rows.push({
        slug,
        label: day.roles[slug] === "aux" ? `${strings.sessions.auxPrefix}${name}` : name,
        sub: lessonLine(day, slug),
        group: "cycle",
      });
    }
  }

  const other = courses
    .filter((course) => !listed.has(course.slug) && !isFinished(course))
    .sort((left, right) => left.title.localeCompare(right.title, "zh"));
  for (const course of other) {
    rows.push({ slug: course.slug, label: course.title, sub: null, group: "other" });
  }

  return rows;
}
