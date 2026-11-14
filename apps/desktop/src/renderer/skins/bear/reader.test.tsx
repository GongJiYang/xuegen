import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ControlFeedView } from "../contract.js";
import { strings } from "../../core/strings.js";
import { Reader } from "./reader.js";

afterEach(cleanup);

const feed = (nav: ControlFeedView["readerNav"]): ControlFeedView => ({
  cards: [],
  caption: "",
  onShowAnswer: vi.fn(),
  onShowInWeek: vi.fn(),
  onUndo: vi.fn(),
  reader: {
    title: "变量与三类陈述",
    sub: "概念页 · 离散 D1 · 11-07",
    messages: [{ id: "p", role: "assistant", markdown: "## Definition", streaming: false, toolCalls: [] }],
    loading: false,
    error: null,
    external: "obsidian://open?path=x",
    path: "/v/wiki/a.md",
  },
  readerNav: nav,
  onCloseReader: vi.fn(),
});

describe("Bear Reader", () => {
  it("a term page shows its lesson, and 上一个 / 下一个 (or ← →) walk the course's terms", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <Reader
        feed={feed({ position: "离散术语 2 / 5", onPrev, onNext })}
        renderMessage={(m) => <p>{m.markdown}</p>}
      />,
    );
    expect(screen.getByText("概念页 · 离散 D1 · 11-07")).toBeTruthy();
    expect(screen.getByText("离散术语 2 / 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: strings.feed.readerNext }));
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("the first term has no 上一个; an answer has no navigation at all", () => {
    const { rerender } = render(
      <Reader
        feed={feed({ position: "离散术语 1 / 5", onPrev: null, onNext: vi.fn() })}
        renderMessage={() => null}
      />,
    );
    expect(
      (screen.getByRole("button", { name: strings.feed.readerPrev }) as HTMLButtonElement).disabled,
    ).toBe(true);
    rerender(<Reader feed={feed(null)} renderMessage={() => null} />);
    expect(screen.queryByRole("button", { name: strings.feed.readerNext })).toBeNull();
  });
});
