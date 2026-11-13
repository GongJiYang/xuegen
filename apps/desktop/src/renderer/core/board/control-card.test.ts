import { describe, expect, it } from "vitest";
import type { CalendarMonth, CycleDay, ShelfBook, ShelfToday } from "@shared/data-protocol.js";
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

describe("controlCard", () => {
  it("returns null outside every cycle or without a day", () => {
    expect(controlCard({ today: TODAY, day: null, calendar: EMPTY_MONTH, queue: [] })).toBeNull();
    expect(
      controlCard({ today: TODAY, day: day({ cycle: null, week: null, type: null }), calendar: EMPTY_MONTH, queue: [] }),
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
    expect(view?.rows).toEqual([{ mark: "faint", text: strings.plan.restItem, button: null, action: null, hint: null }]);
  });

  it("deep day: main, aux, overdue, 讲后读 (today and overdue), Anki — in that order", () => {
    const calendar = month({
      "2026-11-10": {
        records: [],
        plans: [],
        readingDue: [{ slug: "ctm#讲后读-1", title: "讲后读 · Ch2 §2.2 · CTM" }],
        log: [],
        note: null,
      },
      "2026-11-11": {
        records: [],
        plans: [],
        readingDue: [{ slug: "discrete-math-epp#讲后读-2", title: "讲后读 · §1.1–1.4 · 离散数学（Epp, 5th ed）" }],
        log: [],
        note: null,
      },
      "2026-11-12": {
        records: [],
        plans: [],
        readingDue: [{ slug: "ctm#讲后读-3", title: "讲后读 · Ch3 · CTM" }],
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
    expect(view?.rows.map((row) => row.mark)).toEqual(["now", "plan", "warn", "warn", "plan", "plan"]);
    expect(view?.rows[0]?.text).toBe("离散 D3 · Ch2 §2.3：有效论证");
    expect(view?.rows[1]?.text).toBe("带读 · Effective C D1 · Ch1 起步");
    expect(view?.rows[2]?.text).toBe(strings.control.card.missedRow("CTM", "D1", "2026-11-10"));
    // The overdue 讲后读 sorts before today's, flagged with its due date.
    expect(view?.rows[3]?.text).toBe("讲后读 · Ch2 §2.2 · CTM" + strings.control.card.afterReadDue("2026-11-10"));
    expect(view?.rows[4]?.text).toBe("讲后读 · §1.1–1.4 · 离散数学（Epp, 5th ed）");
    expect(view?.rows[5]?.text).toBe("Anki");
    expect(view?.rows[3]?.text).toBe("讲后读 · Ch2 §2.2 · CTM · 原定 11-10");
    expect(view?.rows[3]?.action).toEqual({ kind: "afterRead", slug: "ctm", label: "Ch2 §2.2" });
    expect(view?.rows[4]?.action).toEqual({ kind: "afterRead", slug: "discrete-math-epp", label: "§1.1–1.4" });
    expect(view?.rows[5]?.action).toEqual({ kind: "anki" });
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
    expect(view?.rows.slice(0, 2)).toEqual([
      {
        mark: "done",
        text: "离散 D3 · Ch2 §2.3：有效论证",
        button: strings.control.card.backToLesson,
        action: { kind: "study", slug: "discrete-math-epp" },
        hint: strings.control.card.studyHint,
      },
      {
        mark: "done",
        text: "带读 · Effective C D1 · Ch1 起步",
        button: strings.control.card.backToLesson,
        action: { kind: "study", slug: "effective-c" },
        hint: strings.control.card.studyHint,
      },
    ]);
    // 过期课次不受影响，仍是 ！ + 开课 →。
    expect(view?.rows[2]).toEqual({
      mark: "warn",
      text: strings.control.card.missedRow("CTM", "D1", "2026-11-10"),
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
    expect(view?.rows.slice(0, 2).map((row) => row.mark)).toEqual(["now", "plan"]);
    expect(view?.rows[0]?.button).toBe(strings.control.card.study);
    expect(view?.rows[1]?.button).toBe(strings.control.card.study);
  });

  it("verify day: one row per main course", () => {
    const view = controlCard({
      today: TODAY,
      day: day({ type: "整合", subject: null, course: null }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    expect(view?.rows.slice(0, 2)).toEqual([
      { mark: "now", text: "离散 周核实", button: strings.control.card.verify, action: { kind: "verify", slug: "discrete-math-epp" }, hint: strings.control.card.verifyHint },
      { mark: "now", text: "CTM 周核实", button: strings.control.card.verify, action: { kind: "verify", slug: "ctm" }, hint: strings.control.card.verifyHint },
    ]);
  });

  it("light day marks due reading as now; other days mark it plan", () => {
    const queue = [
      { slug: "jepa", title: "LeCun 论文", priority: "medium", due: "2026-11-11", position: "第 3 页", status: "active" },
      { slug: "later", title: "之后", priority: "low", due: "2026-11-20", position: "", status: "queued" },
      { slug: "unscheduled", title: "没排期", priority: "low", due: "", position: "", status: "queued" },
    ];
    const light = controlCard({ today: TODAY, day: day({ type: "低强度", subject: null, course: null }), calendar: EMPTY_MONTH, queue });
    expect(light?.rows[0]).toEqual({
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
    const running = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], anki: ANKI_RUNNING });
    const ankiRow = running?.rows.find((row) => row.action?.kind === "anki");
    expect(ankiRow?.text).toBe("Anki · 今日 74 张");
    expect(ankiRow?.button).toBe(strings.control.card.anki);
  });

  it("keeps the Anki row plain when Anki is closed or was not read", () => {
    const closed = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], anki: ANKI_CLOSED });
    expect(closed?.rows.find((row) => row.action?.kind === "anki")?.text).toBe("Anki");
    // Running with nothing due says so instead of falling back to the plain row.
    const nothing = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], anki: { running: true } });
    expect(nothing?.rows.find((row) => row.action?.kind === "anki")?.text).toBe("Anki · 今日 0 张");
    const unknown = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [] });
    expect(unknown?.rows.find((row) => row.action?.kind === "anki")?.text).toBe("Anki");
  });

  it("takes the 讲后读 label from between 「讲后读 · 」 and 「 · 课名」, keeping the course name's parens", () => {
    const calendar = month({
      [TODAY]: {
        records: [],
        plans: [],
        readingDue: [
          { slug: "epp#讲后读-1", title: "讲后读 · §1.1–1.4 · 离散数学（Epp, 5th ed）" },
          { slug: "plain#讲后读-2", title: "讲后读 · 第 3 章 · 普通书名" },
        ],
        log: [],
        note: null,
      },
    });
    const view = controlCard({ today: TODAY, day: day({}), calendar, queue: [] });
    expect(view?.rows[0]?.text).toBe("讲后读 · §1.1–1.4 · 离散数学（Epp, 5th ed）");
    expect(view?.rows[0]?.action).toEqual({ kind: "afterRead", slug: "epp", label: "§1.1–1.4" });
    expect(view?.rows[1]?.action).toEqual({ kind: "afterRead", slug: "plain", label: "第 3 章" });
  });

  it("still writes the old-style label into the course page for a 讲后读 title in the old shape", () => {
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
    expect(view?.rows[0]?.action).toEqual({ kind: "afterRead", slug: "epp", label: "§1.1–1.4 核心页" });
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
        mark: "warn",
        text: strings.control.card.missedMany("CTM", 3, "2026-11-09"),
        button: strings.control.card.study,
        action: { kind: "study", slug: "ctm" },
        hint: strings.control.card.studyHint,
      },
    ]);
    expect(view?.rows[0]?.text).toBe("CTM 3 节没学（最早 11-09）· 开课时会顺延");

    // 只有一节时仍是「原定 …」那一行。
    const one = controlCard({
      today: TODAY,
      day: day({ overdue: [{ course: "ctm", id: "D1", content: "Ch1", date: "2026-11-10" }] }),
      calendar: EMPTY_MONTH,
      queue: [],
    });
    expect(one?.rows[0]?.text).toBe(strings.control.card.missedRow("CTM", "D1", "2026-11-10"));
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
      strings.control.card.missedMany("离散", 2, "2026-11-08"),
      strings.control.card.missedMany("CTM", 2, "2026-11-09"),
    ]);
    expect(view?.rows.slice(0, 2).map((row) => row.mark)).toEqual(["warn", "warn"]);
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
      readingDue: [{ slug: "ctm#讲后读-1", title: "讲后读 · Ch2 §2.2 · CTM" }],
      log: [],
      note: null,
    },
  });

  it("turns the matching 读完了 row into ✓ with a 撤销 button, leaving the rest", () => {
    const view = controlCard({ today: TODAY, day: day({}), calendar, queue: [] });
    if (view === null) throw new Error("sample inside a cycle");
    const shown = withPendingRead(view, { slug: "ctm", label: "Ch2 §2.2", left: 7 });
    const row = shown.rows.find((entry) => entry.text === "讲后读 · Ch2 §2.2 · CTM");
    expect(row).toEqual({
      mark: "done",
      text: "讲后读 · Ch2 §2.2 · CTM",
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
    expect(withPendingRead(view, { slug: "other", label: "x", left: 3 }).rows).toEqual(view.rows);
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
    ...overrides,
  };
}

/** A 讲后读 row due today, so the card has a row before the 书房 rows. */
const ANKI_RUNNING = { running: true, due: [{ deck: "离散", count: 70 }, { deck: "CTM", count: 4 }] };
const ANKI_CLOSED = { running: false };

const AFTER_READ_MONTH = month({
  [TODAY]: {
    records: [],
    plans: [],
    readingDue: [{ slug: "ctm#讲后读-1", title: "讲后读 · Ch2 §2.2 · CTM" }],
    log: [],
    note: null,
  },
});

const DUE_ITEM = { slug: "jepa", title: "LeCun 论文", priority: "medium" as const, due: TODAY, position: "", status: "active" as const };

describe("controlCard 书房行", () => {
  it("sits after the 讲后读 rows and before the reading queue", () => {
    const view = controlCard({
      today: TODAY,
      day: day({}),
      calendar: AFTER_READ_MONTH,
      queue: [DUE_ITEM],
      shelf: { planned: book(), free: null },
    });
    const texts = view?.rows.map((row) => row.text) ?? [];
    expect(texts[0]).toBe("讲后读 · Ch2 §2.2 · CTM");
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
      shelf: { planned: book(), free: null },
    });
    expect(view?.rows.map((row) => row.mark)).toEqual(["faint", "plan"]);
    expect(view?.rows[0]?.text).toBe(strings.plan.restItem);
    expect(view?.rows[1]?.text).toBe("自读 · Epp Ch1 §1.1–1.4 · pp.10–18");
  });

  it("marks a late block warn, an on-time block plan, a block done today done", () => {
    const warn = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], shelf: { planned: book({ late: 1, end: "2027-01-29" }), free: null } });
    expect(warn?.rows[0]?.mark).toBe("warn");
    const plan = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], shelf: { planned: book(), free: null } });
    expect(plan?.rows[0]?.mark).toBe("plan");
    const done = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book({ position: 2, doneToday: true, doneChunk: { index: 2, title: "Ch1 §1.1–1.4", from: 10, to: 18 } }), free: null },
    });
    expect(done?.rows[0]?.mark).toBe("done");
  });

  it("joins the sub in order: 第 n 天 → 晚了 → 讲后读重叠", () => {
    const card = strings.control.card;
    const view = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book({ late: 2, end: "2027-01-30", coreOverlap: "pp.12–15" }), free: null },
    });
    expect(view?.rows[0]?.sub).toBe(
      [card.shelfDay(2, 81), card.shelfLate(2, "2027-01-30"), card.shelfCore("pp.12–15")].join(" · "),
    );
    // Without 晚 and overlap only the day line is left.
    const plain = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], shelf: { planned: book(), free: null } });
    expect(plain?.rows[0]?.sub).toBe(card.shelfDay(2, 81));
  });

  it("has a 读完这段 row that records the block, and a 摘几句 row once done today", () => {
    const card = strings.control.card;
    const view = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], shelf: { planned: book(), free: null } });
    expect(view?.rows[0]).toEqual({
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
      shelf: { planned: book({ position: 2, doneToday: true, doneChunk, chunk: { index: 3, title: "Ch1 §1.5", from: 19, to: 27 } }), free: null },
    });
    expect(done?.rows[0]).toEqual({
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
        planned: book({ position: 4, total: 4, chunk: null, doneToday: true, doneChunk: { index: 4, title: "Ch1", from: 28, to: 36 } }),
        free: null,
      },
    });
    // The last block read today still shows: ✓ with the finished sub.
    expect(view?.rows[0]).toEqual({
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
      shelf: { planned: book({ resumedToday: true }), free: null },
    });
    expect(view?.rows[0]).toEqual({
      mark: "plan",
      text: "自读 · Epp Ch1 §1.1–1.4 · pp.10–18",
      sub: card.shelfResumed,
      button: null,
      action: null,
      hint: null,
    });
    expect(card.shelfResumed).toBe("今天恢复，明天接着读");
    // Not resumed (the default): the row keeps its 读完这段 button.
    const plain = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], shelf: { planned: book(), free: null } });
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
        free: book({ slug: "free", short: "Free", slot: "free", position: 81, chunk: null }),
      },
    });
    expect(view?.rows.some((row) => row.text.startsWith("自读 · "))).toBe(false);
    expect(view?.rows.some((row) => row.text.startsWith("自读（计划外）· "))).toBe(false);
    expect(view?.rows.map((row) => row.text)).toEqual(["Anki"]);
  });

  it("no 计划外 hint line, whether or not a planned book exists", () => {
    const withPlanned = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], shelf: { planned: book(), free: null } });
    expect(withPlanned?.rows.map((row) => row.text)).toEqual(["自读 · Epp Ch1 §1.1–1.4 · pp.10–18", "Anki"]);
    // A finished planned book produces no row of its own either.
    const finished = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: book({ position: 81, chunk: null }), free: null },
    });
    expect(finished?.rows.map((row) => row.text)).toEqual(["Anki"]);
    // A free book of its own still shows, with the 计划外 prefix.
    const onlyFree = controlCard({
      today: TODAY,
      day: day({}),
      calendar: EMPTY_MONTH,
      queue: [],
      shelf: { planned: null, free: book({ slot: "free", slug: "free", short: "Free" }) },
    });
    expect(onlyFree?.rows.map((row) => row.text)).toEqual(["自读（计划外）· Free Ch1 §1.1–1.4 · pp.10–18", "Anki"]);
    const none = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], shelf: null });
    expect(none?.rows.map((row) => row.text)).toEqual(["Anki"]);
  });
});

describe("withPendingShelf", () => {
  const shelf: ShelfToday = { planned: book(), free: null };
  const view = controlCard({ today: TODAY, day: day({}), calendar: EMPTY_MONTH, queue: [], shelf });
  if (view === null) throw new Error("sample inside a cycle");

  it("turns the matching 书房 row into ✓ with 「已记下」 and a 撤销 button", () => {
    const card = strings.control.card;
    const shown = withPendingShelf(view, { slug: "epp", left: 7 });
    expect(shown.rows[0]).toEqual({
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
