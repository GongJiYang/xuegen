// planbook-nav 的测试：翻页边界（跨月、跨年、闰年 2 月）与三种视图的标题、「今天」按钮。
import { describe, expect, it } from "vitest";
import { isTodayInView, rangeLabel, shiftAnchor, type PlanView } from "./planbook-nav.js";
import type { PlanWeek } from "./planbook.js";

/** A week inside C1 (Friday start, per the fixture cycle). */
const CYCLE_WEEK: PlanWeek = {
  cycle: "C1",
  week: 1,
  start: "2026-11-06",
  end: "2026-11-12",
  days: [],
  goals: [],
  overdue: [],
  reviewDate: "2026-11-13",
};

/** A week outside every cycle falls back to Monday–Sunday. */
const PLAIN_WEEK: PlanWeek = {
  cycle: null,
  week: null,
  start: "2026-11-09",
  end: "2026-11-15",
  days: [],
  goals: [],
  overdue: [],
  reviewDate: null,
};

describe("shiftAnchor", () => {
  it("day：±1 天，跨月跨年都走日历", () => {
    expect(shiftAnchor("day", "2026-11-11", 1)).toBe("2026-11-12");
    expect(shiftAnchor("day", "2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftAnchor("day", "2027-01-01", -1)).toBe("2026-12-31");
  });

  it("week：±7 天", () => {
    expect(shiftAnchor("week", "2026-11-11", 1)).toBe("2026-11-18");
    expect(shiftAnchor("week", "2026-11-11", -1)).toBe("2026-11-04");
    expect(shiftAnchor("week", "2026-11-30", 1)).toBe("2026-12-07");
    expect(shiftAnchor("week", "2027-01-01", -1)).toBe("2026-12-25");
  });

  it("month：到上 / 下个月的 1 日（闰年 2 月也对）", () => {
    expect(shiftAnchor("month", "2026-11-15", 1)).toBe("2026-12-01");
    expect(shiftAnchor("month", "2026-11-15", -1)).toBe("2026-10-01");
    expect(shiftAnchor("month", "2027-01-20", -1)).toBe("2026-12-01");
    // 2024 是闰年：3 月退回 2 月 1 日，2 月进到 3 月 1 日。
    expect(shiftAnchor("month", "2024-03-10", -1)).toBe("2024-02-01");
    expect(shiftAnchor("month", "2024-02-15", 1)).toBe("2024-03-01");
  });
});

describe("rangeLabel", () => {
  it("day：「11-11 周三」", () => {
    expect(rangeLabel("day", "2026-11-11", null)).toBe("11-11 周三");
    expect(rangeLabel("day", "2026-12-24", null)).toBe("12-24 周四");
  });

  it("week：周期内「C1 W1 · 11-06 – 11-12」，否则周一–周日范围", () => {
    expect(rangeLabel("week", "2026-11-11", CYCLE_WEEK)).toBe("C1 W1 · 11-06 – 11-12");
    expect(rangeLabel("week", "2026-11-11", PLAIN_WEEK)).toBe("11-09 – 11-15");
    // 周数据还没到时（null），用 anchor 所在的周一–周日兜底。
    expect(rangeLabel("week", "2026-11-11", null)).toBe("11-09 – 11-15");
    expect(rangeLabel("week", "2026-11-08", null)).toBe("11-02 – 11-08");
  });

  it("month：「2026 年 11 月」，跨年正确", () => {
    expect(rangeLabel("month", "2026-11-15", null)).toBe("2026 年 11 月");
    expect(rangeLabel("month", "2027-01-01", null)).toBe("2027 年 1 月");
  });
});

describe("isTodayInView", () => {
  const cases: { view: PlanView; anchor: string; today: string; week: PlanWeek | null; expected: boolean }[] = [
    { view: "day", anchor: "2026-11-11", today: "2026-11-11", week: null, expected: true },
    { view: "day", anchor: "2026-11-12", today: "2026-11-11", week: null, expected: false },
    { view: "week", anchor: "2026-11-11", today: "2026-11-10", week: CYCLE_WEEK, expected: true },
    { view: "week", anchor: "2026-11-20", today: "2026-11-11", week: { ...CYCLE_WEEK, week: 3, start: "2026-11-20", end: "2026-11-26" }, expected: false },
    // 周数据没到时按 anchor 的周一–周日判断。
    { view: "week", anchor: "2026-11-11", today: "2026-11-15", week: null, expected: true },
    { view: "week", anchor: "2026-11-11", today: "2026-11-16", week: null, expected: false },
    { view: "month", anchor: "2026-11-30", today: "2026-11-11", week: null, expected: true },
    { view: "month", anchor: "2026-12-01", today: "2026-11-30", week: null, expected: false },
  ];
  it.each(cases)("$view anchor=$anchor today=$today → $expected", ({ view, anchor, today, week, expected }) => {
    expect(isTodayInView(view, anchor, today, week)).toBe(expected);
  });
});
