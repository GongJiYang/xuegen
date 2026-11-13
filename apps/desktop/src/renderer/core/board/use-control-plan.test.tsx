// useControlPlan 的测试：假 client 按 kind 回答，断视图切换、翻页、「今天」与非总控。
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { CycleDay, CycleDayType, CycleMonth, CycleSlot } from "@shared/data-protocol.js";
import { setTodayOverride } from "../today.js";
import type { ControlFold } from "./control-fold.js";
import type { BoardResource } from "./use-resource.js";
import { useControlPlan, type ControlPlan, type ControlPlanInput } from "./use-control-plan.js";

const clientMock = vi.hoisted(() => ({ data: vi.fn() }));
vi.mock("../client.js", () => ({ data: clientMock.data }));

const TODAY = "2026-11-11";

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

/** A cycle day inside C1, so the 今日卡 has rows. */
function day(): CycleDay {
  return {
    date: TODAY,
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

function emptyCycle(month: string): CycleMonth {
  return { month, days: {}, lessons: {}, names: {}, subjects: {}, roles: {}, cycles: [], recovery: [] };
}

function mockClient(): void {
  clientMock.data.mockImplementation((request: { kind: string; month?: string }) => {
    const ok = (data: unknown) => Promise.resolve({ ok: true, data });
    switch (request.kind) {
      case "cycle.month":
        return ok(request.month === "2026-11" ? CYCLE_NOV : emptyCycle(request.month ?? ""));
      case "calendar.month":
        return ok({ month: request.month, days: {} });
      case "shelf.list":
        return ok([]);
      case "cycle.overview":
        return ok({ date: TODAY, route: null, cycle: null, courses: [] });
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

function fold(older: ControlFold["older"] = null): ControlPlanInput["fold"] {
  return { messages: [], systemNotes: [], older, open: false, toggle: vi.fn() };
}

function input(overrides: Partial<ControlPlanInput> = {}): ControlPlanInput {
  return {
    today: resource(day()),
    tomorrow: resource(day()),
    queue: resource([]),
    anki: resource({ running: false }),
    shelf: {
      today: resource({ planned: null, free: null }),
      list: resource([]),
      done: vi.fn(),
      extract: vi.fn(),
      reload: vi.fn(),
    },
    streaming: false,
    onStudy: vi.fn(),
    onVerify: vi.fn(),
    onOpenTool: vi.fn(),
    onAskBrief: vi.fn(),
    refresh: vi.fn(),
    isControl: true,
    fold: fold(),
    ...overrides,
  };
}

let captured: ControlPlan | null = null;

function Harness({ props }: { props: ControlPlanInput }) {
  const plan = useControlPlan(props);
  useEffect(() => {
    captured = plan;
  });
  return null;
}

/** Flush the loader's promise chain (cycle.month then the rest in parallel). */
async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  });
}

function requests(kind: string): { kind: string }[] {
  return clientMock.data.mock.calls.map(([request]) => request as { kind: string }).filter((request) => request.kind === kind);
}

describe("useControlPlan", () => {
  beforeEach(() => {
    setTodayOverride(TODAY);
    mockClient();
    render(<Harness props={input()} />);
  });
  afterEach(() => {
    captured = null;
    setTodayOverride(null);
    clientMock.data.mockReset();
  });

  it("初始是周视图（总控面板右块翻周 / 月，日在左块）、锚在今天，「今天」按钮不可点", async () => {
    await settle();
    expect(captured?.plan.view).toBe("week");
    expect(captured?.plan.anchor).toBe(TODAY);
    expect(captured?.plan.todayDisabled).toBe(true);
    expect(captured?.plan.label).toBe("C1 W1 · 11-06 – 11-12");
    expect(captured?.plan.data.status).toBe("ready");
    if (captured?.plan.data.status !== "ready" || captured.plan.data.value.view !== "week") throw new Error("not a week result");
    expect(captured.plan.data.value.week.start).toBe("2026-11-06");
  });

  it("日视图 next() 后 anchor 进一天；prev() 退回", async () => {
    await settle();
    act(() => captured?.plan.setView("day"));
    act(() => captured?.plan.next());
    expect(captured?.plan.anchor).toBe("2026-11-12");
    expect(captured?.plan.todayDisabled).toBe(false);
    act(() => captured?.plan.prev());
    expect(captured?.plan.anchor).toBe(TODAY);
    act(() => captured?.plan.next());
    act(() => captured?.plan.today());
    expect(captured?.plan.anchor).toBe(TODAY);
    expect(captured?.plan.todayDisabled).toBe(true);
  });

  it("从月视图切回周视图后标题是周期周范围", async () => {
    await settle();
    act(() => captured?.plan.setView("month"));
    await settle();
    act(() => captured?.plan.setView("week"));
    // 数据未到之前先用周一–周日兜底。
    expect(captured?.plan.label).toBe("11-09 – 11-15");
    await settle();
    expect(captured?.plan.label).toBe("C1 W1 · 11-06 – 11-12");
    if (captured?.plan.data.status !== "ready" || captured.plan.data.value.view !== "week") throw new Error("not a week result");
    expect(captured.plan.data.value.week.start).toBe("2026-11-06");
  });

  it("openDay(date) 切到日视图并把 anchor 定到那天", async () => {
    await settle();
    act(() => captured?.plan.setView("week"));
    await settle();
    act(() => captured?.plan.openDay("2026-11-13"));
    expect(captured?.plan.view).toBe("day");
    expect(captured?.plan.anchor).toBe("2026-11-13");
    expect(captured?.plan.label).toBe("11-13 周五");
    expect(captured?.plan.todayDisabled).toBe(false);
  });

  it("总控会话：card 是今日卡 props（含 older），fold 有更早对话时 older 一行", async () => {
    await settle();
    expect(captured?.card).not.toBeNull();
    expect(captured?.card?.view.rows[0]?.text).toBe("离散 D3 · Ch2 有效论证");
    expect(captured?.card?.older).toBeNull();
    expect(captured?.older).toBeNull();
  });
});

describe("useControlPlan 非总控", () => {
  beforeEach(() => {
    setTodayOverride(TODAY);
    mockClient();
  });
  afterEach(() => {
    captured = null;
    setTodayOverride(null);
    clientMock.data.mockReset();
  });

  it("isControl=false：card 与 older 为 null，plan 照常但不发 planbook 请求", async () => {
    render(<Harness props={input({ isControl: false })} />);
    await settle();
    expect(captured?.card).toBeNull();
    expect(captured?.older).toBeNull();
    expect(captured?.plan.view).toBe("week");
    expect(captured?.plan.data.status).toBe("loading");
    expect(requests("cycle.month")).toHaveLength(0);
    expect(requests("shelf.list")).toHaveLength(0);
    expect(requests("anki.status")).toHaveLength(0);
  });

  it("fold 有更早对话时也返回 null（非总控不折叠）", async () => {
    render(<Harness props={input({ isControl: false, fold: fold({ count: 3, since: "2026-11-05" }) })} />);
    await settle();
    expect(captured?.older).toBeNull();
    expect(captured?.card).toBeNull();
  });
});
