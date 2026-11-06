/**
 * Bear 总进度 v4 (design `?d=progress4`): the cycle line, one subject block
 * per main subject with lesson cards, the 已学完 fold (finished courses are
 * never course rows) and the aux rows.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProgressPanel } from "./progress-panel.js";
import type { ProgressPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { SAMPLE_GROUPS, SAMPLE_OVERVIEW, SAMPLE_PANELS } from "../../gallery/panel-samples.js";

afterEach(cleanup);

// jsdom has no Web Animations API; the accordion's motion content calls
// `element.animate` when a row opens, so give it a cancellable stub.
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

function baseProps(overrides: Partial<ProgressPanelProps> = {}): ProgressPanelProps {
  return {
    ...SAMPLE_PANELS.progress,
    tool: "progress",
    groups: SAMPLE_GROUPS,
    overview: { status: "ready", value: SAMPLE_OVERVIEW },
    ...overrides,
  };
}

describe("Bear 总进度 v4", () => {
  it("shows the route end, the cycle line and each subject's class days", () => {
    render(<ProgressPanel {...baseProps()} />);
    expect(screen.getByText("2028 年 7 月 20 日")).toBeTruthy();
    expect(screen.getByText("C1", { selector: ".bear-p4-cid" })).toBeTruthy();
    expect(screen.getByText("11-06 → 12-24（周四）· 还剩 48 天")).toBeTruthy();
    expect(screen.getByText("周一 · 周三")).toBeTruthy();
    expect(screen.getAllByText("周二 · 周四").length).toBeGreaterThan(0);
  });

  it("keeps finished courses out of the course cards until the 已学完 fold opens", async () => {
    const user = userEvent.setup();
    render(<ProgressPanel {...baseProps()} />);
    expect(screen.queryByText("编程范式")).toBeNull();
    await user.click(screen.getByRole("button", { name: new RegExp(`^${strings.plan.finished(1)}`) }));
    expect(screen.getByText("编程范式")).toBeTruthy();
  });

  it("opens the first card and lists every lesson after 全部", async () => {
    const user = userEvent.setup();
    render(<ProgressPanel {...baseProps()} />);
    expect(screen.getByText("D2")).toBeTruthy();
    expect(screen.queryByText("D4")).toBeNull();
    await user.click(screen.getByRole("button", { name: strings.plan.allLessons(15) }));
    expect(screen.getByText("D4")).toBeTruthy();
  });

  it("opens the 改计划 input inside a card", async () => {
    const user = userEvent.setup();
    render(<ProgressPanel {...baseProps()} />);
    await user.click(screen.getByRole("button", { name: strings.progress.editPlan }));
    expect(screen.getByLabelText(strings.progress.editPlan)).toBeTruthy();
  });
});
