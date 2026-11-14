/**
 * Bear 今天 panel: plan lists, empty lines, inline `code`, and the resume
 * button label.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TodayPanel } from "./today-panel.js";
import type { TodayPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { SAMPLE_COURSES, SAMPLE_CYCLE_DAY, SAMPLE_PANELS } from "../../gallery/panel-samples.js";

afterEach(cleanup);

// jsdom has no Web Animations API; the sliding numbers and the accordion used
// by neighbouring panels call `element.animate`, so give it a cancellable stub.
if (typeof Element.prototype.animate !== "function") {
  Element.prototype.animate = vi.fn(() => ({
    cancel: vi.fn(),
    finish: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    finished: Promise.resolve(),
  })) as unknown as Element["animate"];
  Element.prototype.getAnimations = vi.fn(() => []) as unknown as Element["getAnimations"];
}

function baseProps(overrides: Partial<TodayPanelProps> = {}): TodayPanelProps {
  return { ...SAMPLE_PANELS.today, ...overrides };
}

describe("Bear 今天 panel", () => {
  it("shows the loading line while the cycle day is loading", () => {
    render(<TodayPanel {...baseProps({ cycleToday: { status: "loading" } })} />);
    expect(screen.getByText(strings.today.loading)).toBeTruthy();
    expect(screen.queryByText(strings.today.todayPlan)).toBeNull();
  });

  it("lists today's and tomorrow's plan rows", () => {
    render(<TodayPanel {...baseProps()} />);
    for (const item of [...SAMPLE_PANELS.today.todayPlan, ...SAMPLE_PANELS.today.tomorrowPlan]) {
      expect(screen.getAllByText(item.label).length).toBeGreaterThan(0);
    }
  });

  it("shows the empty lines when a day has nothing", () => {
    render(<TodayPanel {...baseProps({ todayPlan: [], tomorrowPlan: [] })} />);
    expect(screen.getByText(strings.today.todayPlanEmpty)).toBeTruthy();
    expect(screen.getByText(strings.today.tomorrowPlanEmpty)).toBeTruthy();
  });

  it("renders backticks in a plan detail as code", () => {
    const { container } = render(
      <TodayPanel {...baseProps({ todayPlan: [{ kind: "plan", label: "课", detail: "`@deco` 是缩写" }] })} />,
    );
    expect(container.querySelector("code")?.textContent).toBe("@deco");
  });

  it("labels the resume button 回到这门课 when the course was opened today", async () => {
    const courses = SAMPLE_PANELS.progress.courses;
    if (courses.status !== "ready" || !courses.value[0]) throw new Error("sample courses are not ready");
    const course = courses.value[0];
    const onResume = vi.fn();
    render(
      <TodayPanel
        {...baseProps({
          resume: { course, nextSession: course.nextSession },
          startedToday: { [course.slug]: true },
          agentReady: true,
          onResume,
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: strings.today.backToCourse }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("leads a cycle day with the carried lesson, the missed lesson and the Anki row", async () => {
    const onStudyCourse = vi.fn();
    render(
      <TodayPanel
        {...baseProps({ cycleToday: { status: "ready", value: SAMPLE_CYCLE_DAY }, onStudyCourse })}
      />,
    );
    expect(screen.getByText("第 1 周 · 周三 · 主攻日")).toBeTruthy();
    expect(screen.getByText("离散 D2")).toBeTruthy();
    expect(screen.getByText(strings.cycle.carried("2026-11-09"))).toBeTruthy();
    expect(screen.getByText(strings.cycle.missed("CTM", "D1"))).toBeTruthy();
    expect(screen.getByText(strings.cycle.anki)).toBeTruthy();
    expect(screen.queryByText(strings.today.todayPlan)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: strings.cycle.start }));
    expect(onStudyCourse).toHaveBeenCalledWith("discrete-math-epp");
  });

  it("lists each cycle course's 本周 count on a 整合 day and opens its 周核实", async () => {
    const onVerifyCourse = vi.fn();
    const friday = {
      ...SAMPLE_CYCLE_DAY,
      date: "2026-11-13",
      weekday: "周五",
      week: 2,
      type: "整合" as const,
      course: null,
      lessons: [],
      overdue: [],
    };
    render(<TodayPanel {...baseProps({ cycleToday: { status: "ready", value: friday }, onVerifyCourse })} />);
    const ctm = SAMPLE_COURSES.find((course) => course.slug === "ctm");
    if (!ctm) throw new Error("sample has no ctm course");
    expect(screen.getByText(strings.cycle.verifyRow("CTM", ctm.week.done, ctm.week.total))).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: strings.cycle.verify }));
    expect(onVerifyCourse).toHaveBeenCalledWith("ctm");
  });

  it("shows only 休息 on a rest day, without the Anki row", () => {
    const sunday = {
      ...SAMPLE_CYCLE_DAY,
      date: "2026-11-15",
      weekday: "周日",
      week: 2,
      type: "休息" as const,
      course: null,
      lessons: [],
      overdue: [],
    };
    render(<TodayPanel {...baseProps({ cycleToday: { status: "ready", value: sunday } })} />);
    expect(screen.getByText(strings.cycle.rest)).toBeTruthy();
    expect(screen.queryByText(strings.cycle.anki)).toBeNull();
  });

  it("turns today's focus lesson into ✓ + 回到这节课 → once its 完成： line exists", async () => {
    const onStudyCourse = vi.fn();
    const done = {
      ...SAMPLE_CYCLE_DAY,
      lessons: [
        { course: "discrete-math-epp", id: "D3", content: "Ch2 §2.3：有效论证、推理规则、谬误", done: true },
      ],
      overdue: [],
    };
    render(<TodayPanel {...baseProps({ cycleToday: { status: "ready", value: done }, onStudyCourse })} />);
    expect(screen.getByText("✓")).toBeTruthy();
    expect(screen.queryByText(strings.cycle.start)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: strings.progress.backToCourse }));
    expect(onStudyCourse).toHaveBeenCalledWith("discrete-math-epp");
  });

  it("turns today's 带读 lesson into ✓ + 回到这节课 → once its 完成： line exists", async () => {
    const onStudyCourse = vi.fn();
    const done = {
      ...SAMPLE_CYCLE_DAY,
      names: { ...SAMPLE_CYCLE_DAY.names, "effective-c": "Effective C" },
      roles: { ...SAMPLE_CYCLE_DAY.roles, "effective-c": "aux" as const },
      lessons: [
        { course: "effective-c", id: "D1", content: "Ch1 起步", done: true },
        { course: "discrete-math-epp", id: "D3", content: "Ch2 §2.3：有效论证、推理规则、谬误", done: true },
      ],
      overdue: [],
    };
    render(<TodayPanel {...baseProps({ cycleToday: { status: "ready", value: done }, onStudyCourse })} />);
    // Both the focus row and the 带读 row read as done.
    expect(screen.getAllByText("✓").length).toBe(2);
    expect(screen.queryByText(strings.cycle.start)).toBeNull();
    const buttons = screen.getAllByRole("button", { name: strings.today.backToCourse });
    await userEvent.click(buttons[1]!);
    expect(onStudyCourse).toHaveBeenCalledWith("effective-c");
  });

  it("opens 总控 from the cycle view", async () => {
    const onOpenControl = vi.fn();
    render(
      <TodayPanel
        {...baseProps({ cycleToday: { status: "ready", value: SAMPLE_CYCLE_DAY }, onOpenControl })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: strings.control.open }));
    expect(onOpenControl).toHaveBeenCalledTimes(1);
  });
});
