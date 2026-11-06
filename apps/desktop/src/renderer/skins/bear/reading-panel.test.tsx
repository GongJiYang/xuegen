/**
 * Bear 阅读 panel: the 今天该读 / 之后 split, recording the reading position
 * on Enter, adding a vault path or clipping a URL, and the `/加入阅读` focus
 * request.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadingPanel } from "./reading-panel.js";
import type { ReadingPanelProps } from "../contract.js";
import type { ReadingItem } from "@shared/data-protocol.js";
import { dateKey } from "../../core/board/use-calendar.js";
import { strings } from "../../core/strings.js";
import { SAMPLE_PANELS } from "../../gallery/panel-samples.js";

afterEach(cleanup);

function baseProps(overrides: Partial<ReadingPanelProps> = {}): ReadingPanelProps {
  return { tool: "reading", ...SAMPLE_PANELS.reading, ...overrides };
}

const today = dateKey(new Date());
const inThreeDays = new Date();
inThreeDays.setDate(inThreeDays.getDate() + 3);

const A: ReadingItem = {
  slug: "ctm-ch2",
  title: "CTM 第 2 章",
  priority: "high",
  due: today,
  position: "",
  status: "active",
};
const B: ReadingItem = {
  slug: "jepa",
  title: "JEPA 论文",
  priority: "medium",
  due: dateKey(inThreeDays),
  position: "",
  status: "queued",
};

function queue(...items: ReadingItem[]): ReadingPanelProps["queue"] {
  return { status: "ready", value: items };
}

describe("Bear 阅读 panel", () => {
  it("splits the queue into 今天该读 and 之后", () => {
    render(<ReadingPanel {...baseProps({ queue: queue(A, B) })} />);
    expect(screen.getByText(A.title)).toBeTruthy();
    expect(screen.getByText(B.title)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: strings.reading.done })).toHaveLength(1);
  });

  it("records where you stopped on Enter", async () => {
    const onReview = vi.fn();
    render(<ReadingPanel {...baseProps({ queue: queue(A), onReview })} />);
    await userEvent.click(screen.getByRole("button", { name: strings.reading.readOn }));
    await userEvent.type(screen.getByLabelText(strings.reading.positionLabel), "第 4 节{Enter}");
    expect(onReview).toHaveBeenCalledWith(A.slug, "next", "第 4 节");
  });

  it("adds a vault path and clips a URL", async () => {
    const onAdd = vi.fn().mockResolvedValue(null);
    const onClip = vi.fn();
    render(<ReadingPanel {...baseProps({ onAdd, onClip })} />);
    const field = screen.getByLabelText(strings.reading.addCaption);
    await userEvent.type(field, "raw/x.md{Enter}");
    expect(onAdd).toHaveBeenCalledWith("raw/x.md", "medium", "today");
    await userEvent.type(field, "https://a.b/c");
    await userEvent.click(screen.getByRole("button", { name: strings.reading.clip }));
    expect(onClip).toHaveBeenCalledWith("https://a.b/c", "medium", "today");
  });

  it("focuses the add field when asked", () => {
    const onFocusHandled = vi.fn();
    render(<ReadingPanel {...baseProps({ focus: "reading-add", onFocusHandled })} />);
    expect(document.activeElement).toBe(screen.getByLabelText(strings.reading.addCaption));
    expect(onFocusHandled).toHaveBeenCalledTimes(1);
  });
});
