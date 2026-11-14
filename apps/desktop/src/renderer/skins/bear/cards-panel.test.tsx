/**
 * Bear 卡片 panel: the Anki status line, the extracts call-to-action, the deck
 * list, and the folding new-card form.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardsPanel } from "./cards-panel.js";
import type { CardsPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { SAMPLE_PANELS } from "../../gallery/panel-samples.js";

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

function baseProps(overrides: Partial<CardsPanelProps> = {}): CardsPanelProps {
  return { ...SAMPLE_PANELS.cards, tool: "cards", ...overrides };
}

describe("Bear 卡片 panel", () => {
  it("shows Anki connected with today's reviews, or 重试 when closed", async () => {
    const { unmount } = render(
      <CardsPanel
        {...baseProps({ anki: { status: "ready", value: { running: true, reviewedToday: 7 } } })}
      />,
    );
    expect(screen.getByText(strings.cards.ankiRunning)).toBeTruthy();
    expect(screen.getByText(strings.cards.reviewedTodayCount(7))).toBeTruthy();
    unmount();

    const onRetryAnki = vi.fn();
    render(
      <CardsPanel {...baseProps({ anki: { status: "ready", value: { running: false } }, onRetryAnki })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: strings.cards.retry }));
    expect(onRetryAnki).toHaveBeenCalledTimes(1);
  });

  it("offers 让学根起草 only when extracts are waiting", async () => {
    const sample = SAMPLE_PANELS.cards.cards;
    if (sample.status !== "ready") throw new Error("sample cards are not ready");
    const onDraft = vi.fn();
    const { unmount } = render(
      <CardsPanel
        {...baseProps({
          cards: { status: "ready", value: { ...sample.value, pendingExtracts: 2 } },
          onDraft,
        })}
      />,
    );
    expect(screen.getByText(strings.cards.extractsCount(2))).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: strings.cards.draft }));
    expect(onDraft).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <CardsPanel
        {...baseProps({ cards: { status: "ready", value: { ...sample.value, pendingExtracts: 0 } } })}
      />,
    );
    expect(screen.queryByRole("button", { name: strings.cards.draft })).toBeNull();
  });

  it("lists each deck with its unsynced count and due-today when Anki runs", () => {
    render(
      <CardsPanel
        {...baseProps({
          cards: {
            status: "ready",
            value: {
              total: 15,
              unsynced: 3,
              broken: 0,
              decks: [
                { deck: "DP", total: 10, unsynced: 3, files: [] },
                { deck: "SRE", total: 5, unsynced: 0, files: [] },
              ],
              pendingExtracts: 0,
            },
          },
          anki: {
            status: "ready",
            value: { running: true, reviewedToday: 0, due: [{ deck: "DP", count: 4 }] },
          },
        })}
      />,
    );
    expect(screen.getByText("DP")).toBeTruthy();
    expect(screen.getByText(strings.cards.unsyncedCount(3))).toBeTruthy();
    expect(screen.getByText(strings.cards.allSynced)).toBeTruthy();
    expect(screen.getByText(strings.cards.dueTodayCount(4))).toBeTruthy();
  });

  it("saves a new card only when deck, front and back are filled", async () => {
    const sample = SAMPLE_PANELS.cards.cards;
    if (sample.status !== "ready" || !sample.value.decks[0]) throw new Error("sample cards are not ready");
    const firstDeck = sample.value.decks[0].deck;
    const onAdd = vi.fn();
    render(<CardsPanel {...baseProps({ onAdd })} />);

    await userEvent.click(screen.getByRole("button", { name: strings.cards.newCard }));
    const addButton = screen.getByRole("button", { name: strings.cards.add });
    expect(addButton).toHaveProperty("disabled", true);
    await userEvent.type(screen.getByLabelText(strings.cards.frontLabel), "Q");
    await userEvent.type(screen.getByLabelText(strings.cards.backLabel), "A");
    expect(addButton).toHaveProperty("disabled", false);
    await userEvent.click(addButton);
    expect(onAdd).toHaveBeenCalledWith(firstDeck, "Q", "A");
    expect(screen.getByText(strings.cards.saved(firstDeck))).toBeTruthy();
  });
});
