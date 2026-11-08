/**
 * The 总控 今日卡: what today holds, from local data only.
 *
 * Rows come from the cycle day (lessons, missed lessons), the calendar month
 * (讲后读 rows the course pages schedule), and the reading queue — never from a
 * model call, so the card is on screen the instant the 总控 session opens.
 * Pure: today and every input are arguments.
 */

import type { CalendarMonth, CycleDay, ReadingQueueItem } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import { cycleHeadline, cycleName, tomorrowLine } from "./cycle-today.js";

export type ControlCardMark = "now" | "warn" | "plan" | "faint" | "done";

export type ControlCardAction =
  | { kind: "study"; slug: string }
  | { kind: "verify"; slug: string }
  | { kind: "read" }
  | { kind: "anki" }
  | { kind: "afterRead"; slug: string; label: string }
  | { kind: "undoRead" };

export interface ControlCardRow {
  mark: ControlCardMark;
  text: string;
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
}): ControlCardView | null {
  const { today, day, calendar, queue } = input;
  if (day === null || day.cycle === null) return null;
  const card = strings.control.card;
  const head = cycleHeadline(day);
  const headline = head === null ? day.cycle : `${day.cycle} · ${head}`;

  if (day.type === "休息" && day.lessons.length === 0) {
    const text = (input.tomorrow ? tomorrowLine(input.tomorrow) : null) ?? strings.plan.restItem;
    return { headline, rows: [{ mark: "faint", text, button: null, action: null, hint: null }] };
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

