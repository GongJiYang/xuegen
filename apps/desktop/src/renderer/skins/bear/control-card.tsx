/**
 * Bear 总控 今日卡 (design `?d=control`): a white card with a hairline border —
 * grey headline plus the 「让总控说说」 text button, then one row per thing today
 * holds (mark, text, button), the foot line, and the failed-write error. All
 * decisions come from `core/board/control-card`; only presentation lives here.
 */

import type { ControlCardProps } from "../contract.js";
import type { ControlCardMark } from "../../core/board/control-card.js";
import { strings } from "../../core/strings.js";

const MARK: Record<ControlCardMark, string> = { now: "●", warn: "!", plan: "○", faint: "◌", done: "✓" };

export function ControlCard({ view, onAction, onAskBrief, busy, error, older }: ControlCardProps) {
  return (
    <>
      <section className="bear-cc" aria-label={view.headline}>
        <div className="bear-cc-head">
          <span className="bear-cc-title">{view.headline}</span>
          <button type="button" className="bear-cc-ask" disabled={busy} onClick={onAskBrief}>
            {strings.control.card.askBrief}
          </button>
        </div>
        <ul className="bear-cc-rows">
          {view.rows.map((row, index) => (
            <li key={index} data-mark={row.mark}>
              <span className="bear-cc-mark" aria-hidden="true">
                {MARK[row.mark]}
              </span>
              <span className="bear-cc-text">{row.text}</span>
              {row.button !== null && (
                <button type="button" className="bear-cc-btn" disabled={busy} title={row.hint ?? undefined} onClick={() => onAction(row)}>
                  {row.button}
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="bear-cc-foot">{strings.control.card.foot}</p>
        {error && <p className="bear-cc-error">{error}</p>}
      </section>
      {older && (
        <button type="button" className="bear-cc-older" onClick={older.onToggle}>
          {older.label}
        </button>
      )}
    </>
  );
}
