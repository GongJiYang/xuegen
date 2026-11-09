/**
 * The 总控 今日卡: what today holds, from local data only.
 *
 * Rows come from the cycle day (lessons, missed lessons), the calendar month
 * (讲后读 rows the course pages schedule), the bookshelf (书房在读的书), and
 * the reading queue — never from a model call, so the card is on screen the
 * instant the 总控 session opens. Pure: today and every input are arguments.
 */

import type { CalendarMonth, CycleDay, ReadingQueueItem, ShelfBook, ShelfToday } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import { cycleHeadline, cycleName, tomorrowLine } from "./cycle-today.js";

export type ControlCardMark = "now" | "warn" | "plan" | "faint" | "done";

export type ControlCardAction =
  | { kind: "study"; slug: string }
  | { kind: "verify"; slug: string }
  | { kind: "read" }
  | { kind: "anki" }
  | { kind: "afterRead"; slug: string; label: string }
  | { kind: "undoRead" }
  | { kind: "shelfDone"; slug: string }
  | { kind: "undoShelf" }
  | { kind: "extract"; slug: string; pages: string };

export interface ControlCardRow {
  mark: ControlCardMark;
  text: string;
  /** Grey supplementary text at the row's tail (「第 2 / 81 天 · 晚了 1 天…」), or null/absent. */
  sub?: string | null;
  button: string | null;
  action: ControlCardAction | null;
  /** Hover text spelling out what the button changes, or null. */
  hint: string | null;
}

export interface ControlCardView {
  headline: string;
  rows: ControlCardRow[];
}

/**
 * The `（course title）` a 讲后读 row's `（label）` is wrapped in, or -1.
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
 */
function afterReadEntry(item: { slug: string; title: string }): { slug: string; label: string } | null {
  const hash = item.slug.indexOf("#讲后读-");
  if (hash === -1) return null;
  const body = item.title.startsWith("讲后读 ") ? item.title.slice("讲后读 ".length) : item.title;
  const cut = courseParen(body);
  const label = (cut === -1 ? body : body.slice(0, cut)).trim();
  return { slug: item.slug.slice(0, hash), label };
}

/** The 读书 row: due is `YYYY-MM-DD`; an empty `due` is unscheduled, not due. */
function readingDue(item: ReadingQueueItem, today: string): boolean {
  return item.due !== "" && item.due <= today;
}

/**
 * One bookshelf row. `prefix` names the slot (读书 · / 自由读 ·).
 *
 * A block already recorded today shows ✓ with the 摘几句 button; a block still
 * to read shows 「读完这段」 plus a sub line (第 n 天 · 晚了几天 · 讲后读重叠);
 * a finished book produces no row.
 */
function bookRow(prefix: string, book: ShelfBook): ControlCardRow | null {
  const card = strings.control.card;
  if (book.doneToday && book.doneChunk !== null) {
    return {
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
  const parts = [card.shelfDay(book.position + 1, book.total)];
  if (book.late > 0) parts.push(card.shelfLate(book.late, book.end));
  if (book.coreOverlap !== null) parts.push(card.shelfCore(book.coreOverlap));
  return {
    mark: book.late > 0 ? "warn" : "plan",
    text: prefix + card.shelfChunk(book.short, book.chunk),
    sub: parts.join(" · "),
    button: card.shelfDone,
    action: { kind: "shelfDone", slug: book.slug },
    hint: card.shelfDoneHint,
  };
}

/** The 书房 rows: the planned and the free book, plus an empty-free hint line. */
function shelfRows(shelf: ShelfToday): ControlCardRow[] {
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
  if (shelf.planned !== null && shelf.free === null) {
    rows.push({
      mark: "plan",
      text: card.shelfFreeEmpty,
      sub: card.shelfFreeEmptySub,
      button: null,
      action: null,
      hint: null,
    });
  }
  return rows;
}

/**
 * The card for one cycle day, or null outside every cycle.
 *
 * `tomorrow` feeds the rest day's single faint line (「明天：…」); pass null or
 * omit it and the line falls back to 「休息，不排任务」.
 */
export function controlCard(input: {
  /** `YYYY-MM-DD` of today. */
  today: string;
  /** Today's place in the cycle (`cycle.day`), or null while loading. */
  day: CycleDay | null;
  /** Tomorrow's place in the cycle, for the rest day's 「明天：…」 line. */
  tomorrow?: CycleDay | null;
  /** The calendar month containing today (`calendar.month`), or null. */
  calendar: CalendarMonth | null;
  /** The whole reading queue (`reading.queue`). */
  queue: ReadingQueueItem[];
  /** `shelf.today`: the books the 书房 is currently reading. */
  shelf?: ShelfToday | null;
}): ControlCardView | null {
  const { today, day, calendar, queue } = input;
  if (day === null || day.cycle === null) return null;
  const card = strings.control.card;
  const head = cycleHeadline(day);
  const headline = head === null ? day.cycle : `${day.cycle} · ${head}`;

  if (day.type === "休息" && day.lessons.length === 0) {
    const text = (input.tomorrow ? tomorrowLine(input.tomorrow) : null) ?? strings.plan.restItem;
    // Reading happens every day, rest days included (per the learner).
    const rest = { mark: "faint" as const, text, button: null, action: null, hint: null };
    return { headline, rows: [rest, ...(input.shelf ? shelfRows(input.shelf) : [])] };
  }

  const rows: ControlCardRow[] = [];
  for (const lesson of day.lessons) {
    if (day.roles[lesson.course] === "aux") continue;
    rows.push({
      mark: "now",
      text: `${cycleName(day, lesson.course)} ${lesson.id} · ${lesson.content}`,
      button: card.study,
      action: { kind: "study", slug: lesson.course },
      hint: card.studyHint,
    });
  }
  for (const lesson of day.lessons) {
    if (day.roles[lesson.course] !== "aux") continue;
    rows.push({
      mark: "plan",
      text: `${card.auxPrefix}${cycleName(day, lesson.course)} ${lesson.id} · ${lesson.content}`,
      button: card.study,
      action: { kind: "study", slug: lesson.course },
      hint: card.studyHint,
    });
  }
  if (day.type === "整合") {
    for (const [slug, role] of Object.entries(day.roles)) {
      if (role !== "main") continue;
      rows.push({
        mark: "now",
        text: card.verifyRow(cycleName(day, slug)),
        button: card.verify,
        action: { kind: "verify", slug },
        hint: card.verifyHint,
      });
    }
  }
  for (const lesson of day.overdue) {
    rows.push({
      mark: "warn",
      text: card.missedRow(cycleName(day, lesson.course), lesson.id, lesson.date),
      button: card.study,
      action: { kind: "study", slug: lesson.course },
      hint: card.studyHint,
    });
  }
  if (calendar !== null) {
    for (const date of Object.keys(calendar.days).sort()) {
      if (date > today) continue;
      for (const item of calendar.days[date]?.readingDue ?? []) {
        const entry = afterReadEntry(item);
        if (entry === null) continue;
        rows.push({
          mark: date < today ? "warn" : "plan",
          text: date < today ? `${item.title}${card.afterReadDue(date)}` : item.title,
          button: card.afterRead,
          action: { kind: "afterRead", slug: entry.slug, label: entry.label },
          hint: card.afterReadHint,
        });
      }
    }
  }
  if (input.shelf) rows.push(...shelfRows(input.shelf));
  for (const item of queue) {
    if (!readingDue(item, today)) continue;
    rows.push({
      mark: day.type === "低强度" ? "now" : "plan",
      text: card.readRow(item.title, item.position),
      button: card.read,
      action: { kind: "read" },
      hint: null,
    });
  }
  if (day.type !== "休息") {
    rows.push({ mark: "plan", text: "Anki", button: card.anki, action: { kind: "anki" }, hint: null });
  }
  return { headline, rows };
}

/**
 * The row whose 「读完了」 is waiting out its undo window: ✓ and 「撤销 · N」.
 *
 * `pending` matches a row by slug and label (the same pair the write will use).
 * A null pending leaves the view untouched.
 */
export function withPendingRead(
  view: ControlCardView,
  pending: { slug: string; label: string; left: number } | null,
): ControlCardView {
  if (pending === null) return view;
  return {
    ...view,
    rows: view.rows.map((row) =>
      row.action?.kind === "afterRead" && row.action.slug === pending.slug && row.action.label === pending.label
        ? { mark: "done" as const, text: row.text, button: strings.control.card.undo(pending.left), action: { kind: "undoRead" as const }, hint: null }
        : row,
    ),
  };
}

/**
 * The 书房 row whose 「读完这段」 is waiting out its undo window: ✓ + 「已记下」
 * sub + a 「撤销 · N」 button. A null pending leaves the view untouched.
 */
export function withPendingShelf(
  view: ControlCardView,
  pending: { slug: string; left: number } | null,
): ControlCardView {
  if (pending === null) return view;
  const card = strings.control.card;
  return {
    ...view,
    rows: view.rows.map((row) =>
      row.action?.kind === "shelfDone" && row.action.slug === pending.slug
        ? {
            mark: "done" as const,
            text: row.text,
            sub: card.shelfPendingSub,
            button: card.undo(pending.left),
            action: { kind: "undoShelf" as const },
            hint: null,
          }
        : row,
    ),
  };
}

/** Append 「· 摘了 N 句」 to the sub of each 摘几句 row the session already saved into. */
export function withExtractCount(view: ControlCardView, counts: Record<string, number>): ControlCardView {
  return {
    ...view,
    rows: view.rows.map((row) => {
      if (row.action?.kind !== "extract") return row;
      const count = counts[row.action.slug] ?? 0;
      if (count <= 0) return row;
      return { ...row, sub: `${row.sub ?? ""} · ${strings.control.card.extracted(count)}` };
    }),
  };
}

/** The 「页码」 field of the 摘几句 form: `p.11`, `p 11` or `11`, in 1–99999; else null. */
export function parsePageInput(text: string): number | null {
  const match = text.trim().match(/^(?:p\.?\s*)?(\d{1,5})$/i);
  if (match === null) return null;
  const page = Number(match[1]);
  return page >= 1 && page <= 99999 ? page : null;
}

