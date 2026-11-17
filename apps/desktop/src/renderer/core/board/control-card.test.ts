import { describe, expect, it } from "vitest";
import type { CalendarMonth, CourseSummary, CycleDay, ShelfBook, ShelfToday } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import {
  controlCard,
  parsePageInput,
  withExtractCount,
  withPendingRead,
  withPendingShelf,
  type ControlCardView,
} from "./control-card.js";

const TODAY = "2026-11-11";

function day(overrides: Partial<CycleDay>): CycleDay {
  return {
    date: TODAY,
    weekday: "周三",
    cycle: "C1",
    week: 1,
    type: "深度",
    subject: "discrete-math",
    course: "discrete-math-epp",
    aux: null,
    auxCourse: null,
    auxBook: null,
    names: { "discrete-math-epp": "离散", ctm: "CTM", "effective-c": "Effective C" },
    subjects: {},
    roles: { "discrete-math-epp": "main", ctm: "main", "effective-c": "aux" },
    lessons: [],
    overdue: [],
    ...overrides,
  };
}

function month(days: CalendarMonth["days"]): CalendarMonth {
  return { month: "2026-11", days };
}

const EMPTY_MONTH = month({});

/** A course whose week holds one 「周核实」 task, checked or not. */
function courseSummary(slug: string, verified: boolean): CourseSummary {
  return {
    slug,
    title: slug,
    weekLabel: "第 1 周",
    week: { done: verified ? 1 : 0, total: 2, tasks: [{ label: "周核实", done: verified }] },
    overall: { done: 0, total: 10 },
    lastRecord: null,
    nextSession: null,
    styleHint: null,
    archived: false,
    archivedOn: null,
  };
}

describe("controlCard", () => {
  it("returns null outside every cycle or without a day", () => {
    expect(controlCard({ today: TODAY, day: null, calendar: EMPTY_MONTH, queue: [] })).toBeNull();
    expect(
      controlCard({
        today: TODAY,
        day: day({ cycle: null, week: null, type: null }),
        calendar: EMPTY_MONTH,
        queue: [],
      }),
    ).toBeNull();
  });

  it("rest day with no lessons: one faint line, no Anki", () => {
    const view = controlCard({
      today: TODAY,
      day: day({ type: "休息", weekday: "周日" }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    expect(view?.headline).toBe("C1 · 第 1 周 · 周日 · 休息日");
    expect(view?.rows).toEqual([
      { mark: "faint", text: strings.plan.restItem, button: null, action: null, hint: null },
    ]);
  });

  it("deep day: main lessons (aux produces no row), overdue, 讲后读, Anki — in that order", () => {
    const calendar = month({
      "2026-11-10": {
        records: [],
        plans: [],
        readingDue: [{ slug: "ctm#讲后读-t-1", title: "讲后读 · Ch2 §2.2 · CTM", book: "t", index: 1 }],
        log: [],
        note: null,
      },
      "2026-11-11": {
        records: [],
        plans: [],
        readingDue: [
          {
            slug: "discrete-math-epp#讲后读-epp-2",
            title: "讲后读 · §1.1–1.4 · 离散数学（Epp, 5th ed）",
            book: "epp",
            index: 2,
          },
        ],
        log: [],
        note: null,
      },
      "2026-11-12": {
        records: [],
        plans: [],
        readingDue: [{ slug: "ctm#讲后读-t-3", title: "讲后读 · Ch3 · CTM", book: "t", index: 3 }],
        log: [],
        note: null,
      },
    });
    const view = controlCard({
      today: TODAY,
      day: day({
        lessons: [
          { course: "discrete-math-epp", id: "D3", content: "Ch2 §2.3：有效论证" },
          { course: "effective-c", id: "D1", content: "Ch1 起步" },
        ],
        overdue: [{ course: "ctm", id: "D1", date: "2026-11-10", content: "Ch1" }],
      }),
      calendar,
      queue: [],
    });
    // Panel v2: nothing is a yellow warning any more — a lesson not taken on its
    // day and an overdue 课后读 are plain ○ rows with a grey 「原排 …」 sub.
    // 导读课改书房导读后 the aux 课次 (effective-c) produces no 上课 row.
    expect(view?.rows.map((row) => row.mark)).toEqual(["now", "plan", "plan", "plan", "plan"]);
    expect(view?.rows.map((row) => row.group)).toEqual(["lesson", "lesson", "read", "read", "review"]);
    expect(view?.rows[0]?.text).toBe("离散 D3 · Ch2 §2.3：有效论证");
    expect(view?.rows.some((row) => row.text.includes("Effective C"))).toBe(false);
    expect(view?.rows[1]?.text).toBe(strings.control.card.missedRow("CTM", "D1", "Ch1"));
    expect(view?.rows[1]?.sub).toBe(strings.control.card.missedSub("2026-11-10"));
    // The overdue 课后读 sorts before today's, flagged with its due date.
    expect(view?.rows[2]?.text).toBe("课后读 · CTM Ch2 §2.2");
    expect(view?.rows[2]?.sub).toBe(strings.control.card.missedSub("2026-11-10"));
    expect(view?.rows[3]?.text).toBe("课后读 · 离散 §1.1–1.4");
    expect(view?.rows[3]?.sub).toBeNull();
    expect(view?.rows[4]?.text).toBe("Anki");
    expect(view?.rows[2]?.action).toEqual({
      kind: "afterRead",
      slug: "ctm",
      entries: [{ book: "t", index: 1 }],
    });
    expect(view?.rows[3]?.action).toEqual({
      kind: "afterRead",
      slug: "discrete-math-epp",
      entries: [{ book: "epp", index: 2 }],
    });
    expect(view?.rows[4]?.action).toEqual({ kind: "anki" });
  });

  it("a done main lesson: ✓ mark and the 回到这节课 → button; the rest stay as they are", () => {
    const view = controlCard({
      today: TODAY,
      day: day({
        lessons: [
          { course: "discrete-math-epp", id: "D3", content: "Ch2 §2.3：有效论证", done: true },
          { course: "effective-c", id: "D1", content: "Ch1 起步", done: true },
        ],
        overdue: [{ course: "ctm", id: "D1", date: "2026-11-10", content: "Ch1" }],
      }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    expect(view?.rows.slice(0, 1)).toEqual([
      {
        group: "lesson",
        mark: "done",
        text: "离散 D3 · Ch2 §2.3：有效论证",
        button: strings.control.card.backToLesson,
        action: { kind: "study", slug: "discrete-math-epp" },
        hint: strings.control.card.studyHint,
      },
    ]);
    // The aux 课次 (effective-c, already done) produces no row either.
    expect(view?.rows.some((row) => row.text.includes("Effective C"))).toBe(false);
    // 过期课次不受影响：普通 ○ + 开课 →，只多一行灰字「原排 …」。
    expect(view?.rows[1]).toEqual({
      group: "lesson",
      missed: true,
      lessons: [{ slug: "ctm", name: "CTM", id: "D1", content: "Ch1", date: "2026-11-10" }],
      mark: "plan",
      text: strings.control.card.missedRow("CTM", "D1", "Ch1"),
      sub: strings.control.card.missedSub("2026-11-10"),
      button: strings.control.card.study,
      action: { kind: "study", slug: "ctm" },
      hint: strings.control.card.studyHint,
    });
  });

  it("an undone (or old data without the flag) main lesson keeps ● + 开课 →", () => {
    const view = controlCard({
      today: TODAY,
      day: day({
        lessons: [
          { course: "discrete-math-epp", id: "D3", content: "Ch2 §2.3：有效论证", done: false },
          { course: "effective-c", id: "D1", content: "Ch1 起步" },
        ],
      }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    expect(view?.rows.slice(0, 1).map((row) => row.mark)).toEqual(["now"]);
    expect(view?.rows[0]?.button).toBe(strings.control.card.study);
    // The aux 课次 produces no row: the Anki row is next.
    expect(view?.rows[1]?.action?.kind).toBe("anki");
  });

  it("verify day, not started: ○ + 开始 →, one row per main course", () => {
    const view = controlCard({
      today: TODAY,
      day: day({ type: "整合", subject: null, course: null }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    expect(view?.rows.slice(0, 2)).toEqual([
      {
        group: "lesson",
        mark: "plan",
        text: "离散 · 周核实",
        sub: strings.control.card.verifySub,
        button: strings.control.card.verify,
        action: { kind: "verify", slug: "discrete-math-epp" },
        hint: strings.control.card.verifyHint,
      },
      {
        group: "lesson",
        mark: "plan",
        text: "CTM · 周核实",
        sub: strings.control.card.verifySub,
        button: strings.control.card.verify,
        action: { kind: "verify", slug: "ctm" },
        hint: strings.control.card.verifyHint,
      },
    ]);
  });

  it("verify day, started today but not checked off: ● + 回到核实 →", () => {
    // `verifiedOn` 是「slug → 那次周核实开始的日子」（`YYYY-MM-DD` 字符串）：今天开始过
    // 而课程页任务还没勾的读作进行中，按钮只回到那次核实。
    const started = controlCard({
      today: TODAY,
      day: day({ type: "整合", subject: null, course: null }),
      calendar: EMPTY_MONTH,
      queue: [],
      verifiedOn: { "discrete-math-epp": TODAY, ctm: "2026-11-04" },
    });
    expect(started?.rows[0]).toEqual({
      group: "lesson",
      mark: "now",
      text: "离散 · 周核实",
      sub: strings.control.card.verifyInProgress,
      button: strings.control.card.verifyBack,
      action: { kind: "verify", slug: "discrete-math-epp" },
      hint: strings.control.card.verifyHint,
    });
    // 上周开始的那门课还是 ○ 没开始。
    expect(started?.rows[1]?.mark).toBe("plan");
    expect(started?.rows[1]?.button).toBe(strings.control.card.verify);
  });

  it("verify day, course page task checked: ✓ + 已收课 + 回到会话 →", () => {
    // Done comes only from the course page's 「周核实」 week task — a verifiedOn
    // stamp alone does not finish the row.
    const courses = [
      courseSummary("discrete-math-epp", true),
      courseSummary("ctm", false),
    ];
    const view = controlCard({
      today: TODAY,
      day: day({ type: "整合", subject: null, course: null }),
      calendar: EMPTY_MONTH,
      queue: [],
      courses,
      verifiedOn: { "discrete-math-epp": TODAY, ctm: TODAY },
    });
    expect(view?.rows[0]).toEqual({
      group: "lesson",
      mark: "done",
      text: "离散 · 周核实",
      sub: strings.control.card.verifyDone,
      button: strings.control.card.verifyBackSession,
      action: { kind: "verify", slug: "discrete-math-epp" },
      hint: strings.control.card.verifyHint,
    });
    // ctm's task is unchecked even though it also started today: still 进行中.
    expect(view?.rows[1]?.mark).toBe("now");
    expect(view?.rows[1]?.sub).toBe(strings.control.card.verifyInProgress);
    expect(view?.rows[1]?.button).toBe(strings.control.card.verifyBack);
  });

  it("light day marks due reading as now; other days mark it plan", () => {
    const queue = [
      {
        slug: "jepa",
        title: "LeCun 论文",
        priority: "medium",
        due: "2026-11-11",
        position: "第 3 页",
        status: "active",
      },
      { slug: "later", title: "之后", priority: "low", due: "2026-11-20", position: "", status: "queued" },
      { slug: "unscheduled", title: "没排期", priority: "low", due: "", position: "", status: "queued" },
    ];
    const light = controlCard({
      today: TODAY,
      day: day({ type: "低强度", subject: null, course: null }),
      calendar: EMPTY_MONTH,
      queue,
    });
    expect(light?.rows[0]).toEqual({
      group: "read",
      mark: "now",
      text: "读书：LeCun 论文 · 从 第 3 页",
      button: strings.control.card.read,
      action: { kind: "read" },
      hint: null,
    });
    const deep = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue });
    expect(deep?.rows[0]?.mark).toBe("plan");
    // 未到期与没排期的不出现。
    expect(light?.rows.some((row) => row.text.includes("之后") || row.text.includes("没排期"))).toBe(false);
  });

  it("spells the Anki row with today's due count when Anki is running", () => {
    const running = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      anki: ANKI_RUNNING,
    });
    const ankiRow = running?.rows.find((row) => row.action?.kind === "anki");
    expect(ankiRow?.text).toBe("Anki · 今天 74 张");
    expect(ankiRow?.button).toBe(strings.control.card.anki);
  });

  it("keeps the Anki row plain when Anki is closed or was not read", () => {
    const closed = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      anki: ANKI_CLOSED,
    });
    expect(closed?.rows.find((row) => row.action?.kind === "anki")?.text).toBe("Anki");
    // Running with nothing due says so instead of falling back to the plain row.
    const nothing = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      anki: { running: true },
    });
    expect(nothing?.rows.find((row) => row.action?.kind === "anki")?.text).toBe("Anki · 今天 0 张");
    const unknown = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [] });
    expect(unknown?.rows.find((row) => row.action?.kind === "anki")?.text).toBe("Anki");
  });

  it("takes the 课后读 label from between 「讲后读 · 」 and 「 · 课名」, keeping the course name's parens", () => {
    const calendar = month({
      [TODAY]: {
        records: [],
        plans: [],
        readingDue: [
          {
            slug: "epp#讲后读-epp-1",
            title: "讲后读 · §1.1–1.4 · 离散数学（Epp, 5th ed）",
            book: "epp",
            index: 1,
          },
          { slug: "plain#讲后读-b-2", title: "讲后读 · 第 3 章 · 普通书名", book: "b", index: 2 },
        ],
        log: [],
        note: null,
      },
    });
    const view = controlCard({ today: TODAY, day: day({}), calendar, queue: [] });
    // 数据里仍写「讲后读」，给人看的是「课后读」。
    expect(view?.rows[0]?.text).toBe("课后读 · §1.1–1.4 · 离散数学（Epp, 5th ed）");
    expect(view?.rows[0]?.action).toEqual({
      kind: "afterRead",
      slug: "epp",
      entries: [{ book: "epp", index: 1 }],
    });
    expect(view?.rows[1]?.action).toEqual({
      kind: "afterRead",
      slug: "plain",
      entries: [{ book: "b", index: 2 }],
    });
  });

  it("merges one course's 课后读 into one row: ranges joined, 「原排 … 起」 from the earliest, one tick reads them all", () => {
    const due = (n: number, range: string) => ({
      slug: `discrete-math-epp#讲后读-epp-${n}`,
      title: `讲后读 · ${range} · 离散数学`,
      book: "epp",
      index: n,
    });
    const entry = (readingDue: { slug: string; title: string; book?: string; index?: number }[]) => ({
      records: [],
      plans: [],
      readingDue,
      log: [],
      note: null,
    });
    const calendar = month({
      "2026-11-09": entry([due(1, "§1.1–1.4")]),
      "2026-11-10": entry([due(2, "§2.1–2.2"), due(3, "§2.3")]),
      [TODAY]: entry([
        { slug: "ctm#讲后读-t-1", title: "讲后读 · Ch2 §2.2 · CTM", book: "t", index: 1 },
      ]),
    });
    const view = controlCard({ today: TODAY, day: day({}), calendar, queue: [] });
    const reads = view?.rows.filter((row) => row.action?.kind === "afterRead") ?? [];
    expect(reads.map((row) => row.text)).toEqual([
      "课后读 · 离散 §1.1–1.4、§2.1–2.2、§2.3",
      "课后读 · CTM Ch2 §2.2",
    ]);
    expect(reads[0]?.sub).toBe(strings.control.card.afterReadManySub("2026-11-09", 3));
    expect(reads[0]?.action).toEqual({
      kind: "afterRead",
      slug: "discrete-math-epp",
      entries: [
        { book: "epp", index: 1 },
        { book: "epp", index: 2 },
        { book: "epp", index: 3 },
      ],
    });
    expect(reads[1]?.sub).toBeNull();
  });

  it("a 讲后读 item without book/index produces no row (legacy title-only shape is dropped)", () => {
    const calendar = month({
      [TODAY]: {
        records: [],
        plans: [],
        readingDue: [{ slug: "epp#讲后读-1", title: "讲后读 §1.1–1.4 核心页（离散数学（Epp, 5th ed））" }],
        log: [],
        note: null,
      },
    });
    const view = controlCard({ today: TODAY, day: day({}), calendar, queue: [] });
    expect(view?.rows.some((row) => row.action?.kind === "afterRead")).toBe(false);
  });

  it("merges a course's missed lessons into one row: 1 节一行原样，3 节合并", () => {
    const view = controlCard({
      today: TODAY,
      day: day({
        overdue: [
          { course: "ctm", id: "D1", content: "Ch1", date: "2026-11-09" },
          { course: "ctm", id: "D2", content: "Ch2", date: "2026-11-10" },
          { course: "ctm", id: "D3", content: "Ch3", date: "2026-11-11" },
        ],
      }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    expect(view?.rows.slice(0, 1)).toEqual([
      {
        group: "lesson",
        missed: true,
        lessons: [
          { slug: "ctm", name: "CTM", id: "D1", content: "Ch1", date: "2026-11-09" },
          { slug: "ctm", name: "CTM", id: "D2", content: "Ch2", date: "2026-11-10" },
          { slug: "ctm", name: "CTM", id: "D3", content: "Ch3", date: "2026-11-11" },
        ],
        mark: "plan",
        text: strings.control.card.missedMany("CTM", "D1", 3),
        sub: strings.control.card.missedManySub("2026-11-09"),
        button: strings.control.card.study,
        action: { kind: "study", slug: "ctm" },
        hint: strings.control.card.studyHint,
      },
    ]);
    expect(view?.rows[0]?.text).toBe("CTM D1 起 3 节");
    expect(view?.rows[0]?.sub).toBe("原排 11-09 起 · 开课后后面的课次跟着挪");

    // 只有一节时仍是那一节本来的文字（带内容），下面只多一行「原排 …」。
    const one = controlCard({
      today: TODAY,
      day: day({ overdue: [{ course: "ctm", id: "D1", content: "Ch1", date: "2026-11-10" }] }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    expect(one?.rows[0]?.text).toBe(strings.control.card.missedRow("CTM", "D1", "Ch1"));
    expect(one?.rows[0]?.sub).toBe("原排 11-10");
  });

  it("two courses' missed lessons: one merged row each, earliest date first", () => {
    const view = controlCard({
      today: TODAY,
      day: day({
        overdue: [
          { course: "ctm", id: "D2", content: "Ch2", date: "2026-11-10" },
          { course: "discrete-math-epp", id: "D1", content: "Ch1", date: "2026-11-09" },
          { course: "ctm", id: "D1", content: "Ch1", date: "2026-11-09" },
          { course: "discrete-math-epp", id: "D0", content: "导言", date: "2026-11-08" },
        ],
      }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    expect(view?.rows.slice(0, 2).map((row) => row.text)).toEqual([
      strings.control.card.missedMany("离散", "D0", 2),
      strings.control.card.missedMany("CTM", "D1", 2),
    ]);
    expect(view?.rows.slice(0, 2).map((row) => row.sub)).toEqual([
      strings.control.card.missedManySub("2026-11-08"),
      strings.control.card.missedManySub("2026-11-09"),
    ]);
    expect(view?.rows.slice(0, 2).map((row) => row.mark)).toEqual(["plan", "plan"]);
    expect(view?.rows.slice(0, 2).map((row) => row.action)).toEqual([
      { kind: "study", slug: "discrete-math-epp" },
      { kind: "study", slug: "ctm" },
    ]);
  });
});

describe("withPendingRead", () => {
  const calendar = month({
    [TODAY]: {
      records: [],
      plans: [],
      readingDue: [
        { slug: "ctm#讲后读-t-1", title: "讲后读 · Ch2 §2.2 · CTM", book: "t", index: 1 },
      ],
      log: [],
      note: null,
    },
  });

  it("turns the matching 读完了 row into ✓ with a 撤销 button, leaving the rest", () => {
    const view = controlCard({ today: TODAY, day: day({}), calendar, queue: [] });
    if (view === null) throw new Error("sample inside a cycle");
    const shown = withPendingRead(view, {
      slug: "ctm",
      entries: [{ book: "t", index: 1 }],
      left: 7,
    });
    const row = shown.rows.find((entry) => entry.text === "课后读 · CTM Ch2 §2.2");
    // Panel v2: the ✓ row keeps its group, loses the 陪读 side action and shows 「已记下」.
    expect(row).toEqual({
      group: "read",
      mark: "done",
      text: "课后读 · CTM Ch2 §2.2",
      sub: strings.control.card.shelfPendingSub,
      side: null,
      button: strings.control.card.undo(7),
      action: { kind: "undoRead" },
      hint: null,
    });
    // The Anki row is untouched.
    expect(shown.rows.some((entry) => entry.action?.kind === "anki")).toBe(true);
  });

  it("leaves the view untouched with a null or unmatched pending", () => {
    const view = controlCard({ today: TODAY, day: day({}), calendar, queue: [] });
    if (view === null) throw new Error("sample inside a cycle");
    expect(withPendingRead(view, null)).toBe(view);
    expect(
      withPendingRead(view, { slug: "other", entries: [{ book: "t", index: 9 }], left: 3 }).rows,
    ).toEqual(view.rows);
  });
});

// ---- 书房行（shelfRows / controlCard 的 shelf 输入）----

/** One shelf book with the fields a row reads; overrides change the block state. */
function book(overrides: Partial<ShelfBook> = {}): ShelfBook {
  return {
    slug: "epp",
    title: "Discrete Mathematics with Applications",
    short: "Epp",
    slot: "planned",
    subject: null,
    days: null,
    limit: null,
    nextDay: null,
    total: 81,
    position: 1,
    chunk: { index: 2, title: "Ch1 §1.1–1.4", from: 10, to: 18 },
    coreOverlap: null,
    doneToday: false,
    doneChunk: null,
    resumedToday: false,
    plannedEnd: "2027-01-28",
    end: "2027-01-28",
    late: 0,
    afterReads: [],
    ...overrides,
  };
}

/** A 课后读 row due today, so the card has a row before the 书房 rows. */
const ANKI_RUNNING = {
  running: true,
  due: [
    { deck: "离散", count: 70 },
    { deck: "CTM", count: 4 },
  ],
};
const ANKI_CLOSED = { running: false };

const AFTER_READ_MONTH = month({
  [TODAY]: {
    records: [],
    plans: [],
    readingDue: [
      { slug: "ctm#讲后读-t-1", title: "讲后读 · Ch2 §2.2 · CTM", book: "t", index: 1 },
    ],
    log: [],
    note: null,
  },
});

const DUE_ITEM = {
  slug: "jepa",
  title: "LeCun 论文",
  priority: "medium" as const,
  due: TODAY,
  position: "",
  status: "active" as const,
};

/** One 导读书 due today, as `bookshelf today --json`'s `guided` reports it. */
function guidedBook(overrides: Partial<ShelfBook> = {}): ShelfBook {
  return book({
    slug: "algs",
    title: "Algorithms, 4th Edition",
    short: "算法",
    slot: "guided",
    subject: "data-structures",
    days: "tue,thu",
    limit: 20,
    nextDay: TODAY,
    total: 8,
    position: 1,
    chunk: { index: 2, title: "§1.3 背包、队列和栈", from: 74, to: 107 },
    plannedEnd: "",
    end: "",
    ...overrides,
  });
}

describe("controlCard 导读行", () => {
  it("leads the 阅读 group, before the 课后读 rows", () => {
    const view = controlCard({
      today: TODAY,
      day: day({}),
      calendar: AFTER_READ_MONTH,
      queue: [],
      shelf: { planned: null, guided: [guidedBook()], free: null },
    });
    expect(view?.rows[0]).toEqual({
      group: "read",
      side: {
        label: strings.control.card.accompany,
        action: {
          kind: "accompany",
          prompt: strings.control.card.accompanyBookPrompt(
            guidedBook().title,
            "algs",
            guidedBook().chunk!,
          ),
        },
      },
      mark: "plan",
      text: "导读 · 算法 §1.3 背包、队列和栈 · pp.74–107",
      sub: "第 2 / 8 节 · ≤ 20 分钟",
      button: strings.control.card.shelfDone,
      action: { kind: "shelfDone", slug: "algs" },
      hint: strings.control.card.shelfDoneHint,
    });
    expect(view?.rows[1]?.text).toBe("课后读 · CTM Ch2 §2.2");
    expect(view?.rows.at(-1)?.text).toBe("Anki");
  });

  it("drops the minute part when the book has no limit", () => {
    const view = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: null, guided: [guidedBook({ limit: null })], free: null },
    });
    expect(view?.rows[0]?.sub).toBe("第 2 / 8 节");
  });

  it("a 导读 segment read today shows the same done look as 自读", () => {
    const card = strings.control.card;
    const view = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: {
        planned: null,
        guided: [
          guidedBook({
            position: 2,
            doneToday: true,
            doneChunk: { index: 2, title: "§1.3 背包、队列和栈", from: 74, to: 107 },
            chunk: { index: 3, title: "§1.4 分析", from: 108, to: 140 },
          }),
        ],
        free: null,
      },
    });
    expect(view?.rows[0]).toEqual({
      group: "read",
      side: null,
      mark: "done",
      text: "导读 · 算法 §1.3 背包、队列和栈 · pp.74–107",
      sub: card.shelfDoneSub({ from: 108, to: 140 }),
      button: card.extract,
      action: { kind: "extract", slug: "algs", pages: "pp.74–107" },
      hint: card.extractHint,
    });
  });
});

describe("controlCard 书房行", () => {
  it("sits after the 课后读 rows and before the reading queue", () => {
    const view = controlCard({
      today: TODAY,
      day: day({}),
      calendar: AFTER_READ_MONTH,
      queue: [DUE_ITEM],
      shelf: { planned: book(), guided: [], free: null },
    });
    const texts = view?.rows.map((row) => row.text) ?? [];
    expect(texts[0]).toBe("课后读 · CTM Ch2 §2.2");
    expect(texts[1]).toBe("自读 · Epp Ch1 §1.1–1.4 · pp.10–18");
    // 计划外没有书时不提示这一行（加不加书由用户自己决定）。
    expect(texts[2]).toBe("读书：LeCun 论文");
    expect(texts.at(-1)).toBe("Anki");
  });

  it("shows 书房 rows on a rest day too, after the faint line", () => {
    const view = controlCard({
      today: TODAY,
      day: day({ type: "休息", weekday: "周日", lessons: [], overdue: [] }),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book(), guided: [], free: null },
    });
    expect(view?.rows.map((row) => row.mark)).toEqual(["faint", "plan"]);
    expect(view?.rows[0]?.text).toBe(strings.plan.restItem);
    expect(view?.rows[1]?.text).toBe("自读 · Epp Ch1 §1.1–1.4 · pp.10–18");
  });

  it("marks a late block plan too (no warning), an on-time block plan, a block done today done", () => {
    // Panel v2: a block behind its planned end is no longer a warning — the dates
    // live in the 书房; the card row stays a plain ○.
    const late = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book({ late: 1, end: "2027-01-29" }), guided: [], free: null },
    });
    expect(late?.rows[0]?.mark).toBe("plan");
    expect(late?.rows[0]?.sub).toBe(strings.control.card.shelfDay(2, 81));
    const plan = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book(), guided: [], free: null },
    });
    expect(plan?.rows[0]?.mark).toBe("plan");
    const done = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: {
        planned: book({
          position: 2,
          doneToday: true,
          doneChunk: { index: 2, title: "Ch1 §1.1–1.4", from: 10, to: 18 },
        }),
        guided: [], free: null,
      },
    });
    expect(done?.rows[0]?.mark).toBe("done");
  });

  it("joins the sub in order: 第 n 段 → 课后读重叠（不再写「晚了 N 天」）", () => {
    const card = strings.control.card;
    const view = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book({ late: 2, end: "2027-01-30", coreOverlap: "pp.12–15" }), guided: [], free: null },
    });
    expect(view?.rows[0]?.sub).toBe([card.shelfDay(2, 81), card.shelfCore("pp.12–15")].join(" · "));
    expect(view?.rows[0]?.sub).not.toContain("晚了");
    // Without 晚 and overlap only the day line is left.
    const plain = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book(), guided: [], free: null },
    });
    expect(plain?.rows[0]?.sub).toBe(card.shelfDay(2, 81));
  });

  it("has a 读完这段 row that records the block, and a 摘几句 row once done today", () => {
    const card = strings.control.card;
    const view = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book(), guided: [], free: null },
    });
    expect(view?.rows[0]).toEqual({
      group: "read",
      side: {
        label: card.accompany,
        action: { kind: "accompany", prompt: card.accompanyBookPrompt(book().title, "epp", book().chunk!) },
      },
      mark: "plan",
      text: "自读 · Epp Ch1 §1.1–1.4 · pp.10–18",
      sub: card.shelfDay(2, 81),
      button: card.shelfDone,
      action: { kind: "shelfDone", slug: "epp" },
      hint: card.shelfDoneHint,
    });

    const doneChunk = { index: 2, title: "Ch1 §1.1–1.4", from: 10, to: 18 };
    const done = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: {
        planned: book({
          position: 2,
          doneToday: true,
          doneChunk,
          chunk: { index: 3, title: "Ch1 §1.5", from: 19, to: 27 },
        }),
        guided: [], free: null,
      },
    });
    expect(done?.rows[0]).toEqual({
      group: "read",
      side: null,
      mark: "done",
      text: "自读 · Epp Ch1 §1.1–1.4 · pp.10–18",
      sub: card.shelfDoneSub({ from: 19, to: 27 }),
      button: card.extract,
      action: { kind: "extract", slug: "epp", pages: "pp.10–18" },
      hint: card.extractHint,
    });
  });

  it("a block read today that finished the book reads 「已记下，这本读完了」", () => {
    const card = strings.control.card;
    const view = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: {
        planned: book({
          position: 4,
          total: 4,
          chunk: null,
          doneToday: true,
          doneChunk: { index: 4, title: "Ch1", from: 28, to: 36 },
        }),
        guided: [], free: null,
      },
    });
    // The last block read today still shows: ✓ with the finished sub.
    expect(view?.rows[0]).toEqual({
      group: "read",
      side: null,
      mark: "done",
      text: "自读 · Epp Ch1 · pp.28–36",
      sub: card.shelfFinished,
      button: card.extract,
      action: { kind: "extract", slug: "epp", pages: "pp.28–36" },
      hint: card.extractHint,
    });
    // The planned slot is a finished book (no row of its own): only the finished block and Anki.
    expect(view?.rows.map((row) => row.text)).toEqual(["自读 · Epp Ch1 · pp.28–36", "Anki"]);
  });

  it("a book resumed today shows the block without the 读完这段 button", () => {
    const card = strings.control.card;
    const view = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book({ resumedToday: true }), guided: [], free: null },
    });
    expect(view?.rows[0]).toEqual({
      group: "read",
      mark: "plan",
      text: "自读 · Epp Ch1 §1.1–1.4 · pp.10–18",
      sub: card.shelfResumed,
      button: null,
      action: null,
      hint: null,
    });
    expect(card.shelfResumed).toBe("今天恢复，明天接着读");
    // Not resumed (the default): the row keeps its 读完这段 button.
    const plain = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book(), guided: [], free: null },
    });
    expect(plain?.rows[0]?.button).toBe(card.shelfDone);
    expect(plain?.rows[0]?.sub).toBe(card.shelfDay(2, 81));
  });

  it("a finished book produces no row, and a free book of its own still shows", () => {
    const view = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: {
        planned: book({ position: 81, chunk: null, doneToday: false, doneChunk: null }),
        guided: [], free: book({ slug: "free", short: "Free", slot: "free", position: 81, chunk: null }),
      },
    });
    expect(view?.rows.some((row) => row.text.startsWith("自读 · "))).toBe(false);
    expect(view?.rows.some((row) => row.text.startsWith("自读（计划外）· "))).toBe(false);
    expect(view?.rows.map((row) => row.text)).toEqual(["Anki"]);
  });

  it("no 计划外 hint line, whether or not a planned book exists", () => {
    const withPlanned = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book(), guided: [], free: null },
    });
    expect(withPlanned?.rows.map((row) => row.text)).toEqual(["自读 · Epp Ch1 §1.1–1.4 · pp.10–18", "Anki"]);
    // A finished planned book produces no row of its own either.
    const finished = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book({ position: 81, chunk: null }), guided: [], free: null },
    });
    expect(finished?.rows.map((row) => row.text)).toEqual(["Anki"]);
    // A free book of its own still shows, with the 计划外 prefix.
    const onlyFree = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: null, guided: [], free: book({ slot: "free", slug: "free", short: "Free" }) },
    });
    expect(onlyFree?.rows.map((row) => row.text)).toEqual([
      "自读（计划外）· Free Ch1 §1.1–1.4 · pp.10–18",
      "Anki",
    ]);
    const none = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], shelf: null });
    expect(none?.rows.map((row) => row.text)).toEqual(["Anki"]);
  });
});

describe("withPendingShelf", () => {
  const shelf: ShelfToday = { planned: book(), guided: [], free: null };
  const view = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], shelf });
  if (view === null) throw new Error("sample inside a cycle");

  it("turns the matching 书房 row into ✓ with 「已记下」 and a 撤销 button", () => {
    const card = strings.control.card;
    const shown = withPendingShelf(view, { slug: "epp", left: 7 });
    expect(shown.rows[0]).toEqual({
      group: "read",
      side: null,
      mark: "done",
      text: "自读 · Epp Ch1 §1.1–1.4 · pp.10–18",
      sub: card.shelfPendingSub,
      button: card.undo(7),
      action: { kind: "undoShelf" },
      hint: null,
    });
    // The other rows stay as they were (the Anki row after it keeps its action).
    expect(shown.rows[1]?.action).toEqual({ kind: "anki" });
  });

  it("leaves the view untouched with a null or unmatched pending", () => {
    expect(withPendingShelf(view, null)).toBe(view);
    expect(withPendingShelf(view, { slug: "other", left: 3 }).rows).toEqual(view.rows);
  });
});

describe("withExtractCount", () => {
  const view: ControlCardView = {
    headline: "C1",
    rows: [
      {
        mark: "done",
        text: "自读 · Epp Ch1 §1.1–1.4 · pp.10–18",
        sub: strings.control.card.shelfDoneSub({ from: 19, to: 27 }),
        button: strings.control.card.extract,
        action: { kind: "extract", slug: "epp", pages: "pp.10–18" },
        hint: null,
      },
      { mark: "plan", text: "Anki", button: strings.control.card.anki, action: { kind: "anki" }, hint: null },
    ],
  };

  it("appends 「· 摘了 N 句」 when the book gained a line, leaves a count of 0 alone", () => {
    const card = strings.control.card;
    const none = withExtractCount(view, {});
    expect(none.rows[0]?.sub).toBe(card.shelfDoneSub({ from: 19, to: 27 }));
    const zero = withExtractCount(view, { epp: 0 });
    expect(zero.rows[0]?.sub).toBe(card.shelfDoneSub({ from: 19, to: 27 }));
    const twice = withExtractCount(view, { epp: 2 });
    expect(twice.rows[0]?.sub).toBe(`${card.shelfDoneSub({ from: 19, to: 27 })} · ${card.extracted(2)}`);
    expect(twice.rows[0]?.text).toBe(view.rows[0]?.text);
  });

  it("never touches a non-extract row", () => {
    const shown = withExtractCount(view, { epp: 5 });
    expect(shown.rows[1]).toBe(view.rows[1]);
  });
});

describe("parsePageInput", () => {
  it("accepts 11, p.11 and p 11", () => {
    for (const text of ["11", "p.11", "p 11", "p11", "P.11", " 11 ", "00011"]) {
      expect(parsePageInput(text)).not.toBeNull();
    }
    expect(parsePageInput("p 11")).toBe(11);
  });

  it("rejects 0, 100000, 11a and an empty string", () => {
    for (const text of ["0", "100000", "11a", "", "   ", "11 12", "p.", "-1", "1.5"]) {
      expect(parsePageInput(text)).toBeNull();
    }
  });
});

describe("lesson refs (总控 v3)", () => {
  const CARD = TODAY;
  const TODAY_LESSON_DATE = "2026-11-15";

  it("a not-done main lesson carries one ref to that day and no missed flag", () => {
    const view = controlCard({
      today: TODAY_LESSON_DATE,
      day: day({
        date: TODAY_LESSON_DATE,
        names: { ctm: "CTM" },
        lessons: [{ course: "ctm", id: "D3", content: "Ch3", done: false }],
      }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    const row = view?.rows.find((entry) => entry.group === "lesson");
    expect(row?.lessons).toEqual([
      { slug: "ctm", name: "CTM", id: "D3", content: "Ch3", date: TODAY_LESSON_DATE },
    ]);
    expect(row?.missed).toBeUndefined();
  });

  it("a done lesson carries no refs at all", () => {
    const view = controlCard({
      today: TODAY_LESSON_DATE,
      day: day({
        date: TODAY_LESSON_DATE,
        names: { ctm: "CTM" },
        lessons: [{ course: "ctm", id: "D3", content: "Ch3", done: true }],
      }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    const row = view?.rows.find((entry) => entry.group === "lesson");
    expect(row?.mark).toBe("done");
    expect(row?.lessons).toBeUndefined();
  });

  it("a course's missed lessons fold into one 原排 row, oldest first, each with its own date", () => {
    const view = controlCard({
      today: CARD,
      day: day({
        names: { ctm: "CTM" },
        overdue: [
          { course: "ctm", id: "D2", date: "2026-11-12", content: "Ch2" },
          { course: "ctm", id: "D1", date: "2026-11-10", content: "Ch1" },
        ],
      }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    const row = view?.rows.find((entry) => entry.missed === true);
    expect(row?.missed).toBe(true);
    expect(row?.lessons?.map((lesson) => lesson.id)).toEqual(["D1", "D2"]);
    expect(row?.lessons?.[0]?.date).toBe("2026-11-10");
    expect(row?.lessons?.[1]?.date).toBe("2026-11-12");
  });

  it("an aux lesson today produces no row at all (导读课改书房导读)", () => {
    const view = controlCard({
      today: TODAY_LESSON_DATE,
      day: day({
        date: TODAY_LESSON_DATE,
        roles: { ctm: "aux" },
        names: { ctm: "CTM" },
        lessons: [{ course: "ctm", id: "D1", content: "Ch1", done: false }],
      }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    expect(view?.rows.some((entry) => entry.group === "lesson")).toBe(false);
    expect(view?.rows.map((entry) => entry.text)).toEqual(["Anki"]);
  });

  it("周核实、讲后读 and Anki rows carry no refs", () => {
    const calendar = month({
      [CARD]: {
        records: [],
        plans: [],
        readingDue: [{ slug: "ctm#讲后读-t-1", title: "讲后读 · Ch3 · CTM", book: "t", index: 1 }],
        log: [],
        note: null,
      },
    });
    const view = controlCard({
      today: CARD,
      day: day({ type: "整合", subject: null, course: null }),
      calendar,
      queue: [],
      anki: { running: true, due: [{ deck: "离散", count: 12 }] },
    });
    const verify = view?.rows.filter((entry) => entry.action?.kind === "verify") ?? [];
    const read = view?.rows.find((entry) => entry.action?.kind === "afterRead");
    const anki = view?.rows.find((entry) => entry.action?.kind === "anki");
    expect(verify.length).toBeGreaterThan(0);
    expect(read).toBeDefined();
    expect(anki).toBeDefined();
    for (const row of verify) expect(row.lessons).toBeUndefined();
    expect(read?.lessons).toBeUndefined();
    expect(anki?.lessons).toBeUndefined();
  });
});

describe("陪读 prompt", () => {
  it("books the 「陪读」 section of the reading skill for a 导读 chunk", () => {
    expect(
      strings.control.card.accompanyBookPrompt("Effective C（第 2 版）", "effective-c", {
        title: "Ch1 起步",
        from: 1,
        to: 11,
      }),
    ).toBe(
      "/skill:reading 陪读《Effective C（第 2 版）》（书房 effective-c）Ch1 起步 pp.1–11，按 reading 技能「陪读」一节做。",
    );
  });

  it("books the 「陪读」 section for a 课后读 title", () => {
    expect(strings.control.card.accompanyAfterReadPrompt("§3.1–3.2", "discrete-math-epp")).toBe(
      "/skill:reading 陪读「§3.1–3.2」（课程 discrete-math-epp 的课后读），按 reading 技能「陪读」一节做。",
    );
  });
});
