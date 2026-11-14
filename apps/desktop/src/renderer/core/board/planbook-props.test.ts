// planbookProps：useControlPlan 的 plan + PlanbookResult → Planbook 插槽的 props。
import { describe, expect, it, vi } from "vitest";
import type { ControlPlan } from "./use-control-plan.js";
import type { PlanbookResult } from "./use-planbook.js";
import type { PlanDay, PlanWeek } from "./planbook.js";
import { planbookProps } from "./planbook-props.js";

const TODAY = "2026-11-11";

function day(date: string): PlanDay {
  return {
    date,
    weekday: "周三",
    type: "深度",
    isToday: date === TODAY,
    items: [
      { lane: "main", text: "离散 D3 · Ch2 有效论证", short: "离散 D3", mark: "now", slug: "dm", id: "D3" },
    ],
    ankiDue: null,
  };
}

function week(): PlanWeek {
  return {
    cycle: "C1",
    week: 1,
    start: "2026-11-06",
    end: "2026-11-12",
    days: [day(TODAY)],
    goals: [],
    overdue: [],
    reviewDate: null,
  };
}

function plan(
  overrides: Partial<ControlPlan["plan"]> & { data: ControlPlan["plan"]["data"] },
): ControlPlan["plan"] {
  return {
    view: "day",
    anchor: TODAY,
    setView: vi.fn(),
    prev: vi.fn(),
    next: vi.fn(),
    today: vi.fn(),
    todayDisabled: true,
    label: "11-11 周三",
    openDay: vi.fn(),
    showWeek: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
}

const card: ControlPlan["card"] = {
  view: { headline: "h", rows: [] },
  onAction: vi.fn(),
  onAskBrief: vi.fn(),
  busy: false,
  error: null,
  extract: null,
  older: null,
};

describe("planbookProps", () => {
  it("日视图：day 就位、anchor 是今天 → showCard", () => {
    const data: PlanbookResult = { view: "day", day: day(TODAY) };
    const props = planbookProps(
      plan({ data: { status: "ready", value: data } }),
      card,
      "明天：周四 · 主攻日",
      TODAY,
    );
    expect(props.view).toBe("day");
    expect(props.state).toBe("ready");
    expect(props.day?.date).toBe(TODAY);
    expect(props.week).toBeNull();
    expect(props.month).toBeNull();
    expect(props.showCard).toBe(true);
    expect(props.tomorrow).toBe("明天：周四 · 主攻日");
  });

  it("日视图看的不是今天：showCard=false", () => {
    const data: PlanbookResult = { view: "day", day: day("2026-11-13") };
    const props = planbookProps(
      plan({ anchor: "2026-11-13", data: { status: "ready", value: data } }),
      card,
      null,
      TODAY,
    );
    expect(props.showCard).toBe(false);
    expect(props.day?.date).toBe("2026-11-13");
  });

  it("周视图：week 就位", () => {
    const data: PlanbookResult = { view: "week", week: week() };
    const props = planbookProps(
      plan({ view: "week", data: { status: "ready", value: data } }),
      card,
      null,
      TODAY,
    );
    expect(props.state).toBe("ready");
    expect(props.week?.cycle).toBe("C1");
    expect(props.showCard).toBe(false);
  });

  it("月视图：month 就位", () => {
    const days = [day(TODAY), day("2026-11-12")];
    const data: PlanbookResult = { view: "month", month: "2026-11", days };
    const props = planbookProps(
      plan({ view: "month", data: { status: "ready", value: data } }),
      card,
      null,
      TODAY,
    );
    expect(props.state).toBe("ready");
    expect(props.month).toHaveLength(2);
  });

  it("loading：state=loading、视图模型为空", () => {
    const props = planbookProps(plan({ data: { status: "loading" } }), card, null, TODAY);
    expect(props.state).toBe("loading");
    expect(props.day).toBeNull();
    expect(props.error).toBeNull();
  });

  it("error：state=error、带出错误消息", () => {
    const props = planbookProps(
      plan({ data: { status: "error", code: "script-failed", message: "读取知识库失败。" } }),
      card,
      null,
      TODAY,
    );
    expect(props.state).toBe("error");
    expect(props.error).toBe("读取知识库失败。");
  });

  it("结果与请求视图不一致时不把旧视图模型交出去", () => {
    const data: PlanbookResult = { view: "week", week: week() };
    const props = planbookProps(
      plan({ view: "day", data: { status: "ready", value: data } }),
      card,
      null,
      TODAY,
    );
    expect(props.day).toBeNull();
    expect(props.week).toBeNull();
  });
});
