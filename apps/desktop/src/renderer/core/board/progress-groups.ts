/**
 * 总进度 grouped by subject (design `?d=progress`).
 *
 * `subjects.mjs` says which subjects are this cycle's main subjects and which
 * courses and materials each subject has; the course list says how far each
 * course is. These pure functions combine them into the panel's sections. The
 * date is an argument; no clock.
 */

import type { CourseSummary, SubjectInfo, SubjectMaterial, SubjectsOverview } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

/** A course untouched for more than this many days is marked ! (需注意). */
export const STALE_DAYS = 14;

export type CourseMark = "now" | "warn" | "done" | "plan";

export interface GroupedCourse {
  course: CourseSummary;
  mark: CourseMark;
}

export interface SubjectGroup {
  slug: string;
  title: string;
  courses: GroupedCourse[];
  materials: SubjectMaterial[];
  /** Materials registered but not yet in any plan (◌). */
  unplanned: number;
}

export interface LearnedSubject {
  slug: string;
  title: string;
  /** How many of its materials are ingested (✓). */
  done: number;
}

export interface ProgressGroups {
  cycle: { cycle: string; week: number; weeks: number } | null;
  /** The cycle page's 辅助 line, or null outside a cycle. */
  aux: string | null;
  /** True when the auxiliary slots are empty (the line starts with 「（空）」) or there is no cycle. */
  auxEmpty: boolean;
  main: SubjectGroup[];
  /** Other subjects that have courses, then 「未归科目」 for courses no subject claims. */
  other: SubjectGroup[];
  /** Subjects without courses whose materials include ingested ones. */
  learned: LearnedSubject[];
}

function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000;
}

/** ✓ finished, ○ not started, ! untouched for more than {@link STALE_DAYS} days, else ●. */
export function courseMark(course: CourseSummary, today: string): CourseMark {
  if (course.overall.total > 0 && course.overall.done === course.overall.total) return "done";
  if (!course.lastRecord) return "plan";
  return dayNumber(today) - dayNumber(course.lastRecord.date) > STALE_DAYS ? "warn" : "now";
}

export function groupProgress(overview: SubjectsOverview, courses: CourseSummary[], today: string): ProgressGroups {
  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  const assigned = new Set<string>();
  const toGroup = (subject: SubjectInfo): SubjectGroup => {
    const grouped = subject.courses.flatMap((slug) => {
      const course = bySlug.get(slug);
      if (!course) return [];
      assigned.add(slug);
      return [{ course, mark: courseMark(course, today) }];
    });
    return {
      slug: subject.slug,
      title: subject.title,
      courses: grouped,
      materials: subject.materials,
      unplanned: subject.materials.filter((item) => item.mark === "none").length,
    };
  };
  const main = overview.subjects.filter((subject) => subject.main).map(toGroup);
  const rest = overview.subjects.filter((subject) => !subject.main).map(toGroup);
  const other = rest.filter((group) => group.courses.length > 0);
  const learned = rest
    .filter((group) => group.courses.length === 0 && group.materials.some((item) => item.mark === "done"))
    .map((group) => ({
      slug: group.slug,
      title: group.title,
      done: group.materials.filter((item) => item.mark === "done").length,
    }));
  const unassigned = courses
    .filter((course) => !assigned.has(course.slug))
    .map((course) => ({ course, mark: courseMark(course, today) }));
  if (unassigned.length > 0) {
    other.push({ slug: "", title: strings.progress.unassigned, courses: unassigned, materials: [], unplanned: 0 });
  }
  const aux = overview.cycle?.aux ?? null;
  return {
    cycle: overview.cycle
      ? { cycle: overview.cycle.cycle, week: overview.cycle.week, weeks: overview.cycle.weeks }
      : null,
    aux,
    auxEmpty: aux === null || aux.startsWith("（空）"),
    main,
    other,
    learned,
  };
}
