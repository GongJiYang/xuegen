/**
 * Chicago 总控 今日卡: the classic black-and-white window chrome — a framed
 * box with a title row (headline + 「让总控说说」 button), the day's rows with
 * their marks, the foot line, and the failed-write error.
 */

import type { ControlCardProps } from "../contract.js";
import type { ControlCardMark } from "../../core/board/control-card.js";
import { strings } from "../../core/strings.js";

const MARK: Record<ControlCardMark, string> = { now: "●", warn: "!", plan: "○", faint: "◌", done: "✓" };

export function ControlCard({ view, onAction, onAskBrief, busy, error, older }: ControlCardProps) {
  return (
    <section className="chicago-cc" aria-label={view.headline}>
      <div className="chicago-cc-head">
        <span className="chicago-title">{view.headline}</span>
        <button type="button" className="chicago-btn" disabled={busy} onClick={onAskBrief}>
          {strings.control.card.askBrief}
        </button>
      </div>
      <ul className="chicago-cc-rows">
        {view.rows.map((row, index) => (
          <li key={index} data-mark={row.mark}>
            <span className="chicago-cc-mark" aria-hidden="true">
              {MARK[row.mark]}
            </span>
            <span className="chicago-cc-text">{row.text}</span>
            {row.button !== null && (
              <button type="button" className="chicago-btn" disabled={busy} title={row.hint ?? undefined} onClick={() => onAction(row)}>
                {row.button}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="chicago-cc-foot">{strings.control.card.foot}</div>
      {error && (
        <div className="chicago-cc-error" role="alert">
          {error}
        </div>
      )}
      {older && (
        <button type="button" className="chicago-btn chicago-cc-older" onClick={older.onToggle}>
          {older.label}
        </button>
      )}
    </section>
  );
}
