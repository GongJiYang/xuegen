// buildWeek / buildDay / buildMonth 的测试：夹具照 2026-11-11 的真实库造
// （C1 周模板周五起，离散 / CTM 主项，C 语言 / 数据结构带读，Epp 自读）。
import { describe, expect, it } from "vitest";
import type {
  AnkiStatus,
  CalendarDay,
  CalendarMonth,
  CourseSummary,
  CycleDayType,
  CycleMonth,
  CycleOverview,
  CycleSlot,
  ShelfListItem,
} from "@shared/data-protocol.js";
import {
  buildDay,
  buildMonth,
  buildWeek,
  planWeekRange,
  type PlanDay,
  type PlanItem,
  type PlanbookInput,
} from "./planbook.js";
import { strings } from "../strings.js";

const TODAY = "2026-11-11";
/** The suffix a missed self-reading row carries (mirrors `strings.planbook.selfMissed`). */
const MISSED = strings.planbook.selfMissed;

function slot(
  type: CycleDayType,
  subject: string | null = null,
  aux: string | null = null,
  week = 1,
): CycleSlot {
  return { cycle: "C1", week, type, subject, course: null, aux, auxCourse: null };
}

function calDay(readingDue: { slug: string; title: string }[] = []): CalendarDay {
  return { records: [], plans: [], readingDue, log: [], note: null };
}

const NAMES = { "discrete-math": "离散", ctm: "CTM", "c-language": "C 语言", "data-structures": "数据结构" };
const ROLES = {
  "discrete-math": "main",
  ctm: "main",
  "c-language": "aux",
  "data-structures": "aux",
} as const;
const C1 = { cycle: "C1", start: "2026-11-06", end: "2026-12-24" };

const NOV: CycleMonth = {
  month: "2026-11",
  days: {
    "2026-11-06": slot("整合"),
    "2026-11-07": slot("低强度"),
    "2026-11-08": slot("休息"),
    "2026-11-09": slot("深度", "discrete-math"),
    "2026-11-10": slot("深度", "ctm"),
    "2026-11-11": slot("深度", "discrete-math", "c-language"),
    "2026-11-12": slot("深度", "ctm", "data-structures"),
    // 下一周的整合日：本周复盘写在这天（见 buildWeek 的 reviewDate）。
    "2026-11-13": slot("整合"),
  },
  lessons: {
    "2026-11-07": [{ course: "discrete-math", id: "D1", content: "Ch1 记号", done: true }],
    "2026-11-09": [{ course: "discrete-math", id: "D2", content: "Ch2 真值表", done: true }],
    "2026-11-11": [
      { course: "discrete-math", id: "D3", content: "Ch2 有效论证", done: true },
      { course: "c-language", id: "D1", content: "Ch1 起步" },
    ],
    "2026-11-12": [
      { course: "ctm", id: "D1", content: "概念与模型" },
      { course: "data-structures", id: "D1", content: "§1.1–1.2 数组" },
    ],
  },
  names: NAMES,
  subjects: { "discrete-math": "离散", ctm: "CTM", "c-language": "C 语言", "data-structures": "数据结构" },
  roles: { ...ROLES },
  cycles: [C1],
  recovery: [],
};

const CAL_NOV: CalendarMonth = {
  month: "2026-11",
  days: {
    "2026-11-10": calDay([{ slug: "discrete-math#讲后读-1", title: "讲后读 · Ch2 §2.1 · 离散" }]),
    "2026-11-12": calDay([
      { slug: "discrete-math#讲后读-2", title: "讲后读 · Ch2 §2.2 · 离散" },
      { slug: "ctm#讲后读-1", title: "讲后读 · Ch1 §1.3 · CTM" },
      // 不是「#讲后读-」的阅读到期项不进讲后读行。
      { slug: "article-x", title: "某篇文章" },
    ]),
  },
};

// 自读的 schedule 是 `bookshelf.mjs list --from/--to` 按新排期规则给出的行：
// Epp 11-09 起、一段没读，今天（11-11）按顺延后的排期是第 1 段；11-09、11-10 的原定日
// 留着标 missed（同一段还会在顺延后那天再出现一行，设计稿 `plan2.jsx` 就是这样）。
const SHELF: ShelfListItem[] = [
  {
    slug: "epp",
    title: "Discrete Mathematics with Applications",
    short: "Epp",
    slot: "planned",
    order: 1,
    status: "reading",
    total: 7,
    position: 0,
    started: "2026-11-09",
    end: "2026-11-15",
    target: null,
    targetLate: null,
    extracts: [],
    coreRead: [],
    upcoming: [],
    schedule: [
      { index: 1, date: "2026-11-09", title: "Ch1", from: 1, to: 9, done: false, missed: true },
      { index: 2, date: "2026-11-10", title: "Ch1", from: 10, to: 18, done: false, missed: true },
      { index: 1, date: "2026-11-11", title: "Ch1", from: 1, to: 9, done: false },
      { index: 2, date: "2026-11-12", title: "Ch1", from: 10, to: 18, done: false },
    ],
  },
];

const COURSES: CourseSummary[] = [
  {
    slug: "discrete-math",
    title: "离散数学",
    weekLabel: "W1",
    week: {
      done: 3,
      total: 4,
      tasks: [
        { label: "周核实：真值表与有效论证（本周免做）", done: false },
        { label: "Ch2 习题 1–5", done: true },
      ],
    },
    overall: { done: 3, total: 15 },
    lastRecord: null,
    nextSession: null,
    styleHint: null,
  },
  {
    slug: "ctm",
    title: "CTM",
    weekLabel: "W1",
    week: { done: 0, total: 3, tasks: [{ label: "周核实：能独立画出声明式模型的图", done: false }] },
    overall: { done: 0, total: 14 },
    lastRecord: null,
    nextSession: null,
    styleHint: null,
  },
];

const OVERVIEW: CycleOverview = {
  date: TODAY,
  route: null,
  cycle: {
    cycle: "C1",
    title: "离散数学 + CTM",
    start: "2026-11-06",
    end: "2026-12-24",
    plannedEnd: "2026-12-24",
    delayDays: 0,
    week: 1,
    weeks: 7,
    daysLeft: 44,
    next: null,
    subjects: { "discrete-math": "离散", ctm: "CTM", "c-language": "C 语言", "data-structures": "数据结构" },
    auxSubjects: ["c-language", "data-structures"],
    subjectDays: {},
  },
  courses: [
    {
      slug: "discrete-math",
      subject: "discrete-math",
      role: "main",
      name: "离散",
      total: 15,
      done: 3,
      end: null,
      next: null,
      lessons: [],
    },
    {
      slug: "ctm",
      subject: "ctm",
      role: "main",
      name: "CTM",
      total: 14,
      done: 0,
      end: null,
      next: null,
      lessons: [],
    },
    {
      slug: "c-language",
      subject: "c-language",
      role: "aux",
      name: "C 语言",
      total: 10,
      done: 0,
      end: null,
      next: null,
      lessons: [],
    },
    {
      slug: "data-structures",
      subject: "data-structures",
      role: "aux",
      name: "数据结构",
      total: 10,
      done: 0,
      end: null,
      next: null,
      lessons: [],
    },
  ],
};

const ANKI: AnkiStatus = { running: true, due: [{ deck: "离散", count: 42 }] };

function input(overrides: Partial<PlanbookInput> = {}): PlanbookInput {
  return {
    today: TODAY,
    cycleMonths: [NOV],
    calendarMonths: [CAL_NOV],
    shelf: SHELF,
    overview: OVERVIEW,
    courses: COURSES,
    anki: ANKI,
    ...overrides,
  };
}

function dayOf(week: { days: PlanDay[] }, date: string): PlanDay {
  const found = week.days.find((day) => day.date === date);
  if (found === undefined) throw new Error(`fixture week has no ${date}`);
  return found;
}

function laneItems(day: PlanDay, lane: PlanItem["lane"]): PlanItem[] {
  return day.items.filter((item) => item.lane === lane);
}

describe("buildWeek", () => {
  it("周范围是周期周（C1 周五起）：2026-11-06…11-12", () => {
    const week = buildWeek(input());
    expect(week.cycle).toBe("C1");
    expect(week.week).toBe(1);
    expect(week.start).toBe("2026-11-06");
    expect(week.end).toBe("2026-11-12");
    expect(week.days.map((day) => day.date)).toEqual([
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
    expect(week.days[0]?.weekday).toBe("周五");
    expect(week.days[6]?.weekday).toBe("周四");
    expect(dayOf(week, "2026-11-11").isToday).toBe(true);
    expect(dayOf(week, "2026-11-10").isToday).toBe(false);
    expect(dayOf(week, "2026-11-11").type).toBe("深度");
    expect(dayOf(week, "2026-11-08").type).toBe("休息");
  });

  it("主项 / 带读：text 与 mark 按课次完成情况和日期", () => {
    const week = buildWeek(input());
    const main = laneItems(dayOf(week, "2026-11-11"), "main");
    expect(main).toEqual([
      {
        lane: "main",
        text: "离散 D3 · Ch2 有效论证",
        short: "离散 D3",
        mark: "done",
        slug: "discrete-math",
        id: "D3",
      },
    ]);
    const guide = laneItems(dayOf(week, "2026-11-11"), "guide");
    // 带读 text 不加前缀，lane 已表达；今天只有主项课是 ●。
    expect(guide).toEqual([
      {
        lane: "guide",
        text: "C 语言 D1 · Ch1 起步",
        short: "C 语言 D1",
        mark: "plan",
        slug: "c-language",
        id: "D1",
      },
    ]);
    expect(laneItems(dayOf(week, "2026-11-12"), "main")[0]).toMatchObject({
      text: "CTM D1 · 概念与模型",
      mark: "plan",
    });
    expect(laneItems(dayOf(week, "2026-11-12"), "guide")[0]).toMatchObject({
      text: "数据结构 D1 · §1.1–1.2 数组",
      mark: "plan",
    });
    expect(laneItems(dayOf(week, "2026-11-07"), "main")[0]).toMatchObject({ mark: "done" });
    expect(laneItems(dayOf(week, "2026-11-09"), "main")[0]).toMatchObject({ mark: "done" });
  });

  it("讲后读：只有 slug 含 #讲后读- 的项进 after 行，去掉标题前缀", () => {
    const week = buildWeek(input());
    const tenth = laneItems(dayOf(week, "2026-11-10"), "after");
    expect(tenth).toEqual([
      { lane: "after", text: "Ch2 §2.1 · 离散", short: "离散 Ch2 §2.1", mark: "warn", slug: "discrete-math", id: null },
    ]);
    const twelfth = laneItems(dayOf(week, "2026-11-12"), "after");
    expect(twelfth.map((item) => item.text)).toEqual(["Ch2 §2.2 · 离散", "Ch1 §1.3 · CTM"]);
    expect(twelfth.map((item) => item.mark)).toEqual(["plan", "plan"]);
    // 「某篇文章」不是讲后读，不出现。
    expect(twelfth.some((item) => item.text.includes("某篇文章"))).toBe(false);
  });

  it("自读：过去没读的原定日标 warn 并说明顺到明天，今天是顺延后的段", () => {
    const week = buildWeek(input());
    // 11-09、11-10 是原定日、没读 → 「没读，顺到明天」。
    expect(laneItems(dayOf(week, "2026-11-09"), "self")).toEqual([
      { lane: "self", text: "Epp Ch1 pp.1–9" + MISSED, short: "Epp pp.1–9", mark: "warn", slug: "epp", id: null },
    ]);
    expect(laneItems(dayOf(week, "2026-11-10"), "self")[0]).toEqual({
      lane: "self",
      text: "Epp Ch1 pp.10–18" + MISSED,
      short: "Epp pp.10–18",
      mark: "warn",
      slug: "epp",
      id: null,
    });
    // 今天（11-11）是顺延后的第 1 段，不是原定 11-11 的第 3 段。
    expect(laneItems(dayOf(week, "2026-11-11"), "self")[0]).toEqual({
      lane: "self",
      text: "Epp Ch1 pp.1–9",
      short: "Epp pp.1–9",
      // 今天只有主项课是 ●；自读是 ○。
      mark: "plan",
      slug: "epp",
      id: null,
    });
    expect(laneItems(dayOf(week, "2026-11-12"), "self")[0]).toMatchObject({
      text: "Epp Ch1 pp.10–18",
      mark: "plan",
    });
    // 已读的段是 done，不受日期影响。
    const read = input({
      shelf: [
        {
          ...SHELF[0]!,
          position: 3,
          schedule: [
            { index: 1, date: "2026-11-09", title: "Ch1", from: 1, to: 9, done: true },
            { index: 2, date: "2026-11-10", title: "Ch1", from: 10, to: 18, done: true },
            { index: 3, date: "2026-11-11", title: "Ch1", from: 19, to: 27, done: true },
          ],
        },
      ],
    });
    expect(laneItems(dayOf(buildWeek(read), "2026-11-09"), "self")[0]?.mark).toBe("done");
  });

  it("自读：今天 11-12、Epp 11-09 起一段没读 → 今天读第 1 段（§1.1–1.4）", () => {
    const shelf: ShelfListItem[] = [
      {
        ...SHELF[0]!,
        schedule: [
          { index: 1, date: "2026-11-09", title: "§1.1–1.4", from: 1, to: 9, done: false, missed: true },
          { index: 2, date: "2026-11-10", title: "§1.1–1.4", from: 10, to: 18, done: false, missed: true },
          { index: 3, date: "2026-11-11", title: "§1.1–1.4", from: 19, to: 27, done: false, missed: true },
          { index: 1, date: "2026-11-12", title: "§1.1–1.4", from: 1, to: 9, done: false },
          { index: 2, date: "2026-11-13", title: "§1.1–1.4", from: 10, to: 18, done: false },
        ],
      },
    ];
    const today = input({ today: "2026-11-12", shelf });
    const self = laneItems(buildDay(today, "2026-11-12"), "self");
    expect(self).toEqual([
      { lane: "self", text: "Epp §1.1–1.4 pp.1–9", short: "Epp pp.1–9", mark: "plan", slug: "epp", id: null },
    ]);
    const week = buildWeek(today);
    // 周视图里 11-12 的自读行就是这一段。
    expect(laneItems(dayOf(week, "2026-11-12"), "self")[0]?.text).toContain("§1.1–1.4");
    // 三个没读的原定日各一行 missed（warn），同一段在后面还各有一行。
    for (const date of ["2026-11-09", "2026-11-10", "2026-11-11"]) {
      expect(laneItems(dayOf(week, date), "self").map((item) => item.mark)).toEqual(["warn"]);
    }
    // 11-13 是下一周，用 buildDay 看那天（同逐天逻辑）。
    expect(laneItems(buildDay(today, "2026-11-13"), "self")[0]).toMatchObject({
      text: "Epp §1.1–1.4 pp.10–18",
      mark: "plan",
    });
  });

  it("今天只有主项课是 ●（now）；讲后读 / 带读 / 自读都是 ○（plan）", () => {
    const today = input({
      cycleMonths: [
        {
          ...NOV,
          // 今天的主项课还没上（done 缺省）→ ●；带读也在今天。
          lessons: {
            ...NOV.lessons,
            "2026-11-11": [
              { course: "discrete-math", id: "D3", content: "Ch2 有效论证" },
              { course: "c-language", id: "D1", content: "Ch1 起步" },
            ],
          },
        },
      ],
      calendarMonths: [
        {
          ...CAL_NOV,
          days: {
            ...CAL_NOV.days,
            "2026-11-11": calDay([{ slug: "discrete-math#讲后读-3", title: "讲后读 · Ch2 §2.3 · 离散" }]),
          },
        },
      ],
    });
    const day = dayOf(buildWeek(today), "2026-11-11");
    expect(laneItems(day, "main").map((item) => item.mark)).toEqual(["now"]);
    expect(laneItems(day, "after").map((item) => item.mark)).toEqual(["plan"]);
    expect(laneItems(day, "guide").map((item) => item.mark)).toEqual(["plan"]);
    expect(laneItems(day, "self").map((item) => item.mark)).toEqual(["plan"]);
    // 日视图与月视图用的是同一份逐天逻辑：今天的主项课也是 now。
    expect(laneItems(buildDay(today, "2026-11-11"), "main").map((item) => item.mark)).toEqual(["now"]);
    expect(laneItems(buildDay(today, "2026-11-11"), "guide").map((item) => item.mark)).toEqual(["plan"]);
  });

  it("Anki 只有今天有数；没开 / 没数据都是 null", () => {
    const week = buildWeek(input());
    expect(dayOf(week, "2026-11-11").ankiDue).toBe(42);
    for (const day of week.days.filter((d) => d.date !== "2026-11-11")) {
      expect(day.ankiDue).toBeNull();
    }
    expect(dayOf(buildWeek(input({ anki: null })), "2026-11-11").ankiDue).toBeNull();
    expect(dayOf(buildWeek(input({ anki: { running: false } })), "2026-11-11").ankiDue).toBeNull();
  });

  it("items 顺序：主项 → 讲后读 → 带读 → 自读", () => {
    const week = buildWeek(input());
    expect(dayOf(week, "2026-11-12").items.map((item) => item.lane)).toEqual([
      "main",
      "after",
      "after",
      "guide",
      "self",
    ]);
  });

  it("本周目标：主项课里 label 含「周核实」的周任务，带课程短名", () => {
    const week = buildWeek(input());
    expect(week.goals).toEqual([
      { course: "discrete-math", name: "离散", label: "周核实：真值表与有效论证（本周免做）", done: false },
      { course: "ctm", name: "CTM", label: "周核实：能独立画出声明式模型的图", done: false },
    ]);
    // 带读课的任务不算（c-language 不在 courses 里也一样）。
  });

  it("周复盘日期：本周结束后的那个整合日（W1 → 11-13）", () => {
    const week = buildWeek(input());
    expect(week.end).toBe("2026-11-12");
    expect(week.reviewDate).toBe("2026-11-13");
  });

  it("周复盘日期：本周后 7 天里没有整合日就是 null", () => {
    const noIntegration: CycleMonth = {
      ...NOV,
      days: Object.fromEntries(Object.entries(NOV.days).filter(([date]) => date !== "2026-11-13")),
    };
    expect(buildWeek(input({ cycleMonths: [noIntegration] })).reviewDate).toBeNull();
    // 也不看本周内的整合日（11-06 是本周期第一个整合日）。
    expect(buildWeek(input({ today: "2026-11-07" })).reviewDate).toBe("2026-11-13");
  });

  it("没学合并：date < today 且没 done 的课次按课程合并", () => {
    const missed = input({
      cycleMonths: [
        {
          ...NOV,
          lessons: {
            ...NOV.lessons,
            // 离散 D1、D2 都没学 → 离散 2 节；11-11 的 D3 已完成不算。
            "2026-11-07": [{ course: "discrete-math", id: "D1", content: "Ch1 记号" }],
            "2026-11-09": [{ course: "discrete-math", id: "D2", content: "Ch2 真值表" }],
          },
        },
      ],
    });
    const week = buildWeek(missed);
    expect(week.overdue).toEqual([{ course: "discrete-math", name: "离散", count: 2 }]);
    expect(laneItems(dayOf(week, "2026-11-09"), "main")[0]?.mark).toBe("warn");
  });

  it("基准夹具没有没学的课 → overdue 为空", () => {
    expect(buildWeek(input()).overdue).toEqual([]);
  });
});

describe("planWeekRange", () => {
  it("跨月的周期周：11-27…12-03 由两个 CycleMonth 拼出", () => {
    const novLate: CycleMonth = {
      ...NOV,
      days: {
        "2026-11-27": slot("整合", null, null, 4),
        "2026-11-28": slot("低强度", null, null, 4),
        "2026-11-29": slot("休息", null, null, 4),
        "2026-11-30": slot("深度", "discrete-math", null, 4),
      },
      lessons: { "2026-11-30": [{ course: "discrete-math", id: "D9", content: "Ch4 归纳" }] },
    };
    const dec: CycleMonth = {
      month: "2026-12",
      days: {
        "2026-12-01": slot("深度", "ctm", null, 4),
        "2026-12-02": slot("深度", "discrete-math", null, 4),
        "2026-12-03": slot("深度", "ctm", null, 4),
      },
      lessons: { "2026-12-01": [{ course: "ctm", id: "D7", content: "Ch4 惰性" }] },
      names: NAMES,
      subjects: NOV.subjects,
      roles: { ...ROLES },
      cycles: [C1],
      recovery: [],
    };
    const week = buildWeek(
      input({ today: "2026-11-30", cycleMonths: [novLate, dec], calendarMonths: [], shelf: [] }),
    );
    expect(week.start).toBe("2026-11-27");
    expect(week.end).toBe("2026-12-03");
    expect(week.week).toBe(4);
    // 两个月各管各的天；两边各自的课次都进了 days。
    expect(dayOf(week, "2026-11-30").type).toBe("深度");
    expect(dayOf(week, "2026-12-01").type).toBe("深度");
    expect(laneItems(dayOf(week, "2026-11-30"), "main")[0]?.text).toBe("离散 D9 · Ch4 归纳");
    expect(laneItems(dayOf(week, "2026-12-01"), "main")[0]?.text).toBe("CTM D7 · Ch4 惰性");
  });

  it("不在周期内的日期退回周一到周日", () => {
    // 2027-01-05 是周二，不在任何周期里。
    const range = planWeekRange([NOV], "2027-01-05");
    expect(range).toEqual({ start: "2027-01-04", end: "2027-01-10", cycle: null, week: null });
    const week = buildWeek(input({ today: "2027-01-05" }));
    expect(week.start).toBe("2027-01-04");
    expect(week.days[0]?.weekday).toBe("周一");
    for (const day of week.days) expect(day.type).toBeNull();
  });

  it("anchor 可以指定不是今天的另一周", () => {
    const range = planWeekRange([NOV], "2026-11-09");
    expect(range.start).toBe("2026-11-06");
  });
});

describe("buildDay", () => {
  it("返回那一天的 PlanDay（同 buildWeek 的逐天逻辑）", () => {
    const day = buildDay(input(), "2026-11-10");
    expect(day.date).toBe("2026-11-10");
    expect(day.weekday).toBe("周二");
    expect(day.type).toBe("深度");
    expect(day.isToday).toBe(false);
    expect(day.items.map((item) => item.lane)).toEqual(["after", "self"]);
    expect(day.ankiDue).toBeNull();
    const today = buildDay(input(), "2026-11-11");
    expect(today.isToday).toBe(true);
    expect(today.ankiDue).toBe(42);
  });
});

describe("buildMonth", () => {
  it("每格只写课程短名 + 课次（`short`）", () => {
    const days = buildMonth(input(), "2026-11");
    const eleventh = days.find((day) => day.date === "2026-11-11");
    expect(eleventh?.items.map((item) => item.short)).toEqual(["离散 D3", "C 语言 D1"]);
    const twelfth = days.find((day) => day.date === "2026-11-12");
    expect(twelfth?.items.map((item) => item.short)).toEqual(["CTM D1", "数据结构 D1"]);
    // 没课的日子没有 short 可言；自读 / 讲后读一律空串（它们不进月视图）。
    for (const day of days) {
      for (const item of day.items) expect(item.short).not.toContain("·");
      expect(
        day.items.every((item) => item.short === "" || item.short === `${item.text.split(" · ")[0]}`),
      ).toBe(true);
    }
    expect(buildMonth(input(), "2026-11").find((day) => day.date === "2026-11-06")?.items).toEqual([]);
  });

  it("返回该月每天的 PlanDay；只留 main / guide 两行", () => {
    const days = buildMonth(input(), "2026-11");
    expect(days).toHaveLength(30);
    expect(days[0]?.date).toBe("2026-11-01");
    const eleventh = days.find((day) => day.date === "2026-11-11");
    expect(eleventh?.items.map((item) => item.lane)).toEqual(["main", "guide"]);
    expect(eleventh?.isToday).toBe(true);
    expect(eleventh?.ankiDue).toBe(42);
    // 自读与讲后读不进月视图。
    for (const day of days) {
      expect(day.items.every((item) => item.lane === "main" || item.lane === "guide")).toBe(true);
    }
  });
});
