/**
 * The 「＋」 popover's 开一门课 rows (batch-v3-f, 11-15).
 *
 * `openCourses` is pure: the caller hands in today's cycle day and the course
 * list, and it returns the courses worth opening — today's/loaded cycle courses
 * first (main before aux), then the rest alphabetically — each with the lesson
 * the row names under it.
 */

import { describe, expect, it } from "vitest";
import type { CourseSummary, CycleDay } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import { openCourses } from "./open-courses.js";

function course(overrides: Partial<CourseSummary> & { slug: string; title: string }): CourseSummary {
  return {
    weekLabel: null,
    week: { done: 0, total: 0, tasks: [] },
    overall: { done: 1, total: 10 },
    lastRecord: null,
    nextSession: null,
    styleHint: null,
    ...overrides,
  };
}

function day(overrides: Partial<CycleDay> = {}): CycleDay {
  return {
    date: "2026-11-15",
    weekday: "周日",
    cycle: "C1",
    week: 1,
    type: "深度",
    subject: "discrete-math",
    course: "epp",
    aux: null,
    auxCourse: null,
    names: { epp: "离散", c: "C 语言" },
    subjects: {},
    roles: { epp: "main", c: "aux" },
    lessons: [],
    overdue: [],
    ...overrides,
  };
}

const COURSES = [
  course({ slug: "epp", title: "离散数学" }),
  course({ slug: "c", title: "C 语言程序设计" }),
  course({ slug: "mech", title: "机械可解释性" }),
  course({ slug: "algo", title: "算法" }),
];

describe("openCourses", () => {
  it("puts the cycle's main course before its aux course", () => {
    const rows = openCourses(day(), COURSES);
    expect(rows.map((row) => row.slug)).toEqual(["epp", "c", "mech", "algo"]);
    expect(rows[0]).toMatchObject({ label: "离散", group: "cycle" });
    expect(rows[1]?.group).toBe("cycle");
  });

  it("prefixes the aux course with 导读课", () => {
    const rows = openCourses(day(), COURSES);
    expect(rows[1]?.label).toBe(`${strings.sessions.auxPrefix}C 语言`);
  });

  it("names the lesson when the course has one today (first of several)", () => {
    const rows = openCourses(
      day({
        lessons: [
          { course: "epp", id: "D5", content: "Ch5" },
          { course: "epp", id: "D6", content: "Ch6" },
        ],
      }),
      COURSES,
    );
    expect(rows[0]?.sub).toBe(strings.sessions.todayLesson("D5"));
  });

  it("falls back to the earliest missed lesson when there is none today", () => {
    const rows = openCourses(
      day({
        overdue: [
          { course: "epp", id: "D3", content: "Ch3", date: "2026-11-12" },
          { course: "epp", id: "D2", content: "Ch2", date: "2026-11-10" },
        ],
      }),
      COURSES,
    );
    expect(rows[0]?.sub).toBe(strings.sessions.missedLesson("D2", "11-10"));
  });

  it("leaves the sub empty when the course has neither today's nor a missed lesson", () => {
    const rows = openCourses(day(), COURSES);
    expect(rows[0]?.sub).toBeNull();
  });

  it("lists courses outside the cycle as 其他, sorted by their Chinese titles", () => {
    const rows = openCourses(day(), COURSES);
    const other = rows.filter((row) => row.group === "other");
    expect(other.map((row) => row.label)).toEqual(["机械可解释性", "算法"]);
    expect(other.every((row) => row.sub === null)).toBe(true);
  });

  it("skips finished courses", () => {
    const courses = COURSES.map((item) =>
      item.slug === "algo"
        ? { ...item, overall: { done: 4, total: 4 } }
        : item.slug === "c"
          ? { ...item, overall: { done: 2, total: 2 } }
          : item,
    );
    const rows = openCourses(day(), courses);
    expect(rows.map((row) => row.slug)).toEqual(["epp", "mech"]);
  });

  it("keeps a course with no lessons at all (0 / 0 is not 学完)", () => {
    const courses = COURSES.map((item) =>
      item.slug === "algo" ? { ...item, overall: { done: 0, total: 0 } } : item,
    );
    const rows = openCourses(day(), courses);
    expect(rows.some((row) => row.slug === "algo")).toBe(true);
  });

  it("puts everything under 其他 while the day is still loading", () => {
    const rows = openCourses(null, COURSES);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.group === "other")).toBe(true);
    expect(rows.map((row) => row.label)).toEqual(["机械可解释性", "离散数学", "算法", "C 语言程序设计"]);
  });
});
