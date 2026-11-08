/**
 * Bare 总控 今日卡: the same semantic structure every skin renders — headline
 * plus 「让总控说说」, one row per thing today holds (mark, text, button), the
 * foot line, and the failed-write error. No styles, no motion.
 */

import type { ControlCardProps } from "../contract.js";
import type { ControlCardMark } from "../../core/board/control-card.js";
import { strings } from "../../core/strings.js";

const MARK: Record<ControlCardMark, string> = { now: "●", warn: "!", plan: "○", faint: "◌", done: "✓" };

export function ControlCard({ view, onAction, onAskBrief, busy, error, older }: ControlCardProps) {
  return (
    <section data-slot="control-card" aria-label={view.headline}>
      <header>
        <h2>{view.headline}</h2>
        <button type="button" disabled={busy} onClick={onAskBrief}>
          {strings.control.card.askBrief}
        </button>
      </header>
      <ul>
        {view.rows.map((row, index) => (
          <li key={index} data-mark={row.mark}>
            <span aria-hidden="true">{MARK[row.mark]}</span>
            <span>{row.text}</span>
            {row.button !== null && (
              <button type="button" disabled={busy} title={row.hint ?? undefined} onClick={() => onAction(row)}>
                {row.button}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p>{strings.control.card.foot}</p>
      {error && <p role="alert">{error}</p>}
      {older && (
        <button type="button" onClick={older.onToggle}>
          {older.label}
        </button>
      )}
    </section>
  );
}
