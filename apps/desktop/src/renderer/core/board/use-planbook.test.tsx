// usePlanbook 的测试：假 client 按 kind 回答，断各视图的请求形状与结果。
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { CycleDayType, CycleMonth, CycleSlot } from "@shared/data-protocol.js";
import { setTodayOverride } from "../today.js";
import type { AsyncState } from "./state.js";
import { usePlanbook, type PlanbookResult, type PlanbookView } from "./use-planbook.js";

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
    // 第 4 周跨到 12 月：11-27（周五）起。
    "2026-11-27": slot("整合", 4),
    "2026-11-28": slot("低强度", 4),
    "2026-11-29": slot("休息", 4),
    "2026-11-30": slot("深度", 4),
  },
  lessons: {
    "2026-11-11": [{ course: "discrete-math", id: "D3", content: "Ch2 有效论证", done: true }],
  },
  names: { "discrete-math": "离散" },
  subjects: { "discrete-math": "离散" },
  roles: { "discrete-math": "main" },
  cycles: [{ cycle: "C1", start: "2026-11-06", end: "2026-12-24" }],
  recovery: [],
};

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
        return ok({ running: true, due: [{ deck: "离散", count: 7 }] });
      default:
        return Promise.resolve({ ok: false, code: "script-failed", error: `unexpected ${request.kind}` });
    }
  });
}

function Harness({
  view,
  anchor,
  seen,
}: {
  view: PlanbookView;
  anchor: string;
  seen: (state: AsyncState<PlanbookResult>) => void;
}) {
  const resource = usePlanbook(view, anchor);
  useEffect(() => {
    seen(resource.state);
  }, [resource.state, seen]);
  return null;
}

async function renderHook(view: PlanbookView, anchor: string): Promise<AsyncState<PlanbookResult>> {
  const states: AsyncState<PlanbookResult>[] = [];
  await act(async () => {
    render(<Harness view={view} anchor={anchor} seen={(state) => states.push(state)} />);
    // Let the loader's promise chain settle.
    await Promise.resolve();
  });
  const last = states.at(-1);
  if (last === undefined) throw new Error("no state emitted");
  return last;
}

function requests(kind: string): { kind: string; from?: string; to?: string; month?: string }[] {
  return clientMock.data.mock.calls
    .map(([request]) => request as { kind: string })
    .filter((request) => request.kind === kind);
}

describe("usePlanbook", () => {
  beforeEach(() => {
    setTodayOverride(TODAY);
    mockClient();
  });
  afterEach(() => {
    setTodayOverride(null);
    clientMock.data.mockReset();
  });

  it("week：拉整周的两端月份 + 带范围的 shelf.list，组装成 PlanWeek", async () => {
    const state = await renderHook("week", TODAY);
    expect(state.status).toBe("ready");
    if (state.status !== "ready" || state.value.view !== "week") throw new Error("not a week result");
    expect(state.value.week.start).toBe("2026-11-06");
    expect(state.value.week.end).toBe("2026-11-12");
    expect(state.value.week.cycle).toBe("C1");
    expect(requests("shelf.list")).toEqual([{ kind: "shelf.list", from: "2026-11-06", to: "2026-11-12" }]);
    expect(requests("cycle.month")).toEqual([{ kind: "cycle.month", month: "2026-11" }]);
    expect(requests("cycle.overview")).toHaveLength(1);
    expect(requests("courses.list")).toHaveLength(1);
    expect(requests("anki.status")).toHaveLength(1);
  });

  it("day：shelf.list 范围缩到那一天；不拉 overview / courses", async () => {
    const state = await renderHook("day", TODAY);
    expect(state.status).toBe("ready");
    if (state.status !== "ready" || state.value.view !== "day") throw new Error("not a day result");
    expect(state.value.day.date).toBe(TODAY);
    expect(state.value.day.ankiDue).toBe(7);
    expect(state.value.day.items[0]?.text).toBe("离散 D3 · Ch2 有效论证");
    expect(requests("shelf.list")).toEqual([{ kind: "shelf.list", from: TODAY, to: TODAY }]);
    expect(requests("cycle.overview")).toHaveLength(0);
    expect(requests("courses.list")).toHaveLength(0);
  });

  it("month：只拉那一个月的 cycle.month", async () => {
    const state = await renderHook("month", TODAY);
    expect(state.status).toBe("ready");
    if (state.status !== "ready" || state.value.view !== "month") throw new Error("not a month result");
    expect(state.value.days).toHaveLength(30);
    expect(requests("cycle.month")).toEqual([{ kind: "cycle.month", month: "2026-11" }]);
    expect(requests("shelf.list")).toHaveLength(0);
    expect(requests("anki.status")).toHaveLength(0);
  });

  it("跨月的周：两个月各拉一次 cycle.month 与 calendar.month", async () => {
    await renderHook("week", "2026-11-30");
    expect(requests("shelf.list")).toEqual([{ kind: "shelf.list", from: "2026-11-27", to: "2026-12-03" }]);
    expect(requests("cycle.month").map((request) => request.month)).toEqual(["2026-11", "2026-12"]);
    expect(requests("calendar.month").map((request) => request.month)).toEqual(["2026-11", "2026-12"]);
  });

  it("周跨月、复盘窗口又落到下下个月时，多拉一个月（只是补复盘日期）", async () => {
    // 一个周二起的周期：第 4 周 11-24…11-30 全在 11 月，复盘窗口 12-01…12-07 落在 12 月。
    const tuesdayCycle: CycleMonth = {
      ...CYCLE_NOV,
      days: { "2026-11-30": slot("深度", 4) },
      cycles: [{ cycle: "C1", start: "2026-11-03", end: "2026-12-21" }],
    };
    clientMock.data.mockImplementation((request: { kind: string; month?: string }) => {
      const ok = (data: unknown) => Promise.resolve({ ok: true, data });
      if (request.kind === "cycle.month") return ok(request.month === "2026-11" ? tuesdayCycle : emptyCycle(request.month ?? ""));
      if (request.kind === "calendar.month") return ok({ month: request.month, days: {} });
      if (request.kind === "shelf.list") return ok([]);
      if (request.kind === "cycle.overview") return ok({ date: TODAY, route: null, cycle: null, courses: [] });
      if (request.kind === "courses.list") return ok([]);
      return ok({ running: true, due: [] });
    });
    const state = await renderHook("week", "2026-11-30");
    if (state.status !== "ready" || state.value.view !== "week") throw new Error("not a week result");
    expect(state.value.week.end).toBe("2026-11-30");
    // 11-30 那一周只跨 11 月；复盘窗口落到 12 月，多拉一次 2026-12。
    expect(requests("cycle.month").map((request) => request.month)).toEqual(["2026-11", "2026-12"]);
  });

  it("数据通道失败时 state 是 error", async () => {
    clientMock.data.mockImplementation(() =>
      Promise.resolve({ ok: false, code: "script-failed", error: "boom" }),
    );
    const state = await renderHook("week", TODAY);
    expect(state.status).toBe("error");
  });
});
