/**
 * The 书房 section of the reading panel.
 *
 * Source: `shelf.list` (`bookshelf.mjs list --json` → `ShelfListItem[]`), the
 * same book rows the CLI prints. Pure functions only — `today` is injected so
 * this module never reads the clock, matching the board's other view models;
 * the skins only render what comes out of {@link shelfPanel}.
 */

import type { ShelfListItem, ShelfUpcoming } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

export interface ShelfBookView {
  slug: string;
  title: string;
  short: string;
  position: number;
  total: number;
  /** 0–1 for the progress bar. */
  progress: number;
  end: string;
  /** 「今天：Ch1 §1.1–1.4 · pp.10–18」 or 「下一段 11-10：…」, null when finished. */
  next: string | null;
  /** The rest of `upcoming` as 「11-11 · Ch1 … · pp.19–27」. */
  later: string[];
  coreRead: { pages: string; label: string; date: string }[];
  extracts: { page: number; text: string; carded: string | null }[];
  /** How many extracts are still 「#待做卡」. */
  pending: number;
}

export interface ShelfQueued {
  slug: string;
  title: string;
  total: number;
  after: string | null;
  end: string;
}

export interface ShelfPanelView {
  planned: ShelfBookView | null;
  queue: ShelfQueued[];
  free: ShelfBookView | null;
}

// Same UTC day math as `skills/reading/bookshelf.mjs`'s `addDays`.
function addDays(date: string, n: number): string {
  const time = Date.parse(`${date}T00:00:00Z`);
  return new Date(time + n * 86400000).toISOString().slice(0, 10);
}

function chunkText(row: ShelfUpcoming): string {
  return `${row.title} · pp.${row.from}–${row.to}`;
}

function bookView(item: ShelfListItem, today: string): ShelfBookView {
  const first = item.upcoming[0];
  const extracts = item.extracts.map(({ page, text, carded }) => ({ page, text, carded }));
  return {
    slug: item.slug,
    title: item.title,
    short: item.short,
    position: item.position,
    total: item.total,
    progress: item.total > 0 ? item.position / item.total : 0,
    end: item.end,
    next:
      first === undefined
        ? null
        : first.date === today
          ? strings.reading.shelfToday(chunkText(first))
          : strings.reading.shelfNextOn(first.date.slice(5), chunkText(first)),
    later: item.upcoming
      .slice(1)
      .map((row) => `${row.date.slice(5)} · ${row.title} · pp.${row.from}–${row.to}`),
    coreRead: item.coreRead
      .map(({ pages, label, date }) => ({ pages, label, date }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    extracts,
    pending: extracts.filter((extract) => extract.carded === null).length,
  };
}

export function shelfPanel(list: ShelfListItem[], today: string): ShelfPanelView {
  const plannedItem = list.find((item) => item.slot === "planned" && item.status === "reading") ?? null;
  const freeItem = list.find((item) => item.slot === "free" && item.status === "reading") ?? null;
  const planned = plannedItem === null ? null : bookView(plannedItem, today);

  // Queue order follows `order` (null last); each book starts the day after the
  // previous one's projected end, or after the in-progress book's — today when
  // nothing is being read.
  const queue: ShelfQueued[] = [];
  let start = planned === null ? today : addDays(planned.end, 1);
  let after = planned?.short ?? null;
  const queued = list
    .filter((item) => item.slot === "planned" && item.status === "queued")
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
  for (const item of queued) {
    const end = addDays(start, item.total - 1);
    queue.push({ slug: item.slug, title: item.title, total: item.total, after, end });
    after = item.short;
    start = addDays(end, 1);
  }

  return { planned, queue, free: freeItem === null ? null : bookView(freeItem, today) };
}
