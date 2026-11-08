import { describe, expect, it } from "vitest";
import type { CalendarMonth, CycleDay } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import { controlCard, withPendingRead } from "./control-card.js";

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
        readingDue: [{ slug: "ctm#讲后读-1", title: "讲后读 Ch2 §2.2（CTM）" }],
        log: [],
        note: null,
      },
      "2026-11-11": {
        records: [],
        plans: [],
        readingDue: [{ slug: "discrete-math-epp#讲后读-2", title: "讲后读 §1.1–1.4 核心页（离散数学（Epp, 5th ed））" }],
        log: [],
        note: null,
      },
      "2026-11-12": {
        records: [],
        plans: [],
        readingDue: [{ slug: "ctm#讲后读-3", title: "讲后读 Ch3（CTM）" }],
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
    expect(view?.rows[1]?.text).toBe("辅助 · Effective C D1 · Ch1 起步");
    expect(view?.rows[2]?.text).toBe(strings.control.card.missedRow("CTM", "D1", "2026-11-10"));
    // The overdue 讲后读 sorts before today's, flagged with its due date.
    expect(view?.rows[3]?.text).toBe("讲后读 Ch2 §2.2（CTM）" + strings.control.card.afterReadDue("2026-11-10"));
    expect(view?.rows[4]?.text).toBe("讲后读 §1.1–1.4 核心页（离散数学（Epp, 5th ed））");
    expect(view?.rows[5]?.text).toBe("Anki");
    expect(view?.rows[3]?.action).toEqual({ kind: "afterRead", slug: "ctm", label: "Ch2 §2.2" });
    expect(view?.rows[4]?.action).toEqual({ kind: "afterRead", slug: "discrete-math-epp", label: "§1.1–1.4 核心页" });
    expect(view?.rows[5]?.action).toEqual({ kind: "anki" });
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

  it("parses the 讲后读 label up to the course title's outer paren", () => {
    const calendar = month({
      [TODAY]: {
        records: [],
        plans: [],
        readingDue: [
          { slug: "epp#讲后读-1", title: "讲后读 §1.1–1.4 核心页（离散数学（Epp, 5th ed））" },
          { slug: "plain#讲后读-2", title: "讲后读 第 3 章（普通书名）" },
        ],
        log: [],
        note: null,
      },
    });
    const view = controlCard({ today: TODAY, day: day({}), calendar, queue: [] });
    expect(view?.rows[0]?.action).toEqual({ kind: "afterRead", slug: "epp", label: "§1.1–1.4 核心页" });
    expect(view?.rows[1]?.action).toEqual({ kind: "afterRead", slug: "plain", label: "第 3 章" });
  });
});

describe("withPendingRead", () => {
  const calendar = month({
    [TODAY]: {
      records: [],
      plans: [],
      readingDue: [{ slug: "ctm#讲后读-1", title: "讲后读 Ch2 §2.2（CTM）" }],
      log: [],
      note: null,
    },
  });

  it("turns the matching 读完了 row into ✓ with a 撤销 button, leaving the rest", () => {
    const view = controlCard({ today: TODAY, day: day({}), calendar, queue: [] });
    if (view === null) throw new Error("sample inside a cycle");
    const shown = withPendingRead(view, { slug: "ctm", label: "Ch2 §2.2", left: 7 });
    const row = shown.rows.find((entry) => entry.text === "讲后读 Ch2 §2.2（CTM）");
    expect(row).toEqual({
      mark: "done",
      text: "讲后读 Ch2 §2.2（CTM）",
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
