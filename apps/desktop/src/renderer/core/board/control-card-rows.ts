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
 * The `（course title）` an old-style 讲后读 title wraps around, or -1.
 *
 * The course title itself can hold balanced parens (「离散数学（Epp, 5th ed）」),
 * so the cut is the `（` whose matching `）` closes the string — not simply the
 * last `（`.
 */
function courseParen(body: string): number {
  if (!body.endsWith("）")) return body.indexOf("（");
  let depth = 0;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    const char = body[index];
    if (char === "）") depth += 1;
    else if (char === "（") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return body.indexOf("（");
}

/**
 * A calendar readingDue item's course slug and the label the course page's
 * 「- [ ] 讲后读 <label> · <date> 读」 line carries — or null when the item is
 * not a 讲后读 row (its slug carries `#讲后读-N`).
 *
 * The title now reads 「讲后读 · <范围> · <课名>」 (calendar.mjs), so the label is
 * the middle segment. Titles from before that change read
 * 「讲后读 <范围>（<课名>）」; they still parse, and their label keeps the wording
 * the course page's line was written with (「§1.1–1.4 核心页」) because the write
 * matches that line verbatim.
 */
export function afterReadEntry(item: {
  slug: string;
  title: string;
}): { slug: string; label: string } | null {
  const hash = item.slug.indexOf("#讲后读-");
  if (hash === -1) return null;
  const slug = item.slug.slice(0, hash);
  const body = item.title.startsWith("讲后读 ") ? item.title.slice("讲后读 ".length) : item.title;
  if (body.startsWith("· ")) {
    const range = body.slice(2);
    const cut = range.lastIndexOf(" · ");
    return { slug, label: (cut === -1 ? range : range.slice(0, cut)).trim() };
  }
  const cut = courseParen(body);
  return { slug, label: (cut === -1 ? body : body.slice(0, cut)).trim() };
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

/**
 * One bookshelf row. `prefix` names the slot (自读 · / 自读（计划外）·).
 *
 * A block already recorded today shows ✓ with the 摘几句 button; a book resumed
 * today shows the block without the button (it is tomorrow's); a block still
 * to read shows 「读完这段」 plus a sub line (第 n 天 · 晚了几天 · 讲后读重叠);
 * a finished book produces no row.
 */
function bookRow(prefix: string, book: ShelfBook): ControlCardRow | null {
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
  const parts = [card.shelfDay(book.position + 1, book.total)];
  if (book.coreOverlap !== null) parts.push(card.shelfCore(book.coreOverlap));
  return {
    group: "read",
    side: accompany(book.chunk),
    mark: "plan",
    text: prefix + card.shelfChunk(book.short, book.chunk),
    sub: parts.join(" · "),
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
    const row = bookRow(card.shelfPlanned, shelf.planned);
    if (row !== null) rows.push(row);
  }
  if (shelf.free !== null) {
    const row = bookRow(card.shelfFree, shelf.free);
    if (row !== null) rows.push(row);
  }
  return rows;
}
