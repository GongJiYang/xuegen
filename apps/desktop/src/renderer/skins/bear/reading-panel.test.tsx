/**
 * Bear 阅读 panel: the 今天该读 / 之后 split, recording the reading position
 * on Enter, adding a vault path or clipping a URL, and the `/加入阅读` focus
 * request.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadingPanel } from "./reading-panel.js";
import type { ReadingPanelProps } from "../contract.js";
import type { ReadingItem } from "@shared/data-protocol.js";
import { shelfPanel, type ShelfPanelView } from "../../core/board/shelf-view.js";
import { dateKey } from "../../core/board/use-calendar.js";
import { strings } from "../../core/strings.js";
import { SAMPLE_PANELS, SAMPLE_SHELF_LIST } from "../../gallery/panel-samples.js";

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

const EMPTY_SHELF: ShelfPanelView = { planned: null, queue: [], free: null };

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

describe("Bear 阅读 panel · 书房", () => {
  const ready = (value: ShelfPanelView): ReadingPanelProps["shelf"] => ({ status: "ready", value });
  const shelf = shelfPanel(SAMPLE_SHELF_LIST, "2026-11-11");

  it("shows the three 书房 sections of the sample shelf", () => {
    render(<ReadingPanel {...baseProps({ shelf: ready(shelf) })} />);

    // 计划内: the reading book's progress bar and its two meta lines.
    expect(screen.getByText(strings.reading.shelfPlanned)).toBeTruthy();
    const planned = screen.getByRole("progressbar");
    expect(planned.getAttribute("aria-valuenow")).toBe("1");
    expect(planned.getAttribute("aria-valuemax")).toBe("81");
    expect(screen.getByText(strings.reading.shelfMeta(1, 81, "2027-01-28"))).toBeTruthy();
    expect(screen.getByText(strings.reading.shelfToday("Ch1 §1.1–1.4 · pp.10–18"))).toBeTruthy();
    expect(screen.getByText(strings.reading.shelfLater)).toBeTruthy();
    expect(screen.getByText("11-12 · Ch1 §1.5–1.8 · pp.19–27")).toBeTruthy();
    expect(screen.getByText(strings.reading.shelfCore)).toBeTruthy();
    expect(
      screen.getByText(strings.reading.shelfCoreLine("12–15", "§1.3 变量与量化", "2026-11-09")),
    ).toBeTruthy();
    // Extracts: 3 lines, 2 still 待做卡, one already carded.
    expect(screen.getByText(strings.reading.shelfExtracts(3, 2))).toBeTruthy();
    // The carded tag sits after a " · " inside the extract line's span.
    expect(screen.getByText(`· ${strings.reading.shelfCarded("2026-11-09")}`)).toBeTruthy();
    expect(screen.getAllByText(new RegExp(`· ${strings.reading.shelfPending}$`))).toHaveLength(2);

    // 排队: the queued CTM with its chained start date.
    expect(screen.getByText(strings.reading.shelfQueue)).toBeTruthy();
    expect(screen.getByText(strings.reading.shelfQueued(79, "Epp", "2027-04-17"))).toBeTruthy();

    // 计划外: empty in the sample.
    expect(screen.getByText(strings.reading.shelfFree)).toBeTruthy();
    expect(screen.getByText(strings.reading.shelfFreeEmpty)).toBeTruthy();

    // The original 文章与摘录 half is still below it.
    expect(screen.getByText(strings.reading.shelfArticles)).toBeTruthy();
    expect(screen.getByText(strings.reading.scopeHint)).toBeTruthy();
  });

  it("turns 「把 2 句做成卡 →」 into onShelfCards(epp)", async () => {
    const onShelfCards = vi.fn();
    render(<ReadingPanel {...baseProps({ shelf: ready(shelf), onShelfCards })} />);
    await userEvent.click(screen.getByRole("button", { name: strings.reading.shelfCards(2) }));
    expect(onShelfCards).toHaveBeenCalledTimes(1);
    expect(onShelfCards).toHaveBeenCalledWith("epp");
  });

  it("hides the cards button once every extract is carded, and says FSRS takes over", () => {
    const carded = shelfPanel(
      [
        {
          ...SAMPLE_SHELF_LIST[0]!,
          extracts: [{ index: 1, page: 14, text: "甲", carded: "2026-11-09" }],
        },
      ],
      "2026-11-11",
    );
    render(<ReadingPanel {...baseProps({ shelf: ready(carded) })} />);
    expect(screen.getByText(strings.reading.shelfCardsDone)).toBeTruthy();
    expect(screen.queryByRole("button", { name: strings.reading.shelfCards(1) })).toBeNull();
    expect(screen.queryByText(strings.reading.shelfCardsHint)).toBeNull();
  });

  it("shows no 书房 heading at all when the shelf is empty", () => {
    render(<ReadingPanel {...baseProps({ shelf: ready(EMPTY_SHELF) })} />);
    expect(screen.queryByText(strings.reading.shelfPlanned)).toBeNull();
    expect(screen.queryByText(strings.reading.shelfQueue)).toBeNull();
    expect(screen.queryByText(strings.reading.shelfFree)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    // The 文章与摘录 half stays.
    expect(screen.getByText(strings.reading.shelfArticles)).toBeTruthy();
  });

  it("skips a section's heading when that section has nothing to show", () => {
    // A shelf with only a free book: no 计划内 heading, no 排队 heading, but the
    // free book itself and its 计划外 heading.
    const freeOnly = shelfPanel(
      [
        {
          ...SAMPLE_SHELF_LIST[0]!,
          slug: "sap",
          title: "Structure and Interpretation",
          short: "SICP",
          slot: "free",
          order: null,
        },
      ],
      "2026-11-11",
    );
    render(<ReadingPanel {...baseProps({ shelf: ready(freeOnly), queue: queue() })} />);
    expect(screen.queryByText(strings.reading.shelfPlanned)).toBeNull();
    expect(screen.queryByText(strings.reading.shelfQueue)).toBeNull();
    expect(screen.getByText(strings.reading.shelfFree)).toBeTruthy();
    expect(screen.getByText("Structure and Interpretation")).toBeTruthy();
  });

  it("renders one loading line while the shelf loads", () => {
    render(<ReadingPanel {...baseProps({ shelf: { status: "loading" } })} />);
    expect(screen.getByText(strings.today.loading)).toBeTruthy();
    expect(screen.queryByText(strings.reading.shelfPlanned)).toBeNull();
  });

  it("renders the shelf error as one alert", () => {
    render(
      <ReadingPanel
        {...baseProps({ shelf: { status: "error", code: "script-failed", message: "读取书房失败。" } })}
      />,
    );
    const alert = within(screen.getByRole("alert"));
    expect(alert.getByText("读取书房失败。")).toBeTruthy();
    expect(screen.queryByText(strings.reading.shelfPlanned)).toBeNull();
  });
});
