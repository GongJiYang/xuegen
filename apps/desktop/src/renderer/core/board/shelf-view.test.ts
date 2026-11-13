/**
 * The 书房 view model: which book is being read, how the schedule reads, and
 * how the queue's finish dates chain. `today` is injected, so every expectation
 * below is a fixed date rather than "whenever the test runs".
 */

import { describe, expect, it } from "vitest";
import type { ShelfListItem } from "@shared/data-protocol.js";
import { shelfPanel } from "./shelf-view.js";
import { strings } from "../strings.js";

const TODAY = "2026-11-11";

/** One shelf row; the tests only override what they are about. */
function book(overrides: Partial<ShelfListItem> & { slug: string }): ShelfListItem {
  return {
    title: `《${overrides.slug}》`,
    short: overrides.slug.toUpperCase(),
    slot: "planned",
    order: 1,
    status: "reading",
    total: 10,
    position: 0,
    started: "2026-11-09",
    end: "2026-11-19",
    target: null,
    targetLate: null,
    extracts: [],
    coreRead: [],
    upcoming: [],
    ...overrides,
  };
}

/** Upcoming blocks `count` days apart from `first`, ten pages each. */
function upcoming(first: string, count: number, title = "Ch1"): ShelfListItem["upcoming"] {
  const start = Date.parse(`${first}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start + index * 86400000).toISOString().slice(0, 10);
    return { index: index + 1, date, title, from: index * 10 + 1, to: index * 10 + 10 };
  });
}

describe("shelfPanel: the reading-book slots", () => {
  it("takes the planned and free books that are 在读, and turns position/total into progress", () => {
    const panel = shelfPanel(
      [
        book({ slug: "done-book", status: "done", position: 10 }),
        book({ slug: "free-book", slot: "free", position: 3, total: 12 }),
        book({ slug: "epp", position: 1, total: 81 }),
      ],
      TODAY,
    );
    expect(panel.planned?.slug).toBe("epp");
    expect(panel.planned?.progress).toBeCloseTo(1 / 81);
    expect(panel.free?.slug).toBe("free-book");
    expect(panel.free?.progress).toBeCloseTo(3 / 12);
  });

  it("returns 0 progress for a book with no blocks yet, instead of dividing by zero", () => {
    const panel = shelfPanel([book({ slug: "epp", position: 0, total: 0 })], TODAY);
    expect(panel.planned?.progress).toBe(0);
  });

  it("labels today's block with 「今天：」 when the first upcoming date is today", () => {
    const panel = shelfPanel([book({ slug: "epp", upcoming: upcoming(TODAY, 2, "Ch1 §1.1–1.4") })], TODAY);
    expect(panel.planned?.next).toBe(strings.reading.shelfToday("Ch1 §1.1–1.4 · pp.1–10"));
  });

  it("otherwise labels it 「下一段 MM-DD：」 with the block's own date", () => {
    const panel = shelfPanel([book({ slug: "epp", upcoming: upcoming("2026-11-12", 1, "Ch1") })], TODAY);
    expect(panel.planned?.next).toBe(strings.reading.shelfNextOn("11-12", "Ch1 · pp.1–10"));
  });

  it("has no next line for a finished book, and keeps the rest as 「接下来几天」", () => {
    const panel = shelfPanel([book({ slug: "epp", upcoming: [] })], TODAY);
    expect(panel.planned?.next).toBeNull();
    expect(panel.planned?.later).toEqual([]);

    const withRest = shelfPanel([book({ slug: "epp", upcoming: upcoming("2026-11-12", 3, "Ch2") })], TODAY);
    expect(withRest.planned?.later).toEqual(["11-13 · Ch2 · pp.11–20", "11-14 · Ch2 · pp.21–30"]);
  });

  it("lists 核心页已读 newest first and drops the course slug", () => {
    const panel = shelfPanel(
      [
        book({
          slug: "epp",
          coreRead: [
            { pages: "3–5", course: "discrete-math", label: "§1.1", date: "2026-11-06" },
            { pages: "12–15", course: "discrete-math", label: "§1.3", date: "2026-11-09" },
          ],
        }),
      ],
      TODAY,
    );
    expect(panel.planned?.coreRead).toEqual([
      { pages: "12–15", label: "§1.3", date: "2026-11-09" },
      { pages: "3–5", label: "§1.1", date: "2026-11-06" },
    ]);
  });

  it("counts extracts still marked 待做卡 and drops their 序号", () => {
    const panel = shelfPanel(
      [
        book({
          slug: "epp",
          extracts: [
            { index: 1, page: 14, text: "甲", carded: "2026-11-09" },
            { index: 2, page: 16, text: "乙", carded: null },
            { index: 3, page: 17, text: "丙", carded: null },
          ],
        }),
      ],
      TODAY,
    );
    expect(panel.planned?.extracts).toEqual([
      { page: 14, text: "甲", carded: "2026-11-09" },
      { page: 16, text: "乙", carded: null },
      { page: 17, text: "丙", carded: null },
    ]);
    expect(panel.planned?.pending).toBe(2);
  });
});

describe("shelfPanel: the queue", () => {
  it("chains three queued books: each starts the day after the previous projected end", () => {
    const panel = shelfPanel(
      [
        book({ slug: "epp", short: "Epp", end: "2027-01-28", total: 81 }),
        book({ slug: "b1", order: 1, status: "queued", short: "B1", total: 5, end: "" }),
        book({ slug: "b2", order: 2, status: "queued", short: "B2", total: 10, end: "" }),
        book({ slug: "b3", order: 3, status: "queued", short: "B3", total: 4, end: "" }),
      ],
      TODAY,
    );
    expect(panel.queue).toEqual([
      { slug: "b1", title: "《b1》", total: 5, after: "Epp", end: "2027-02-02" },
      { slug: "b2", title: "《b2》", total: 10, after: "B1", end: "2027-02-12" },
      { slug: "b3", title: "《b3》", total: 4, after: "B2", end: "2027-02-16" },
    ]);
  });

  it("starts from today when nothing is being read", () => {
    const panel = shelfPanel([book({ slug: "b1", status: "queued", short: "B1", total: 10 })], TODAY);
    expect(panel.planned).toBeNull();
    expect(panel.queue).toEqual([{ slug: "b1", title: "《b1》", total: 10, after: null, end: "2026-11-20" }]);
  });

  it("sorts by order and puts books without one last", () => {
    const panel = shelfPanel(
      [
        book({ slug: "third", order: null, status: "queued", total: 10 }),
        book({ slug: "first", order: 2, status: "queued", total: 10 }),
        book({ slug: "second", order: 1, status: "queued", total: 10 }),
      ],
      TODAY,
    );
    expect(panel.queue.map((entry) => entry.slug)).toEqual(["second", "first", "third"]);
    expect(panel.queue).toHaveLength(3);
    expect(panel.queue[2]?.after).toBe("FIRST");
  });

  it("ignores queued free books and done books", () => {
    const panel = shelfPanel(
      [
        book({ slug: "free-queued", slot: "free", status: "queued" }),
        book({ slug: "done-book", status: "done", position: 10 }),
      ],
      TODAY,
    );
    expect(panel.queue).toEqual([]);
    expect(panel.planned).toBeNull();
    expect(panel.free).toBeNull();
  });

  it("returns planned/free null and an empty queue for an empty shelf", () => {
    expect(shelfPanel([], TODAY)).toEqual({ planned: null, queue: [], free: null });
  });
});
