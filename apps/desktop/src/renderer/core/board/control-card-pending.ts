/**
 * The undo windows and the 摘几句 input of the 总控 今日卡.
 *
 * Each function takes the finished card and returns a copy with the rows the
 * 10-second undo window (or an already-saved extract) applies to; the card
 * itself stays a pure value, so `control-card.ts` re-exports these names.
 */

import { strings } from "../strings.js";
import type { ControlCardView } from "./control-card.js";

/**
 * The row whose 「读完了」 is waiting out its undo window: ✓ and 「撤销 · N」.
 *
 * `pending` matches a row by slug and labels (the same ones the write will use).
 * A null pending leaves the view untouched.
 */
export function withPendingRead(
  view: ControlCardView,
  pending: { slug: string; labels: string[]; left: number } | null,
): ControlCardView {
  if (pending === null) return view;
  return {
    ...view,
    rows: view.rows.map((row) =>
      row.action?.kind === "afterRead" &&
      row.action.slug === pending.slug &&
      row.action.labels.join("\n") === pending.labels.join("\n")
        ? {
            ...row,
            mark: "done" as const,
            sub: strings.control.card.shelfPendingSub,
            side: null,
            button: strings.control.card.undo(pending.left),
            action: { kind: "undoRead" as const },
            hint: null,
          }
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
            ...row,
            side: null,
            mark: "done" as const,
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
