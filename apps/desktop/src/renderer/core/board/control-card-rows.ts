/**
 * The reading side of the 总控 今日卡: 讲后读 (课后读) titles and rows, the 书房
 * rows, and the single 读书 queue row.
 *
 * Pure, like `control-card.ts` itself: every title, book and date is an
 * argument, and `control-card.ts` re-exports the names callers already import.
 */

import type { ReadingQueueItem, ShelfBook, ShelfToday } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import type { ControlCardRow } from "./control-card.js";

/**
 * A calendar readingDue item's course slug, the 课后读 label it shows, and the
 * book-page row 「读完了」 writes back to — or null when the item is not a
 * 讲后读 row (its slug carries `#讲后读-`) or lacks the `book`/`index` fields
 * the write needs.
 *
 * The title reads 「讲后读 · <标签> · <课程标题>」 (calendar.mjs), so the label
 * is the middle segment.
 */
export function afterReadEntry(item: {
  slug: string;
  title: string;
  book?: string;
  index?: number;
}): { slug: string; label: string; book: string; index: number } | null {
  const hash = item.slug.indexOf("#讲后读-");
  if (hash === -1 || item.book === undefined || item.index === undefined) return null;
  const body = item.title.startsWith("讲后读 · ") ? item.title.slice("讲后读 · ".length) : item.title;
  const cut = body.lastIndexOf(" · ");
  return {
    slug: item.slug.slice(0, hash),
    label: (cut === -1 ? body : body.slice(0, cut)).trim(),
    book: item.book,
    index: item.index,
  };
}

/** A 讲后读 calendar title as shown to the learner: 「课后读 · …」 (the data keeps 讲后读). */
export function afterReadTitle(title: string): string {
  if (title.startsWith("讲后读 · "))
    return `${strings.control.card.afterReadPrefix}${title.slice("讲后读 · ".length)}`;
  if (title.startsWith("讲后读 "))
    return `${strings.control.card.afterReadPrefix}${title.slice("讲后读 ".length)}`;
  return title;
}

/** The 读书 row: due is `YYYY-MM-DD`; an empty `due` is unscheduled, not due. */
export function readingDue(item: ReadingQueueItem, today: string): boolean {
  return item.due !== "" && item.due <= today;
}

/** The sub line of an unread 自读 block: 第 n / N 段, plus the 课后读 overlap note. */
function selfSub(book: ShelfBook): string {
  const card = strings.control.card;
  const parts = [card.shelfDay(book.position + 1, book.total)];
  if (book.coreOverlap !== null) parts.push(card.shelfCore(book.coreOverlap));
  return parts.join(" · ");
}

/** The sub line of an unread 导读 segment: 第 n / N 节, plus the minute limit when set. */
function guidedSub(book: ShelfBook): string {
  return strings.control.card.guidedSub(book.position + 1, book.total, book.limit);
}

/**
 * One bookshelf row. `prefix` names the slot (自读 · / 自读（计划外）· / 导读 ·),
 * `unreadSub` writes the sub line of a block still to read.
 *
 * A block already recorded today shows ✓ with the 摘几句 button; a book resumed
 * today shows the block without the button (it is tomorrow's); a block still
 * to read shows 「读完这段」 plus `unreadSub`; a finished book produces no row.
 */
function bookRow(prefix: string, book: ShelfBook, unreadSub: (book: ShelfBook) => string): ControlCardRow | null {
  const card = strings.control.card;
  const accompany = (chunk: { title: string; from: number; to: number }) => ({
    label: card.accompany,
    action: { kind: "accompany" as const, prompt: card.accompanyBookPrompt(book.title, book.slug, chunk) },
  });
  if (book.doneToday && book.doneChunk !== null) {
    return {
      group: "read",
      side: null,
      mark: "done",
      text: prefix + card.shelfChunk(book.short, book.doneChunk),
      sub: book.chunk !== null ? card.shelfDoneSub(book.chunk) : card.shelfFinished,
      button: card.extract,
      action: {
        kind: "extract",
        slug: book.slug,
        pages: `pp.${book.doneChunk.from}–${book.doneChunk.to}`,
      },
      hint: card.extractHint,
    };
  }
  if (book.chunk === null) return null;
  // 今天刚恢复：这一段明天才读，不给「读完这段」按钮。
  if (book.resumedToday) {
    return {
      group: "read",
      mark: "plan",
      text: prefix + card.shelfChunk(book.short, book.chunk),
      sub: card.shelfResumed,
      button: null,
      action: null,
      hint: null,
    };
  }
  // Neutral facts only (panel v2): no 「晚了 N 天」 — the 书房 block shows the dates.
  return {
    group: "read",
    side: accompany(book.chunk),
    mark: "plan",
    text: prefix + card.shelfChunk(book.short, book.chunk),
    sub: unreadSub(book),
    button: card.shelfDone,
    action: { kind: "shelfDone", slug: book.slug },
    hint: card.shelfDoneHint,
  };
}

/**
 * The 书房 rows: the planned and the free book.
 *
 * An empty 计划外 slot gets no row: whether to add another book is the learner's
 * decision, so the card does not nag about it.
 */
export function shelfRows(shelf: ShelfToday): ControlCardRow[] {
  const card = strings.control.card;
  const rows: ControlCardRow[] = [];
  if (shelf.planned !== null) {
    const row = bookRow(card.shelfPlanned, shelf.planned, selfSub);
    if (row !== null) rows.push(row);
  }
  if (shelf.free !== null) {
    const row = bookRow(card.shelfFree, shelf.free, selfSub);
    if (row !== null) rows.push(row);
  }
  return rows;
}

/**
 * The 导读 rows: the guided books due today, one row each. They sit in the
 * 阅读 group before 课后读 and mark done through the same `shelfDone` path.
 */
export function guidedRows(shelf: ShelfToday): ControlCardRow[] {
  const card = strings.control.card;
  const rows: ControlCardRow[] = [];
  for (const book of shelf.guided) {
    const row = bookRow(card.guidedPrefix, book, guidedSub);
    if (row !== null) rows.push(row);
  }
  return rows;
}
