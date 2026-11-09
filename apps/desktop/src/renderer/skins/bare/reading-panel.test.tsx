/**
 * Bare reading panel: the reference skin shows the 书房 books without any
 * styling. One test only — the contract test already renders it; this pins that
 * a book with pending extracts shows its title and the 「做成卡」 button.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReadingPanelProps } from "../contract.js";
import type { ShelfBookView } from "../../core/board/shelf-view.js";
import { strings } from "../../core/strings.js";
import { ReadingPanel } from "./panels.js";

afterEach(cleanup);

const BOOK: ShelfBookView = {
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
};

function baseProps(overrides: Partial<ReadingPanelProps> = {}): ReadingPanelProps {
  return {
    tool: "reading",
    shelf: { status: "ready", value: { planned: BOOK, queue: [], free: null } },
    queue: { status: "ready", value: [] },
    sources: { status: "ready", value: [] },
    onAdd: vi.fn(() => Promise.resolve(null)),
    onClip: vi.fn(),
    onReview: vi.fn(),
    onShelfCards: vi.fn(),
    ...overrides,
  };
}

describe("Bare reading panel · 书房", () => {
  it("shows the reading book's title and its 「做成卡」 button", () => {
    render(<ReadingPanel {...baseProps()} />);
    // Bare renders 「title · meta」 in one paragraph, so match the whole line.
    expect(screen.getByText(`${BOOK.title} · ${strings.reading.shelfMeta(1, 81, BOOK.end)}`)).toBeTruthy();
    expect(screen.getByText(BOOK.next ?? "")).toBeTruthy();
    expect(screen.getByRole("button", { name: strings.reading.shelfCards(1) })).toBeTruthy();
  });
});
