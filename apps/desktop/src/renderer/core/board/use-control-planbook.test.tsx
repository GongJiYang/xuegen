// useControlPlanbook 的测试：组装处本身（不是 ControlPanel，也不是 useControlPlan）。
// 假 client 按 kind 回答，断面板拿到的是「翻页后的数据」、今日卡随今天 / 点选的日期、
// 周视图的 week 跟着 ‹ › 翻页（v0.12.0 曾把 month 写死成 null、week 用面板自己的本周）。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type {
  CycleDay,
  CycleDayType,
  CycleMonth,
  CycleOverview,
  CycleSlot,
  SubjectsOverview,
} from "@shared/data-protocol.js";
import { setTodayOverride } from "../today.js";
import type { ControlPlanbookInput } from "./use-control-planbook.js";
import { useControlPlanbook, type ControlPlanbook } from "./use-control-planbook.js";
import type { BoardResource } from "./use-resource.js";

const clientMock = vi.hoisted(() => ({ data: vi.fn() }));
vi.mock("../client.js", () => ({ data: clientMock.data }));

const TODAY = "2026-11-11";
/** The cycle week C1 W1 is 11-06 – 11-12; the plain Monday week of 11-11 is 11-09 – 11-15. */
const NEXT_WEEK_START = "2026-11-16";

function slot(type: CycleDayType, week = 1): CycleSlot {
  return { cycle: "C1", week, type, subject: null, course: null, aux: null, auxCourse: null };
}

const CYCLE_NOV: CycleMonth = {
  month: "2026-11",
  days: {
    "2026-11-06": slot("整合"),
    "2026-11-07": slot("低强度"),
    "2026-11-08": slot("休息"),
    "2026-11-09": slot("深度"),
    "2026-11-10": slot("深度"),
    "2026-11-11": slot("深度"),
    "2026-11-12": slot("深度"),
  },
  lessons: {},
  names: {},
  subjects: {},
  roles: {},
  cycles: [{ cycle: "C1", start: "2026-11-06", end: "2026-12-24" }],
  recovery: [],
};

function emptyCycle(month: string): CycleMonth {
  return { month, days: {}, lessons: {}, names: {}, subjects: {}, roles: {}, cycles: [], recovery: [] };
}

/** A cycle day (so the 今日卡 has rows). */
function day(date = TODAY): CycleDay {
  return {
    date,
    weekday: "周三",
    cycle: "C1",
    week: 1,
    type: "深度",
    subject: "discrete-math",
    course: "discrete-math",
    aux: null,
    auxCourse: null,
    names: { "discrete-math": "离散" },
    subjects: {},
    roles: { "discrete-math": "main" },
    lessons: [{ course: "discrete-math", id: "D3", content: "Ch2 有效论证" }],
    overdue: [],
  };
}

const OVERVIEW: CycleOverview = { date: TODAY, route: null, cycle: null, courses: [] };
const SUBJECTS: SubjectsOverview = { date: TODAY, cycle: null, subjects: [] };

function mockClient(): void {
  clientMock.data.mockImplementation((request: { kind: string; month?: string; date?: string }) => {
    const ok = (data: unknown) => Promise.resolve({ ok: true, data });
    switch (request.kind) {
      case "cycle.month":
        return ok(request.month === "2026-11" ? CYCLE_NOV : emptyCycle(request.month ?? ""));
      case "calendar.month":
        return ok({ month: request.month, days: {} });
      case "cycle.day":
        return ok(day(request.date ?? TODAY));
      case "shelf.today":
        return ok({ planned: null, free: null });
      case "shelf.list":
        return ok([]);
      case "cycle.overview":
        return ok(OVERVIEW);
      case "subjects.list":
        return ok(SUBJECTS);
      case "cards.stats":
        return ok({ total: 0, unsynced: 0, broken: 0, decks: [], pendingExtracts: 0 });
      case "courses.list":
        return ok([]);
      case "anki.status":
        return ok({ running: false });
      default:
        return Promise.resolve({ ok: false, code: "script-failed", error: `unexpected ${request.kind}` });
    }
  });
}

function resource<T>(value: T): BoardResource<T> {
  return { state: { status: "ready", value }, reload: vi.fn(), mutate: vi.fn() };
}

/** The minimal input App builds for the assembly hook; resources are ready fakes. */
function input(overrides: Partial<ControlPlanbookInput> = {}): ControlPlanbookInput {
  const today = resource(day());
  return {
    cycle: {
      today,
      tomorrow: resource(day("2026-11-12")),
      month: resource(CYCLE_NOV),
      overview: resource(OVERVIEW),
      reload: vi.fn(),
    },
    reading: {
      items: resource([]),
      queue: resource([]),
      stats: resource({
        reading: { queued: 0, active: 0, paused: 0, done: 0 },
        dueToday: 0,
        overdue: 0,
        reviewsLast7: 0,
        cardsPending: 0,
      }),
      sources: resource([]),
      shelf: {
        today: resource({ planned: null, free: null }),
        list: resource([]),
        done: vi.fn(),
        extract: vi.fn(),
        reload: vi.fn(),
      },
      add: vi.fn(),
      review: vi.fn(),
      reload: vi.fn(),
    } as unknown as ControlPlanbookInput["reading"],
    anki: resource({ running: false }),
    controller: {
      streaming: false,
      messages: [],
      systemNotes: [],
      send: vi.fn(),
    } as unknown as ControlPlanbookInput["controller"],
    control: { isControl: true, cycle: "C1", openControl: vi.fn(), askBrief: vi.fn() },
    fold: { messages: [], systemNotes: [], older: null, open: false, toggle: vi.fn() },
    courses: resource([]),
    calendar: {
      month: "2026-11",
      setMonth: vi.fn(),
      resource: resource({ month: "2026-11", days: {} }),
      selected: TODAY,
      select: vi.fn(),
      writeNote: vi.fn(),
    },
    cards: {
      stats: resource({ total: 0, unsynced: 0, broken: 0, decks: [], pendingExtracts: 0 }),
      add: vi.fn(),
      reload: vi.fn(),
    },
    subjects: resource(SUBJECTS),
    studyCourse: vi.fn(),
    startSession: vi.fn(),
    openTool: vi.fn(),
    setActiveCourse: vi.fn(),
    verifiedOn: {},
    ...overrides,
  };
}

/** Flush the loader's promise chain (cycle.month, then the rest in parallel). */
async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}

function render(props: ControlPlanbookInput = input()): { current(): ControlPlanbook } {
  const { result } = renderHook<ControlPlanbook, void>(() => useControlPlanbook(props));
  return { current: () => result.current };
}

describe("useControlPlanbook 组装", () => {
  beforeEach(() => {
    setTodayOverride(TODAY);
    mockClient();
  });
  afterEach(() => {
    setTodayOverride(null);
    clientMock.data.mockReset();
  });

  it("初始：面板是周视图、右块有本周、今日卡跟着显示", async () => {
    const hook = render();
    await settle();
    expect(hook.current().panelProps.view).toBe("week");
    expect(hook.current().card).not.toBeNull();
    expect(hook.current().panelShowCard).toBe(true);
    expect(hook.current().panelProps.week).not.toBeNull();
    expect(hook.current().panelProps.week?.start).toBe("2026-11-06");
    expect(hook.current().panelProps.month).toBeNull();
  });

  it('panelProps.onView("month") 后右块拿到当月每天，今日卡仍在', async () => {
    const hook = render();
    await settle();
    act(() => hook.current().panelProps.onView("month"));
    await settle();
    expect(hook.current().panelProps.view).toBe("month");
    const month = hook.current().panelProps.month;
    expect(month).not.toBeNull();
    // 2026-11 has 30 days.
    expect(month).toHaveLength(30);
    expect(month?.[0]?.date).toBe("2026-11-01");
    expect(hook.current().panelShowCard).toBe(true);
  });

  it("周视图 onNext() 后右块的 week 是下一周（不是面板自己的本周）", async () => {
    const hook = render();
    await settle();
    expect(hook.current().panelProps.week?.start).toBe("2026-11-06");
    act(() => hook.current().panelProps.onNext());
    await settle();
    expect(hook.current().panelProps.week?.start).toBe(NEXT_WEEK_START);
    expect(hook.current().panelProps.week?.start).not.toBe("2026-11-06");
  });

  it("onOpenDay 到本周另一天：今天块换成那天、今日卡收起，回到今天后恢复", async () => {
    const hook = render();
    await settle();
    act(() => hook.current().panelProps.onOpenDay("2026-11-09"));
    await settle();
    expect(hook.current().panelProps.shownToday).toBe(false);
    expect(hook.current().panelShowCard).toBe(false);
    expect(hook.current().panelProps.day?.date).toBe("2026-11-09");

    act(() => hook.current().panelProps.onBackToToday());
    await settle();
    expect(hook.current().panelProps.shownToday).toBe(true);
    expect(hook.current().panelShowCard).toBe(true);
    expect(hook.current().panelProps.day?.date).toBe(TODAY);
  });
});
