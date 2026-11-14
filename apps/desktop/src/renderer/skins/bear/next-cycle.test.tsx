import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { NextCycleView, NextCycleWizardView } from "../contract.js";
import { strings } from "../../core/strings.js";
import { NextCycleBanner, NextCycleWizard } from "./next-cycle.js";

afterEach(cleanup);

function wizard(step: number, overrides: Partial<NextCycleWizardView> = {}): NextCycleWizardView {
  return {
    title: "开下一周期 · C2",
    meta: "C1 · 11-06 – 12-24",
    steps: strings.nextCycle.steps("C1"),
    step,
    state: "ready",
    error: null,
    accept: {
      rows: [
        {
          slug: "ctm",
          name: "CTM",
          met: false,
          lessons: "课次 12 / 14 · 还差 D13、D14",
          goalsLine: "目标 0 / 1 核实",
          goals: [{ text: "概念图", done: false }],
        },
      ],
      shortfall: "recover",
      options: [
        { value: "recover", label: "用恢复周补齐", meta: "C2 晚一周开始" },
        { value: "partial", label: "先开 C2", meta: "C1 记「部分完成」" },
      ],
      onShortfall: vi.fn(),
    },
    mains: { caption: "C2 的主项", options: [], onToggle: vi.fn() },
    materials: { groups: [] },
    shelf: { options: [], onToggle: vi.fn(), note: "" },
    preview: {
      caption: "C2 第 1 周预览 · 12-30 起",
      state: "ready",
      cells: [{ date: "2026-12-30", label: "三 12-30", main: "数据结构", aux: null, deep: true }],
    },
    canNext: true,
    onBack: vi.fn(),
    onNext: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

const view = (open: NextCycleWizardView | null, banner: string | null = null): NextCycleView => ({
  banner,
  onOpen: vi.fn(),
  wizard: open,
});

describe("Bear 开下一周期", () => {
  it("the banner opens the wizard and hides outside the last week", () => {
    const shown = view(null, "C1 最后一周 · 整合日做完周期验收后，就可以排 C2");
    render(<NextCycleBanner view={shown} />);
    fireEvent.click(screen.getByRole("button", { name: strings.nextCycle.open }));
    expect(shown.onOpen).toHaveBeenCalled();
    cleanup();
    const { container } = render(<NextCycleBanner view={view(null)} />);
    expect(container.textContent).toBe("");
  });

  it("step 1 lists each course and asks how to handle the shortfall", () => {
    const open = wizard(0);
    render(<NextCycleWizard view={view(open)} />);
    expect(screen.getByRole("dialog", { name: "开下一周期 · C2" })).toBeTruthy();
    expect(screen.getByText("课次 12 / 14 · 还差 D13、D14 · 目标 0 / 1 核实")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /先开 C2/ }));
    expect(open.accept.onShortfall).toHaveBeenCalledWith("partial");
    fireEvent.click(screen.getByRole("button", { name: strings.nextCycle.cancel }));
    expect(open.onBack).toHaveBeenCalled();
  });

  it("the last step shows the week and submits to 总控", () => {
    const open = wizard(4);
    render(<NextCycleWizard view={view(open)} />);
    expect(screen.getByText("三 12-30")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: strings.nextCycle.submit }));
    expect(open.onNext).toHaveBeenCalled();
  });

  it("an error replaces the step and blocks 下一步", () => {
    render(<NextCycleWizard view={view(wizard(0, { error: strings.nextCycle.noNext, canNext: false }))} />);
    expect(screen.getByRole("alert").textContent).toBe(strings.nextCycle.noNext);
    expect((screen.getByRole("button", { name: strings.nextCycle.next }) as HTMLButtonElement).disabled).toBe(true);
  });
});
