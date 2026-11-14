import { describe, expect, it } from "vitest";
import type { CycleMonth, CycleOverview } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import {
  auxRows,
  cellAuxTag,
  cellFlag,
  cellReadingTag,
  cellTag,
  courseCards,
  cyclePlacement,
  cycleView,
  dayLessons,
  daySlotLine,
  daysBetween,
  hasAux,
  legendNames,
  routeView,
  shortDay,
  subjectDaysLine,
} from "./plan-view.js";

const OVERVIEW: CycleOverview = {
  date: "2026-11-06",
  route: {
    start: "2026-11-06",
    end: "2028-07-20",
    bufferWeeks: 12,
    weeksLeft: 89,
    cycles: [
      {
        id: "C1",
        start: "2026-11-06",
        end: "2026-12-24",
        main: ["离散数学", "编程语言与编程范式"],
        aux: ["数据结构与算法", "C 与系统编程"],
        status: "进行中",
      },
      {
        id: "C2",
        start: "2026-12-25",
        end: "2027-02-11",
        main: ["数据结构与算法", "C 与系统编程"],
        aux: [],
        status: "未开始",
      },
      {
        id: "C3",
        start: "2027-02-19",
        end: "2027-04-08",
        main: ["计算机体系结构", "计算理论"],
        aux: [],
        status: "未开始",
      },
    ],
    recovery: [{ start: "2027-02-12", end: "2027-02-18" }],
  },
  cycle: {
    cycle: "C1",
    title: "离散数学 + 编程语言与编程范式",
    start: "2026-11-06",
    end: "2026-12-24",
    plannedEnd: "2026-12-24",
    delayDays: 0,
    week: 1,
    weeks: 7,
    daysLeft: 48,
    next: { cycle: "C2", start: "2026-12-25" },
    subjects: { "discrete-math": "离散", "programming-paradigms": "范式" },
    auxSubjects: [],
    subjectDays: { "discrete-math": ["周一", "周三"], "programming-paradigms": ["周二", "周四"] },
  },
  courses: [
    {
      slug: "epp",
      subject: "discrete-math",
      role: "main",
      name: "离散",
      total: 15,
      done: 0,
      end: "2026-12-23",
      next: { id: "D1", date: "2026-11-06", content: "Ch1 全章" },
      lessons: [{ id: "D1", date: "2026-11-06", content: "Ch1 全章", done: false }],
    },
    {
      slug: "ctm",
      subject: "programming-paradigms",
      role: "main",
      name: "CTM",
      total: 14,
      done: 0,
      end: "2026-12-24",
      next: { id: "D1", date: "2026-11-10", content: "概念阶梯" },
      lessons: [],
    },
  ],
};

const MONTH: CycleMonth = {
  month: "2026-12",
  days: {
    "2026-12-21": {
      cycle: "C1",
      week: 7,
      type: "深度",
      subject: "discrete-math",
      course: "epp",
      aux: null,
      auxCourse: null,
    },
    "2026-12-22": {
      cycle: "C1",
      week: 7,
      type: "深度",
      subject: "programming-paradigms",
      course: null,
      aux: null,
      auxCourse: null,
    },
    "2026-12-24": {
      cycle: "C1",
      week: 7,
      type: "深度",
      subject: "programming-paradigms",
      course: null,
      aux: null,
      auxCourse: null,
    },
    "2026-12-18": {
      cycle: "C1",
      week: 7,
      type: "整合",
      subject: null,
      course: null,
      aux: null,
      auxCourse: null,
    },
    "2026-12-19": {
      cycle: "C1",
      week: 7,
      type: "低强度",
      subject: null,
      course: null,
      aux: null,
      auxCourse: null,
    },
    "2026-12-20": {
      cycle: "C1",
      week: 7,
      type: "休息",
      subject: null,
      course: null,
      aux: null,
      auxCourse: null,
    },
  },
  lessons: { "2026-12-21": [{ course: "epp", id: "D14", content: "组合数" }] },
  names: { epp: "离散", ctm: "CTM" },
  subjects: { "discrete-math": "离散", "programming-paradigms": "范式" },
  roles: { epp: "main", ctm: "main" },
  cycles: [
    { cycle: "C1", start: "2026-11-06", end: "2026-12-24" },
    { cycle: "C2", start: "2026-12-25", end: "2027-02-11" },
  ],
  recovery: ["2026-12-30"],
};

describe("plan-view dates", () => {
  it("shortDay and daysBetween", () => {
    expect(shortDay("2026-11-06")).toBe("11-06 周五");
    expect(shortDay("2026-12-24")).toBe("12-24 周四");
    expect(daysBetween("2026-11-06", "2026-12-24")).toBe(48);
    expect(daysBetween("2026-12-24", "2026-11-06")).toBe(-48);
  });
});

describe("routeView", () => {
  it("shows the end date, the weeks left and one segment per cycle", () => {
    const view = routeView(OVERVIEW, "2026-11-06");
    expect(view?.end).toBe("2028 年 7 月 20 日");
    expect(view?.sub).toBe("2026-11-06 开始 · 还有 89 周 · 另留约 12 周缓冲");
    const plan = ["plan", "plan", "plan", "plan", "plan", "plan", "plan"];
    expect(view?.segments).toEqual([
      {
        id: "C1",
        label: "C1",
        state: "now",
        restAfter: false,
        weeks: ["now", "left", "left", "left", "left", "left", "left"],
      },
      { id: "C2", label: "C2", state: "plan", restAfter: true, weeks: plan },
      { id: "C3", label: "C3", state: "plan", restAfter: false, weeks: plan },
    ]);
    expect(routeView(OVERVIEW, "2026-11-20")?.segments[0]?.weeks).toEqual([
      "done",
      "done",
      "now",
      "left",
      "left",
      "left",
      "left",
    ]);
    expect(view?.cycles[0]).toEqual({
      id: "C1",
      subjects: "离散数学 + 编程语言与编程范式",
      range: "26.11.06 – 12.24",
      now: true,
    });
  });
  it("marks 完成 cycles done and returns null without a route", () => {
    const done = {
      ...OVERVIEW,
      route: {
        ...OVERVIEW.route!,
        cycles: OVERVIEW.route!.cycles.map((c) => (c.id === "C1" ? { ...c, status: "完成" } : c)),
      },
    };
    expect(routeView(done, "2026-12-26")?.segments.map((s) => s.state)).toEqual(["done", "now", "plan"]);
    expect(routeView(done, "2026-12-26")?.segments[0]?.weeks).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "done",
      "done",
    ]);
    expect(routeView(OVERVIEW, "2026-12-26")?.segments[0]?.state).toBe("done");
    expect(routeView({ ...OVERVIEW, route: null }, "2026-11-06")).toBeNull();
  });
  it("gives a late cycle one cell per calendar week, so the current week is not stuck on the 7th", () => {
    const late = (end: string): CycleOverview => ({
      ...OVERVIEW,
      route: {
        ...OVERVIEW.route!,
        cycles: [{ ...OVERVIEW.route!.cycles[0]!, end }, ...OVERVIEW.route!.cycles.slice(1)],
      },
    });
    const eight = routeView(late("2026-12-29"), "2026-12-27")?.segments[0];
    expect(eight?.state).toBe("now");
    expect(eight?.weeks).toHaveLength(8);
    expect(eight?.weeks.slice(0, 7)).toEqual(["done", "done", "done", "done", "done", "done", "done"]);
    expect(eight?.weeks[7]).toBe("now");

    expect(routeView(late("2026-12-24"), "2026-12-20")?.segments[0]?.weeks).toHaveLength(7);
    expect(routeView(late("2026-12-24"), "2026-12-20")?.segments[0]?.weeks).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "done",
      "now",
    ]);
  });
  it("done and plan segments also use their own week count", () => {
    const long = (status: string, end: string, start = "2026-11-06"): CycleOverview => ({
      ...OVERVIEW,
      route: {
        ...OVERVIEW.route!,
        cycles: [{ ...OVERVIEW.route!.cycles[0]!, start, end, status }, ...OVERVIEW.route!.cycles.slice(1)],
      },
    });
    expect(routeView(long("完成", "2026-12-29"), "2026-12-27")?.segments[0]?.weeks).toEqual(
      Array.from({ length: 8 }, () => "done"),
    );
    expect(routeView(long("未开始", "2027-01-14"), "2026-10-01")?.segments[0]?.weeks).toEqual(
      Array.from({ length: 10 }, () => "plan"),
    );
  });
});

describe("cycleView", () => {
  it("shows the cycle's dates, days left, next cycle and the planned aux subjects", () => {
    expect(cycleView(OVERVIEW, "2026-11-06")).toEqual({
      id: "C1",
      name: "离散数学 + 编程语言与编程范式",
      range: "11-06 → 12-24（周四）· 还剩 48 天",
      title: "C1 · 离散数学 + 编程语言与编程范式",
      week: "第 1 / 7 周",
      start: "11-06 周五",
      end: "12-24 周四 结束",
      percent: 2,
      sub: "还剩 48 天 · 下个周期 C2 从 12-25 开始",
      aux: "原定 数据结构与算法、C 与系统编程",
    });
  });
  it("handles no title, no next cycle, no route and no cycle", () => {
    const bare = { ...OVERVIEW, route: null, cycle: { ...OVERVIEW.cycle!, title: "", next: null } };
    const view = cycleView(bare, "2026-12-24");
    expect(view?.title).toBe("C1");
    expect(view?.name).toBe("C1");
    expect(view?.sub).toBe("还剩 48 天");
    expect(view?.aux).toBeNull();
    expect(view?.percent).toBe(100);
    expect(cycleView({ ...OVERVIEW, cycle: null }, "2026-11-06")).toBeNull();
  });
});

describe("courseCards", () => {
  it("says when the next lesson is: today, a later day, or missed", () => {
    const [epp, ctm] = courseCards(OVERVIEW, "2026-11-06");
    expect(epp).toEqual({
      slug: "epp",
      role: "main",
      subject: "discrete-math",
      name: "离散",
      done: 0,
      total: 15,
      percent: 0,
      mark: "now",
      end: "结课 12-23",
      next: { when: "今天", text: "D1 Ch1 全章" },
      lessons: [{ id: "D1", date: "11-06", content: "Ch1 全章", done: false }],
    });
    expect(ctm?.next?.when).toBe("11-10 周二");
    const late = courseCards(OVERVIEW, "2026-11-08")[0];
    expect(late?.mark).toBe("warn");
    expect(late?.next?.when).toBe("11-06 没学");
  });
  it("marks a finished course done and copes with no schedule", () => {
    const finished = { ...OVERVIEW, courses: [{ ...OVERVIEW.courses[0]!, done: 15, next: null }] };
    expect(courseCards(finished, "2026-12-24")[0]).toMatchObject({ mark: "done", percent: 100, next: null });
    const empty = {
      ...OVERVIEW,
      courses: [
        {
          slug: "x",
          subject: "s",
          role: "main" as const,
          name: "x",
          total: 0,
          done: 0,
          end: null,
          next: null,
          lessons: [],
        },
      ],
    };
    expect(courseCards(empty, "2026-11-06")[0]).toMatchObject({
      mark: "now",
      percent: 0,
      end: null,
      next: null,
    });
  });
});

describe("calendar cells", () => {
  it("cellTag: lesson name, then recovery, then the day type", () => {
    expect(cellTag(MONTH, "2026-12-21")).toBe("离散");
    expect(cellTag(MONTH, "2026-12-22")).toBe("范式");
    expect(cellTag(MONTH, "2026-12-18")).toBe("整合");
    expect(cellTag(MONTH, "2026-12-19")).toBe("Anki");
    expect(cellTag(MONTH, "2026-12-20")).toBe("");
    expect(cellTag(MONTH, "2026-12-30")).toBe("恢复");
    expect(cellTag(MONTH, "2026-12-31")).toBe("");
    expect(cellTag(null, "2026-12-21")).toBe("");
  });
  it("cellReadingTag: a 低强度 day with reading due says 「读书」", () => {
    expect(cellReadingTag(MONTH, "2026-12-19", 1)).toBe("读书");
    expect(cellReadingTag(MONTH, "2026-12-19", 0)).toBeNull();
    expect(cellReadingTag(MONTH, "2026-12-21", 1)).toBeNull();
    expect(cellReadingTag(null, "2026-12-19", 1)).toBeNull();
    const withMain = { ...MONTH, lessons: { "2026-12-19": [{ course: "epp", id: "D15", content: "x" }] } };
    expect(cellReadingTag(withMain, "2026-12-19", 1)).toBeNull();
  });
  it("cellFlag marks a cycle's first and last day", () => {
    expect(cellFlag(MONTH, "2026-12-24")).toBe("C1 完");
    expect(cellFlag(MONTH, "2026-12-25")).toBe("C2 起");
    expect(cellFlag(MONTH, "2026-12-23")).toBeNull();
    expect(cellFlag(null, "2026-12-24")).toBeNull();
  });
  it("daySlotLine, dayLessons and legendNames", () => {
    expect(daySlotLine(MONTH, "2026-12-18")).toBe("C1 第 7 周 · 整合日");
    expect(daySlotLine(MONTH, "2026-12-24")).toBe("C1 第 7 周 · 主攻日 · C1 最后一天");
    expect(daySlotLine(MONTH, "2026-12-30")).toBe("恢复周 · 不排新课");
    expect(daySlotLine(MONTH, "2026-12-31")).toBeNull();
    expect(dayLessons(MONTH, "2026-12-21")).toEqual([
      { done: false, name: "离散", id: "D14", content: "组合数", aux: false },
    ]);
    expect(dayLessons(MONTH, "2026-12-22")).toEqual([]);
    expect(legendNames(MONTH)).toEqual(["离散", "CTM"]);
    expect(legendNames(null)).toEqual([]);
  });
});

describe("aux cells", () => {
  const AUX: CycleMonth = {
    ...MONTH,
    days: {
      ...MONTH.days,
      "2026-12-21": {
        cycle: "C1",
        week: 7,
        type: "深度",
        subject: "discrete-math",
        course: "epp",
        aux: "c-systems",
        auxCourse: "effc",
      },
    },
    lessons: {
      "2026-12-21": [
        { course: "effc", id: "D2", content: "指针" },
        { course: "epp", id: "D14", content: "组合数" },
      ],
    },
    names: { epp: "离散", ctm: "CTM", effc: "Effective C" },
    subjects: { "discrete-math": "离散", "programming-paradigms": "范式", "c-systems": "C" },
    roles: { epp: "main", ctm: "main", effc: "aux" },
  };
  it("the main tag skips aux lessons; the aux tag shows the aux course, else the aux subject", () => {
    expect(cellTag(AUX, "2026-12-21")).toBe("离散");
    expect(cellAuxTag(AUX, "2026-12-21")).toBe("Effective C");
    const noLesson = { ...AUX, lessons: {} };
    expect(cellAuxTag(noLesson, "2026-12-21")).toBe("C");
    expect(cellAuxTag(AUX, "2026-12-22")).toBe("");
    expect(cellAuxTag(null, "2026-12-21")).toBe("");
    expect(dayLessons(AUX, "2026-12-21").map((item) => item.aux)).toEqual([true, false]);
  });

  it("carries each lesson's done flag into the day's detail", () => {
    const month: CycleMonth = {
      ...AUX,
      lessons: {
        "2026-12-21": [
          { course: "epp", id: "D14", content: "组合数", done: true },
          { course: "effc", id: "D2", content: "指针" },
        ],
      },
    };
    expect(dayLessons(month, "2026-12-21")).toEqual([
      { name: "离散", id: "D14", content: "组合数", aux: false, done: true },
      { name: "Effective C", id: "D2", content: "指针", aux: true, done: false },
    ]);
  });
});

describe("auxRows and hasAux", () => {
  it("lists aux subjects with their course, or none", () => {
    const withAux: CycleOverview = {
      ...OVERVIEW,
      cycle: {
        ...OVERVIEW.cycle!,
        subjects: { ...OVERVIEW.cycle!.subjects, c: "C", ds: "数据结构" },
        auxSubjects: ["c", "ds"],
      },
      courses: [
        ...OVERVIEW.courses,
        {
          slug: "effc",
          subject: "c",
          role: "aux" as const,
          name: "Effective C",
          total: 7,
          done: 1,
          end: "2026-12-23",
          next: null,
          lessons: [],
        },
      ],
    };
    expect(auxRows(withAux)).toEqual([
      // 「Effective C」 已含科目短名「C」，只留课程名。
      {
        subject: "c",
        subjectName: "C",
        label: "Effective C",
        end: strings.plan.courseEnd("12-23", "aux"),
        course: { slug: "effc", name: "Effective C", done: 1, total: 7 },
      },
      { subject: "ds", subjectName: "数据结构", label: "数据结构", end: null, course: null },
    ]);
    expect(auxRows(OVERVIEW)).toEqual([]);
    expect(auxRows({ ...OVERVIEW, cycle: null })).toEqual([]);
  });
  it("hasAux", () => {
    expect(hasAux(MONTH)).toBe(false);
    expect(
      hasAux({
        ...MONTH,
        days: {
          "2026-12-21": {
            cycle: "C1",
            week: 7,
            type: "深度",
            subject: "x",
            course: null,
            aux: "c",
            auxCourse: null,
          },
        },
      }),
    ).toBe(true);
    expect(hasAux(null)).toBe(false);
  });
});

describe("auxRows labels and end dates", () => {
  it("shows the course name alone when it repeats or contains the subject's short name", () => {
    const same: CycleOverview = {
      ...OVERVIEW,
      cycle: { ...OVERVIEW.cycle!, subjects: { c: "C 语言", ds: "数据结构" }, auxSubjects: ["c", "ds"] },
      courses: [
        ...OVERVIEW.courses,
        {
          slug: "clang",
          subject: "c",
          role: "aux" as const,
          name: "C 语言",
          total: 14,
          done: 0,
          end: "2026-12-18",
          next: null,
          lessons: [],
        },
        {
          slug: "dsa",
          subject: "ds",
          role: "aux" as const,
          name: "数据结构",
          total: 14,
          done: 0,
          end: "2026-12-20",
          next: null,
          lessons: [],
        },
      ],
    };
    expect(auxRows(same).map((row) => row.label)).toEqual(["C 语言", "数据结构"]);
    // 「C」 短名被课程名「C 语言」包含时也只留课程名。
    const contained: CycleOverview = {
      ...same,
      cycle: { ...same.cycle!, subjects: { c: "C" }, auxSubjects: ["c"] },
      courses: same.courses.filter((course) => course.slug === "clang"),
    };
    expect(auxRows(contained).map((row) => row.label)).toEqual(["C 语言"]);
  });

  it("adds 「预计 MM-DD 学完」 from the course's last lesson, and nothing without a date", () => {
    const withEnd: CycleOverview = {
      ...OVERVIEW,
      cycle: { ...OVERVIEW.cycle!, subjects: { c: "C" }, auxSubjects: ["c", "ds"] },
      courses: [
        ...OVERVIEW.courses,
        {
          slug: "clang",
          subject: "c",
          role: "aux" as const,
          name: "C 语言",
          total: 14,
          done: 3,
          end: "2026-12-28",
          next: null,
          lessons: [],
        },
      ],
    };
    const rows = auxRows(withEnd);
    expect(rows[0]?.end).toBe(strings.plan.courseEnd("12-28", "aux"));
    expect(rows[1]).toMatchObject({ subject: "ds", end: null, course: null });
  });
});

describe("subjectDaysLine", () => {
  it("joins the subject's days", () => {
    expect(subjectDaysLine(OVERVIEW, "discrete-math")).toBe("周一 · 周三");
    expect(subjectDaysLine(OVERVIEW, "nope")).toBe("");
    expect(subjectDaysLine({ ...OVERVIEW, cycle: null }, "discrete-math")).toBe("");
  });
});

describe("cyclePlacement", () => {
  it("takes the cycle id, the subject's days and the cycle's end; null outside a cycle", () => {
    expect(cyclePlacement(OVERVIEW, "discrete-math", "离散数学", "main")).toEqual({
      cycle: "C1",
      subject: "discrete-math",
      subjectName: "离散数学",
      role: "main",
      days: ["周一", "周三"],
      end: "2026-12-24",
    });
    expect(cyclePlacement({ ...OVERVIEW, cycle: null }, "discrete-math", "离散数学", "main")).toBeNull();
  });
});
