/**
 * Bear 总控 right column cards (总控 v3 ①): the result comes first — the answer
 * or 改了 N 处 plus the moves — and what the user said drops to a small grey
 * one-line 「你：…」 under it, so a glance at the column reads as outcomes.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ControlFeedView } from "../contract.js";
import type { ActivityCard } from "../../core/board/activity-feed.js";
import { strings } from "../../core/strings.js";
import { ControlFeed } from "./control-feed.js";

afterEach(cleanup);

function card(overrides: Partial<ActivityCard>): ActivityCard {
  return {
    id: "turn-1",
    ask: "",
    summary: null,
    changes: null,
    undo: null,
    steps: 0,
    doing: null,
    busy: false,
    failed: false,
    messages: [],
    ...overrides,
  };
}

function renderFeed(cards: ActivityCard[]): HTMLElement {
  const feed: ControlFeedView = {
    cards,
    caption: "",
    onShowAnswer: vi.fn(),
    onShowInWeek: vi.fn(),
    onUndo: vi.fn(),
    reader: null,
    readerNav: null,
    onCloseReader: vi.fn(),
  };
  const { container } = render(<ControlFeed feed={feed} older={null} renderMessage={() => null} />);
  const element = container.querySelector(".bear-feed-card");
  if (element === null) throw new Error("no card rendered");
  return element as HTMLElement;
}

describe("Bear 动态卡：结果在先", () => {
  it("a plain answer is the first paragraph; 「你：…」 follows it in small grey type", () => {
    const element = renderFeed([
      card({ ask: "D5 现在排在哪天？", summary: "D5 排在 11-19（周四）", changes: [], busy: false }),
    ]);
    const paragraphs = element.querySelectorAll("p");
    expect(paragraphs[0]?.textContent).toBe("D5 排在 11-19（周四）");
    expect(paragraphs[1]?.textContent).toBe(`${strings.feed.askPrefix}D5 现在排在哪天？`);
    expect(paragraphs[1]?.className).toContain("bear-feed-ask");
    expect(paragraphs[1]?.getAttribute("title")).toBe("D5 现在排在哪天？");
  });

  it("a turn that moved the schedule shows 改了 1 处 and the moves before the ask, the ask before the buttons", () => {
    const element = renderFeed([
      card({
        ask: "把离散 D5 从 11-18 挪到 11-19",
        summary: "挪好了",
        changes: ["离散 D5 11-18 → 11-19"],
        busy: false,
      }),
    ]);
    const paragraphs = [...element.querySelectorAll("p")];
    expect(paragraphs[0]?.className).toContain("bear-feed-res");
    expect(paragraphs[0]?.textContent).toContain("改了 1 处");
    const children = [...element.children];
    const listAt = children.findIndex((child) => child.classList.contains("bear-feed-changes"));
    const askAt = children.findIndex((child) => child.classList.contains("bear-feed-ask"));
    const actsAt = children.findIndex((child) => child.classList.contains("bear-feed-acts"));
    expect(listAt).toBeGreaterThan(-1);
    expect(askAt).toBeGreaterThan(listAt);
    expect(actsAt).toBeGreaterThan(askAt);
  });

  it("a running turn shows 正在回答 first and still keeps the ask", () => {
    const element = renderFeed([
      card({ ask: "D5 现在排在哪天？", summary: null, changes: [], busy: true, steps: 1 }),
    ]);
    const paragraphs = [...element.querySelectorAll("p")];
    expect(paragraphs[0]?.className).toContain("bear-feed-busy");
    const ask = element.querySelector(".bear-feed-ask");
    expect(ask?.textContent).toBe(`${strings.feed.askPrefix}D5 现在排在哪天？`);
  });

  it("a turn without an ask draws no ask line", () => {
    const element = renderFeed([card({ ask: "", summary: "D5 排在 11-19（周四）", changes: [] })]);
    expect(element.querySelector(".bear-feed-ask")).toBeNull();
  });

  it("says 已撤销 on a card without changes once its undo succeeded", () => {
    const element = renderFeed([
      card({
        ask: "自己报了 D3",
        summary: "D3 标成做完了",
        changes: [],
        undo: { status: "undone", error: null },
      }),
    ]);
    expect(element.querySelector(".bear-feed-undone")?.textContent).toBe(strings.planChanges.undone);
    expect(element.textContent).toContain("D3 标成做完了");
  });
});
