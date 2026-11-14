import { describe, expect, it } from "vitest";
import type { CourseSummary, CycleDay } from "@shared/data-protocol.js";
import {
  ankiDueCount,
  cycleHeadline,
  cycleTodayView,
  mergeOverdue,
  tomorrowLine,
  weekChecks,
} from "./cycle-today.js";

const NAMES = { epp: "离散", ctm: "CTM" };
const D2 = { course: "epp", id: "D2", content: "真值表" };

function day(overrides: Partial<CycleDay>): CycleDay {
  return {
    date: "2026-11-09",
    weekday: "周一",
    cycle: "C1",
    week: 1,
    type: "深度",
    subject: "discrete-math",
    course: "epp",
    aux: null,
    auxCourse: null,
    names: NAMES,
    subjects: {},
    roles: { epp: "main", ctm: "main" },
    lessons: [],
    overdue: [],
    ...overrides,
  };
}

function course(slug: string, done: number, total: number): CourseSummary {
  return {
    slug,
    title: slug,
    weekLabel: null,
    week: { done, total, tasks: [] },
    overall: { done: 0, total: 0 },
    lastRecord: null,
    nextSession: null,
    styleHint: null,
  };
}

describe("cycleHeadline", () => {
  it("names the week, weekday and day type", () => {
    expect(cycleHeadline(day({}))).toBe("第 1 周 · 周一 · 主攻日");
  });
  it("marks an extra lesson on a non-深度 day", () => {
    const friday = day({
      weekday: "周五",
      type: "整合",
      subject: null,
      course: null,
      lessons: [{ course: "epp", id: "D1", content: "Ch1" }],
    });
    expect(cycleHeadline(friday)).toBe("第 1 周 · 周五 · 整合日（加课）");
  });
  it("is null outside every cycle", () => {
    expect(
      cycleHeadline(day({ cycle: null, week: null, type: null, subject: null, course: null })),
    ).toBeNull();
  });
});

describe("cycleTodayView", () => {
  it("leads a 深度 day with its lesson", () => {
    const view = cycleTodayView(day({ lessons: [D2] }), null);
    expect(view?.focus).toEqual({ kind: "lesson", lesson: D2, name: "离散", carriedFrom: null });
    expect(view?.missed).toEqual([]);
    expect(view?.showAnki).toBe(true);
    expect(view?.tomorrow).toBeNull();
  });
  it("carries the done flag of the lesson it leads with", () => {
    expect(cycleTodayView(day({ lessons: [{ ...D2, done: true }] }), null)?.focus).toEqual({
      kind: "lesson",
      lesson: { ...D2, done: true },
      name: "离散",
      carriedFrom: null,
    });
    expect(cycleTodayView(day({ lessons: [D2] }), null)?.focus).toEqual({
      kind: "lesson",
      lesson: D2,
      name: "离散",
      carriedFrom: null,
    });
  });
  it("carries the aux lesson's done flag too, so the 带读 row can show ✓", () => {
    const monday = day({
      roles: { epp: "main", effc: "aux" },
      aux: "c",
      auxCourse: "effc",
      lessons: [
        { course: "effc", id: "D1", content: "指针", done: true },
        { course: "epp", id: "D2", content: "真值表" },
      ],
    });
    expect(cycleTodayView(monday, null)?.aux).toEqual({
      lesson: { course: "effc", id: "D1", content: "指针", done: true },
      name: "effc",
    });
    expect(cycleTodayView(monday, null)?.aux?.lesson.done).toBe(true);
  });
  it("carries a missed lesson of today's course and lists other courses' missed lessons", () => {
    const view = cycleTodayView(
      day({
        date: "2026-11-11",
        weekday: "周三",
        lessons: [{ course: "epp", id: "D3", content: "论证" }],
        overdue: [
          { ...D2, date: "2026-11-09" },
          { course: "ctm", id: "D1", content: "阶梯", date: "2026-11-10" },
        ],
      }),
      null,
    );
    expect(view?.focus).toEqual({ kind: "lesson", lesson: D2, name: "离散", carriedFrom: "2026-11-09" });
    expect(view?.missed).toEqual([{ course: "ctm", name: "CTM", id: "D1", count: 1, first: "2026-11-10" }]);
  });
  it("merges a course's missed lessons into one row, earliest date first", () => {
    const view = cycleTodayView(
      day({
        date: "2026-11-11",
        weekday: "周三",
        lessons: [{ course: "epp", id: "D3", content: "论证" }],
        overdue: [
          { course: "ctm", id: "D3", content: "Ch3", date: "2026-11-11" },
          { course: "epp", id: "D2", content: "真值表", date: "2026-11-09" },
          { course: "ctm", id: "D1", content: "Ch1", date: "2026-11-09" },
          { course: "ctm", id: "D2", content: "Ch2", date: "2026-11-10" },
        ],
      }),
      null,
    );
    // epp 的那节由 focus 顺延展示，不进 missed；ctm 三节合成一行。
    expect(view?.missed).toEqual([
      { course: "ctm", name: "CTM", id: "3 节（最早 11-09）", count: 3, first: "2026-11-09" },
    ]);
  });
  it("two courses each get one merged row, ordered by earliest missed date", () => {
    const view = cycleTodayView(
      day({
        lessons: [],
        roles: { epp: "main", ctm: "main", math: "main" },
        names: { epp: "离散", ctm: "CTM", math: "高数" },
        overdue: [
          { course: "math", id: "D1", content: "极限", date: "2026-11-08" },
          { course: "ctm", id: "D1", content: "Ch1", date: "2026-11-06" },
          { course: "math", id: "D2", content: "导数", date: "2026-11-10" },
        ],
      }),
      null,
    );
    // 两门主项课（都不是 focus，因为当天没有主项课次、day.course 仍指 epp）……
    // 这里 epp 不在 overdue 里，没有顺延，missed 只余 ctm 与 math。
    expect(view?.missed.map((row) => row.course)).toEqual(["ctm", "math"]);
    expect(view?.missed.map((row) => [row.count, row.first])).toEqual([
      [1, "2026-11-06"],
      [2, "2026-11-08"],
    ]);
  });
  it("uses verify / light / rest when a day has no lesson", () => {
    expect(cycleTodayView(day({ type: "整合", subject: null, course: null }), null)?.focus).toEqual({
      kind: "verify",
    });
    expect(cycleTodayView(day({ type: "低强度", subject: null, course: null }), null)?.focus).toEqual({
      kind: "light",
    });
    const rest = cycleTodayView(day({ type: "休息", subject: null, course: null }), null);
    expect(rest?.focus).toEqual({ kind: "rest" });
    expect(rest?.showAnki).toBe(false);
  });
  it("adds tomorrow's line", () => {
    const tomorrow = day({
      date: "2026-11-10",
      weekday: "周二",
      subject: "programming-paradigms",
      course: "ctm",
      lessons: [{ course: "ctm", id: "D1", content: "阶梯" }],
    });
    expect(cycleTodayView(day({}), tomorrow)?.tomorrow).toBe("明天：周二 · 主攻日 · CTM D1");
    expect(tomorrowLine(day({ weekday: "周六", type: "低强度", subject: null, course: null }))).toBe(
      "明天：周六 · 低强度日",
    );
  });
  it("is null outside every cycle", () => {
    expect(
      cycleTodayView(day({ cycle: null, week: null, type: null, subject: null, course: null }), null),
    ).toBeNull();
  });
});

describe("mergeOverdue", () => {
  it("groups by course, counts, earliest date, sorts by earliest", () => {
    expect(
      mergeOverdue(
        [
          { course: "b", id: "D2", date: "2026-11-10" },
          { course: "a", id: "D1", date: "2026-11-08" },
          { course: "b", id: "D1", date: "2026-11-09" },
          { course: "b", id: "D3", date: "2026-11-11" },
        ],
        { b: "CTM" },
      ),
    ).toEqual([
      { course: "a", name: "a", count: 1, first: "2026-11-08" },
      { course: "b", name: "CTM", count: 3, first: "2026-11-09" },
    ]);
    expect(mergeOverdue([], {})).toEqual([]);
  });
});

describe("weekChecks and ankiDueCount", () => {
  it("lists each cycle course's 本周 count in template order", () => {
    expect(
      weekChecks(day({ type: "整合", subject: null }), [
        course("ctm", 1, 3),
        course("epp", 2, 3),
        course("other", 0, 1),
      ]),
    ).toEqual([
      { slug: "epp", name: "离散", done: 2, total: 3 },
      { slug: "ctm", name: "CTM", done: 1, total: 3 },
    ]);
  });
  it("sums the due decks, null when Anki is closed", () => {
    expect(
      ankiDueCount({
        running: true,
        due: [
          { deck: "A", count: 30 },
          { deck: "B", count: 7 },
        ],
      }),
    ).toBe(37);
    expect(ankiDueCount({ running: true })).toBe(0);
    expect(ankiDueCount({ running: false })).toBeNull();
  });
});

describe("aux lessons", () => {
  it("keeps the aux lesson out of focus, missed and weekChecks", () => {
    const monday = day({
      names: { "discrete-math-epp": "离散", effc: "Effective C" },
      roles: { "discrete-math-epp": "main", effc: "aux" },
      aux: "c-systems",
      auxCourse: "effc",
      course: "discrete-math-epp",
      lessons: [
        { course: "effc", id: "D1", content: "指针" },
        { course: "discrete-math-epp", id: "D2", content: "真值表" },
      ],
      overdue: [{ course: "effc", id: "D0", content: "导言", date: "2026-11-06" }],
    });
    const view = cycleTodayView(monday, null);
    expect(view?.focus).toMatchObject({ kind: "lesson", lesson: { course: "discrete-math-epp" } });
    expect(view?.aux?.lesson.id).toBe("D1");
    expect(view?.missed.map((item) => item.name)).not.toContain("Effective C");
    expect(
      weekChecks(monday, [course("effc", 1, 3), course("discrete-math-epp", 2, 3)]).map((item) => item.slug),
    ).toEqual(["discrete-math-epp"]);
  });
  it("names the aux subject in the tomorrow line", () => {
    const tuesday = day({
      date: "2026-11-10",
      weekday: "周二",
      subject: "programming-paradigms",
      course: "ctm",
      aux: "ds",
      subjects: { ds: "数据结构" },
      lessons: [{ course: "ctm", id: "D1", content: "阶梯" }],
      roles: { epp: "main", ctm: "main" },
    });
    expect(tomorrowLine(tuesday)).toBe("明天：周二 · 主攻日 · CTM D1 + 导读课 数据结构");
  });
});
