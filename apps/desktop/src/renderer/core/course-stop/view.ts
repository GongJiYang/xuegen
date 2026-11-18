/**
 * 总进度「已停用」的视图模型（logic-ui-1116.html B）。
 *
 * Stopped courses are read from the course list the panel already loads; the
 * stop / resume itself is a data request (`course.stop` / `course.resume`) with
 * the reload handled by `use-course-stop`.
 */

import type { CourseSummary } from "@shared/data-protocol.js";
import { courseStopStrings } from "./strings.js";

/** One row of 「已停用」: the course and the day it was stopped (`MM-DD`). */
export interface StoppedCourse {
  slug: string;
  name: string;
  on: string;
}

/** The 总进度 course-stop props, assembled once for every skin. */
export interface CourseStopProps {
  stopped: StoppedCourse[];
  pending: string | null;
  error: string | null;
  onStop(slug: string): void;
  onResume(slug: string): void;
}

/** The stopped courses, oldest stop first; an unknown date sorts first and shows as "". */
export function stoppedList(courses: CourseSummary[] | null): StoppedCourse[] {
  if (courses === null) return [];
  // Sort the full dates (`YYYY-MM-DD`), not the shown `MM-DD`: stops in
  // different years would otherwise compare by month before year.
  return courses
    .filter((course) => course.archived)
    .sort((a, b) => {
      const left = a.archivedOn ?? "";
      const right = b.archivedOn ?? "";
      return left < right ? -1 : left > right ? 1 : 0;
    })
    .map((course) => ({
      slug: course.slug,
      name: course.title,
      on: course.archivedOn === null ? "" : course.archivedOn.slice(5),
    }));
}

/** 「已停用 2 门 · C 语言、数据结构」. */
export function summaryLine(stopped: { name: string }[]): string {
  return courseStopStrings.summary(stopped.map((course) => course.name));
}
