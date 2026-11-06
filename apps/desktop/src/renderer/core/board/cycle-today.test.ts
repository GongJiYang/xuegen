import { describe, expect, it } from "vitest";
import type { CourseSummary, CycleDay } from "@shared/data-protocol.js";
import { ankiDueCount, cycleHeadline, cycleTodayView, tomorrowLine, weekChecks } from "./cycle-today.js";

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
    names: NAMES,
    subjects: {},
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
    expect(cycleHeadline(day({}))).toBe("第 1 周 · 周一 · 深度日");
  });
  it("marks an extra lesson on a non-深度 day", () => {
    const friday = day({ weekday: "周五", type: "整合", subject: null, course: null, lessons: [{ course: "epp", id: "D1", content: "Ch1" }] });
    expect(cycleHeadline(friday)).toBe("第 1 周 · 周五 · 整合日（加课）");
  });
  it("is null outside every cycle", () => {
    expect(cycleHeadline(day({ cycle: null, week: null, type: null, subject: null, course: null }))).toBeNull();
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
    expect(view?.missed).toEqual([{ name: "CTM", id: "D1" }]);
  });
  it("uses verify / light / rest when a day has no lesson", () => {
    expect(cycleTodayView(day({ type: "整合", subject: null, course: null }), null)?.focus).toEqual({ kind: "verify" });
    expect(cycleTodayView(day({ type: "低强度", subject: null, course: null }), null)?.focus).toEqual({ kind: "light" });
    const rest = cycleTodayView(day({ type: "休息", subject: null, course: null }), null);
    expect(rest?.focus).toEqual({ kind: "rest" });
    expect(rest?.showAnki).toBe(false);
  });
  it("adds tomorrow's line", () => {
    const tomorrow = day({ date: "2026-11-10", weekday: "周二", subject: "programming-paradigms", course: "ctm", lessons: [{ course: "ctm", id: "D1", content: "阶梯" }] });
    expect(cycleTodayView(day({}), tomorrow)?.tomorrow).toBe("明天：周二 · 深度日 · CTM D1");
    expect(tomorrowLine(day({ weekday: "周六", type: "低强度", subject: null, course: null }))).toBe("明天：周六 · 低强度日");
  });
  it("is null outside every cycle", () => {
    expect(cycleTodayView(day({ cycle: null, week: null, type: null, subject: null, course: null }), null)).toBeNull();
  });
});

describe("weekChecks and ankiDueCount", () => {
  it("lists each cycle course's 本周 count in template order", () => {
    expect(weekChecks(day({ type: "整合", subject: null }), [course("ctm", 1, 3), course("epp", 2, 3), course("other", 0, 1)])).toEqual([
      { slug: "epp", name: "离散", done: 2, total: 3 },
      { slug: "ctm", name: "CTM", done: 1, total: 3 },
    ]);
  });
  it("sums the due decks, null when Anki is closed", () => {
    expect(ankiDueCount({ running: true, due: [{ deck: "A", count: 30 }, { deck: "B", count: 7 }] })).toBe(37);
    expect(ankiDueCount({ running: true })).toBe(0);
    expect(ankiDueCount({ running: false })).toBeNull();
  });
});
