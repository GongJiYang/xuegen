/**
 * Chicago reading panel behaviour.
 *
 * Pins the two F3 fixes: the chosen priority reaches `onAdd`, and the panel
 * lists the whole queue with a relative due tag (not only what is due today).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadingPanel } from "./reading-panel.js";
import type { ReadingPanelProps } from "../contract.js";
import type { ShelfPanelView } from "../../core/board/shelf-view.js";
import { strings } from "../../core/strings.js";

afterEach(cleanup);

function baseProps(overrides: Partial<ReadingPanelProps> = {}): ReadingPanelProps {
  return {
    tool: "reading",
    shelf: { status: "ready", value: { planned: null, queue: [], free: null } },
    queue: { status: "ready", value: [] },
    sources: { status: "ready", value: [] },
    onAdd: vi.fn(() => Promise.resolve(null)),
    onClip: vi.fn(),
    onReview: vi.fn(),
    onShelfCards: vi.fn(),
    ...overrides,
  };
}

describe("ReadingPanel", () => {
  it("passes the selected priority and 今天就读 due to onAdd", async () => {
    const onAdd = vi.fn(() => Promise.resolve({ title: "论文", due: "2026-11-04" }));
    render(<ReadingPanel {...baseProps({ onAdd })} />);
    const input = screen.getByRole("textbox", { name: strings.reading.addPlaceholder });
    await userEvent.click(screen.getByRole("radio", { name: strings.reading.priorityHigh }));
    await userEvent.type(input, "raw/paper.md");
    await userEvent.click(screen.getByRole("button", { name: strings.reading.add }));
    expect(onAdd).toHaveBeenCalledWith("raw/paper.md", "high", "today");
  });

  it("sends due=scheduled when 今天就读 is unchecked", async () => {
    const onAdd = vi.fn(() => Promise.resolve({ title: "论文", due: "2026-11-05" }));
    render(<ReadingPanel {...baseProps({ onAdd })} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /今天就读/ }));
    await userEvent.type(
      screen.getByRole("textbox", { name: strings.reading.addPlaceholder }),
      "raw/paper.md",
    );
    await userEvent.click(screen.getByRole("button", { name: strings.reading.add }));
    expect(onAdd).toHaveBeenCalledWith("raw/paper.md", "medium", "scheduled");
  });

  it("shows the added item's title and due date", async () => {
    const onAdd = vi.fn(() => Promise.resolve({ title: "论文导读", due: "2099-11-05" }));
    render(<ReadingPanel {...baseProps({ onAdd })} />);
    const input = screen.getByRole("textbox", { name: strings.reading.addPlaceholder });
    await userEvent.type(input, "raw/paper.md");
    await userEvent.click(screen.getByRole("button", { name: strings.reading.add }));
    await waitFor(() => expect(screen.getByText(/已加入：论文导读/)).toBeTruthy());
  });

  it("asks where the reader got to before recording 下次接着读", async () => {
    const onReview = vi.fn();
    render(
      <ReadingPanel
        {...baseProps({
          onReview,
          queue: {
            status: "ready",
            value: [
              {
                slug: "a",
                title: "文章",
                priority: "medium",
                due: "2099-11-05",
                position: "",
                status: "queued",
              },
            ],
          },
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: strings.reading.next }));
    // The review is not sent until the position is confirmed.
    expect(onReview).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole("textbox", { name: strings.reading.positionLabel }), "第 3 页");
    await userEvent.click(screen.getByRole("button", { name: strings.reading.positionSave }));
    expect(onReview).toHaveBeenCalledWith("a", "next", "第 3 页");
  });

  it("focuses the add field when opened via focus=reading-add", async () => {
    const onFocusHandled = vi.fn();
    render(<ReadingPanel {...baseProps({ focus: "reading-add", onFocusHandled })} />);
    const input = screen.getByRole("textbox", { name: strings.reading.addPlaceholder });
    expect(document.activeElement).toBe(input);
    expect(onFocusHandled).toHaveBeenCalled();
  });

  it("lists the whole queue with due tags, not only today's items", () => {
    render(
      <ReadingPanel
        {...baseProps({
          queue: {
            status: "ready",
            value: [
              {
                slug: "a",
                title: "已逾期",
                priority: "high",
                due: "2020-01-01",
                position: "",
                status: "queued",
              },
              {
                slug: "b",
                title: "全年",
                priority: "medium",
                due: "2099-11-05",
                position: "",
                status: "queued",
              },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText("已逾期")).toBeTruthy();
    expect(screen.getByText("全年")).toBeTruthy();
    expect(screen.getByText(strings.reading.queueCaption(1, 2))).toBeTruthy();
  });

  it("shows a 书房 book's title and its 「做成卡」 button", async () => {
    const onShelfCards = vi.fn();
    const shelf: ShelfPanelView = {
      planned: {
        slug: "epp",
        title: "Discrete Mathematics with Applications",
        short: "Epp",
        position: 1,
        total: 81,
        progress: 1 / 81,
        end: "2027-01-28",
        next: strings.reading.shelfToday("Ch1 §1.1–1.4 · pp.10–18"),
        later: [],
        coreRead: [],
        extracts: [{ page: 16, text: "乙", carded: null }],
        pending: 1,
      },
      queue: [],
      free: null,
    };
    render(<ReadingPanel {...baseProps({ shelf: { status: "ready", value: shelf }, onShelfCards })} />);
    expect(screen.getByText(shelf.planned?.title ?? "")).toBeTruthy();
    const button = screen.getByRole("button", { name: strings.reading.shelfCards(1) });
    await userEvent.click(button);
    expect(onShelfCards).toHaveBeenCalledWith("epp");
  });
});
