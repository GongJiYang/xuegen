/**
 * The 总控面板 view models (PANEL-PLAN, `docs/desktop/PANEL-PLAN.md`): the six
 * status tiles, the 书房 rows, and the unplanned-material list.
 *
 * Pure functions — `today` arrives as an argument, nothing here reads a clock or
 * makes a request. The day and week come in already built by `buildDay` /
 * `buildWeek`, and the Anki count comes from `ankiDueCount`, so the same fact is
 * never counted a second way. A null input means that channel is still reading:
 * the matching tile returns empty strings for the skin to draw a loading state.
 */

import type {
  AnkiStatus,
  CardsStats,
  CycleOverview,
  ShelfListItem,
  SubjectsOverview,
} from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import { ankiDueCount } from "./cycle-today.js";
import type { PlanDay, PlanWeek } from "./planbook.js";

export interface PanelTile {
  key: "cycle" | "today" | "week" | "shelf" | "anki" | "cards";
  value: string;
  sub: string;
  warn: boolean;
}

export interface PanelTilesInput {
  today: string;
  overview: CycleOverview | null;
  day: PlanDay | null;
  week: PlanWeek | null;
  shelf: ShelfListItem[] | null;
  anki: AnkiStatus | null;
  cards: CardsStats | null;
}

function loading(key: PanelTile["key"]): PanelTile {
  return { key, value: "", sub: "", warn: false };
}

function cycleTile(overview: CycleOverview | null): PanelTile {
  if (overview === null) return loading("cycle");
  const cycle = overview.cycle;
  if (cycle === null) return { key: "cycle", value: strings.panel.tileNoCycle, sub: "", warn: false };
  return {
    key: "cycle",
    value: strings.panel.tileCycle(cycle.cycle, cycle.week, cycle.weeks),
    sub: strings.panel.tileCycleSub(cycle.end, cycle.delayDays),
    warn: cycle.delayDays > 0,
  };
}

function todayTile(day: PlanDay | null): PanelTile {
  if (day === null) return loading("today");
  // `day.items` never holds an Anki row — the count lives in `day.ankiDue`.
  const done = day.items.filter((item) => item.mark === "done").length;
  const typeName = day.type === null ? "" : strings.cycle.dayType[day.type];
  const next = day.items.find((item) => item.lane === "main" && item.mark !== "done");
  const pending = day.items.some((item) => item.mark !== "done");
  const sub = next
    ? strings.panel.tileTodaySub(typeName, next.short)
    : pending
      ? typeName
      : strings.panel.tileAllDone;
  return { key: "today", value: strings.panel.tileItems(done, day.items.length), sub, warn: false };
}

function weekTile(week: PlanWeek | null): PanelTile {
  if (week === null) return loading("week");
  const items = week.days.flatMap((day) => day.items);
  const done = items.filter((item) => item.mark === "done").length;
  const warned = items.filter((item) => item.mark === "warn").length;
  return {
    key: "week",
    value: strings.panel.tileItems(done, items.length),
    sub: warned > 0 ? strings.panel.tileWeekWarn(warned) : "",
    warn: warned > 0,
  };
}

function shelfTile(shelf: ShelfListItem[] | null, overview: CycleOverview | null): PanelTile {
  if (shelf === null || overview === null) return loading("shelf");
  const reading = shelf.filter((item) => item.status === "reading").length;
  const guides = overview.courses.filter((course) => course.role === "aux").length;
  const latest = shelf
    .filter((item) => (item.targetLate ?? 0) > 0)
    .sort((left, right) => (right.targetLate ?? 0) - (left.targetLate ?? 0))[0];
  return {
    key: "shelf",
    value: strings.panel.tileShelf(reading + guides),
    sub: latest ? strings.panel.tileShelfLate(latest.short, latest.targetLate ?? 0) : "",
    warn: latest !== undefined,
  };
}

function ankiTile(anki: AnkiStatus | null): PanelTile {
  if (anki === null) return loading("anki");
  const due = ankiDueCount(anki);
  if (due === null) {
    return { key: "anki", value: strings.panel.tileAnkiOff, sub: strings.panel.tileAnkiOffSub, warn: false };
  }
  return { key: "anki", value: strings.panel.tileAnki(due), sub: strings.panel.tileAnkiSub, warn: false };
}

function cardsTile(cards: CardsStats | null): PanelTile {
  if (cards === null) return loading("cards");
  return {
    key: "cards",
    value: strings.panel.tileCards(cards.unsynced),
    sub:
      cards.broken > 0
        ? strings.panel.tileCardsBroken(cards.total, cards.broken)
        : strings.panel.tileCardsSub(cards.total, cards.decks.length),
    warn: cards.broken > 0,
  };
}

/** The six status tiles, in the order the 状态格 shows them. */
export function panelTiles(input: PanelTilesInput): PanelTile[] {
  return [
    cycleTile(input.overview),
    todayTile(input.day),
    weekTile(input.week),
    shelfTile(input.shelf, input.overview),
    ankiTile(input.anki),
    cardsTile(input.cards),
  ];
}

export interface ShelfRow {
  kind: "book" | "guide";
  slug: string;
  short: string;
  title: string;
  mode: "after-self" | "self" | "guide";
  done: number;
  total: number;
  unit: "段" | "节";
  meta: string;
  warn: boolean;
  status: "reading" | "paused" | "queued";
  target: string | null;
}

export interface ShelfRowsInput {
  today: string;
  shelf: ShelfListItem[];
  overview: CycleOverview;
  week: PlanWeek | null;
}

/** The queued book's predecessor in the planned queue: the occupying book (in
 * progress or paused), else the previous queued book — the chain `queueEnds`
 * projects onto. */
function queuedAfter(shelf: ShelfListItem[]): Map<string, string> {
  const planned = shelf
    .filter((item) => item.slot === "planned" && item.status !== "done")
    .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER));
  const after = new Map<string, string>();
  let previous = planned.find((item) => item.status === "reading" || item.status === "paused") ?? null;
  for (const item of planned.filter((book) => book.status === "queued")) {
    if (previous !== null) after.set(item.slug, previous.short);
    previous = item;
  }
  return after;
}

/** A shelf book still on the board — `done` books never get a row. */
type ShelfBook = ShelfListItem & { status: "reading" | "paused" | "queued" };

function bookRow(item: ShelfBook, afterSelf: boolean, after: Map<string, string>): ShelfRow {
  const warn = item.status === "reading" && (item.targetLate ?? 0) > 0;
  const meta =
    item.status === "paused"
      ? strings.panel.bookPaused(item.position)
      : item.status === "queued"
        ? strings.panel.bookQueued(after.get(item.slug) ?? null, item.end)
        : strings.panel.bookMeta(item.end, item.target, item.targetLate);
  return {
    kind: "book",
    slug: item.slug,
    short: item.short,
    title: item.title,
    mode: afterSelf ? "after-self" : "self",
    done: item.position,
    total: item.total,
    unit: "段",
    meta,
    warn,
    status: item.status,
    target: item.target,
  };
}

function guideRow(course: CycleOverview["courses"][number], overview: CycleOverview): ShelfRow {
  const days = overview.cycle?.subjectDays[course.subject] ?? [];
  return {
    kind: "guide",
    slug: course.slug,
    short: course.name,
    title: course.name,
    mode: "guide",
    done: course.done,
    total: course.total,
    unit: "节",
    meta: strings.panel.guideMeta(days, course.end ?? ""),
    warn: false,
    status: "reading",
    target: null,
  };
}

/**
 * The 书房 rows: reading books first, then the aux courses as 带读 rows, then
 * paused books, then the queue. A book is `after-self` when this week's plan
 * carries an 讲后读 lane for it, or it already has 讲后读 pages logged.
 */
export function shelfRows(input: ShelfRowsInput): ShelfRow[] {
  const after = queuedAfter(input.shelf);
  const afterLane = new Set(
    (input.week?.days ?? []).flatMap((day) =>
      day.items.flatMap((item) => (item.lane === "after" && item.slug !== null ? [item.slug] : [])),
    ),
  );
  const book = (item: ShelfBook): ShelfRow =>
    bookRow(item, afterLane.has(item.slug) || item.coreRead.length > 0, after);
  const guides = input.overview.courses
    .filter((course) => course.role === "aux")
    .map((course) => guideRow(course, input.overview));
  const books = input.shelf.filter((item): item is ShelfBook => item.status !== "done");
  return [
    ...books.filter((item) => item.status === "reading").map(book),
    ...guides,
    ...books.filter((item) => item.status === "paused").map(book),
    ...books.filter((item) => item.status === "queued").map(book),
  ];
}

export interface UnplannedMaterial {
  subject: string;
  subjectTitle: string;
  title: string;
  type: string;
  role: string;
}

/** Every material still marked ◌ (未制定计划), in subject order. */
/**
 * A material's book title for display: the title the page wrote, minus any
 * trailing parenthetical that opens with a source path in backticks
 * (「（`raw/…`）」, 「（`raw/…`，1312 页，…）」), which is a file note, not part of
 * the name.
 */
export function bookTitle(raw: string): string {
  return raw
    .replace(/\s*[（(]\s*`[^`]*`[^）)]*[）)]\s*$/, "")
    .replace(/\s*`[^`]*`\s*$/, "")
    .trim();
}

export function unplannedMaterials(subjects: SubjectsOverview): UnplannedMaterial[] {
  return subjects.subjects.flatMap((subject) =>
    subject.materials
      .filter((material) => material.mark === "none")
      .map((material) => ({
        subject: subject.slug,
        subjectTitle: subject.title,
 title: bookTitle(material.title),
        type: material.type,
        role: material.role,
      })),
  );
}
