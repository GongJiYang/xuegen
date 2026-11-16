import { describe, expect, it } from "vitest";
import type { CycleDay, SubjectInfo } from "@shared/data-protocol.js";
import { previousLesson, recallLessons, recallView, stripCoursePrefix } from "./recall.js";
import type { TermChip, TermLessonView } from "./terms.js";

function day(overrides: Partial<CycleDay>): CycleDay {
  return {
    date: "2026-11-17",
    weekday: "周二",
    cycle: "C1",
    week: 2,
    type: "深度",
    subject: "programming-paradigms",
    course: "ctm",
    aux: "c-language",
    auxCourse: "c-systems-programming",
    auxBook: "effective-c",
    names: { ctm: "CTM", "discrete-math-epp": "离散" },
    subjects: {},
    roles: { ctm: "main", "discrete-math-epp": "main", "c-language": "aux" },
    lessons: [],
    overdue: [],
    ...overrides,
  };
}

function chip(title: string, missing = false): TermChip {
  return { key: title, title, path: `/v/${title}.md`, hint: null, missing };
}

function lesson(
  course: string,
  id: string | null,
  date: string,
  terms: TermChip[],
  name = course,
): TermLessonView {
  return { key: `${course}|${date}|${id ?? ""}`, course, courseName: name, label: `${name} ${id} · ${date}`, lesson: id, date, terms };
}

function subject(slug: string, courses: string[]): SubjectInfo {
  return {
    slug,
    title: slug,
    layer: "layer",
    route: "route",
    main: true,
    courses,
    materials: [],
    defaultStyle: null,
  };
}

describe("previousLesson", () => {
  it("counts one lesson back and gives up on the first or on a non-lesson id", () => {
    expect(previousLesson("D4")).toBe("D3");
    expect(previousLesson("R1-D3")).toBe("R1-D2");
    expect(previousLesson("D1")).toBeNull();
    expect(previousLesson("整合")).toBeNull();
  });
});

describe("stripCoursePrefix", () => {
  it("drops the course prefix before the colon", () => {
    expect(stripCoursePrefix("CTM：闭包与静态作用域")).toBe("闭包与静态作用域");
    expect(stripCoursePrefix("复合命题逻辑")).toBe("复合命题逻辑");
    expect(stripCoursePrefix("C: 指针")).toBe("指针");
  });
});

describe("recallLessons", () => {
  it("keeps the one main lesson of the courses taught today, in the day's order", () => {
    expect(
      recallLessons(
        day({
          lessons: [
            { course: "c-language", id: "D2", content: "指针" },
            { course: "ctm", id: "D3", content: "Ch3" },
          ],
        }),
      ),
    ).toEqual([{ course: "ctm", id: "D3" }]);
  });

  it("takes a course's earliest overdue lesson over today's, and leaves done lessons out", () => {
    expect(
      recallLessons(
        day({
          lessons: [
            { course: "ctm", id: "D3", content: "Ch3" },
            { course: "discrete-math-epp", id: "D5", content: "Ch5", done: true },
          ],
          overdue: [
            { course: "ctm", id: "D2", content: "Ch2", date: "2026-11-14" },
            { course: "discrete-math-epp", id: "D4", content: "Ch4", date: "2026-11-16" },
          ],
        }),
      ),
    ).toEqual([
      { course: "ctm", id: "D2" },
      { course: "discrete-math-epp", id: "D4" },
    ]);
  });

  it("is empty on a day with no lesson at all", () => {
    expect(recallLessons(day({ type: null }))).toEqual([]);
  });
});

describe("recallView", () => {
  it("shows the pages of today's lesson's previous lesson, capped, without the course prefix", () => {
    const pages = Array.from({ length: 10 }, (_, index) =>
      chip(`CTM：页 ${index + 1}`, index === 9),
    );
    const groups = recallView({
      day: day({ lessons: [{ course: "ctm", id: "D3", content: "Ch3" }] }),
      terms: [lesson("ctm", "D2", "2026-11-14", pages, "CTM")],
      subjects: null,
      domains: null,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("CTM D2 · 11-14");
    expect(groups[0]?.terms).toHaveLength(8);
    expect(groups[0]?.more).toBe(1);
    expect(groups[0]?.terms.map((term) => term.title)).toEqual(
      Array.from({ length: 8 }, (_, index) => `页 ${index + 1}`),
    );
  });

  it("names the previous lesson without pages when it saved none", () => {
    const groups = recallView({
      day: day({ lessons: [{ course: "discrete-math-epp", id: "D4", content: "Ch4" }] }),
      terms: [],
      subjects: null,
      domains: null,
    });
    expect(groups).toEqual([
      {
        key: "discrete-math-epp|D3",
        course: "discrete-math-epp",
        label: "离散 D3",
        terms: [],
        more: 0,
        domain: null,
        name: "离散",
      },
    ]);
  });

  it("hides a course whose lesson is the first one", () => {
    expect(
      recallView({
        day: day({ lessons: [{ course: "ctm", id: "D1", content: "Ch1" }] }),
        terms: [],
        subjects: null,
        domains: null,
      }),
    ).toEqual([]);
  });

  it("leaves aux courses and done lessons out", () => {
    expect(
      recallView({
        day: day({
          lessons: [
            { course: "c-language", id: "D2", content: "指针" },
            { course: "ctm", id: "D3", content: "Ch3", done: true },
          ],
        }),
        terms: [],
        subjects: null,
        domains: null,
      }),
    ).toEqual([]);
  });

  it("puts today's course first, then the overdue ones by their earliest date", () => {
    const groups = recallView({
      day: day({
        date: "2026-11-17",
        lessons: [{ course: "ctm", id: "D3", content: "Ch3" }],
        overdue: [
          { course: "discrete-math-epp", id: "D4", content: "Ch4", date: "2026-11-16" },
          { course: "ctm", id: "D2", content: "Ch2", date: "2026-11-14" },
        ],
      }),
      terms: [lesson("ctm", "D1", "2026-11-12", [chip("CTM：语言抽象")], "CTM")],
      subjects: null,
      domains: null,
    });
    expect(groups.map((group) => [group.course, group.label])).toEqual([
      ["ctm", "CTM D1 · 11-12"],
      ["discrete-math-epp", "离散 D3"],
    ]);
  });

  it("shows nothing while the terms are loading or after they failed", () => {
    const today = day({ lessons: [{ course: "ctm", id: "D3", content: "Ch3" }] });
    expect(recallView({ day: today, terms: null, subjects: null, domains: null })).toEqual([]);
    expect(recallView({ day: today, terms: "failed", subjects: null, domains: null })).toEqual([]);
    expect(recallView({ day: null, terms: [], subjects: null, domains: null })).toEqual([]);
  });

  it("points at the course's 领域 page through its subject's slug", () => {
    const input = {
      day: day({ lessons: [{ course: "ctm", id: "D3", content: "Ch3" }] }),
      terms: [],
      subjects: [subject("programming-paradigms", ["ctm"])],
      domains: [{ id: "programming-paradigms", title: "编程语言与编程范式" }],
    };
    expect(recallView(input)[0]?.domain).toEqual({
      id: "programming-paradigms",
      title: "编程语言与编程范式",
    });
    expect(recallView({ ...input, subjects: null })[0]?.domain).toBeNull();
  });
});
