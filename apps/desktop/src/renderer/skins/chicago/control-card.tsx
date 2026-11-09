/**
 * Chicago 总控 今日卡: the classic black-and-white window chrome — a framed
 * box with a title row (headline + 「让总控说说」 button), the day's rows with
 * their marks, the foot line, and the failed-write error. A 书房 row's 摘几句
 * button opens a minimal inline form after the row list.
 */

import { useState } from "react";
import type { ControlCardExtract, ControlCardProps } from "../contract.js";
import type { ControlCardMark } from "../../core/board/control-card.js";
import { strings } from "../../core/strings.js";

const MARK: Record<ControlCardMark, string> = { now: "●", warn: "!", plan: "○", faint: "◌", done: "✓" };

/** The 摘几句 form: two fields, cancel/save, note and error. */
function ExtractForm({ extract }: { extract: ControlCardExtract }) {
  const card = strings.control.card;
  const [page, setPage] = useState("");
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        extract.onSave(page, text);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") extract.onCancel();
      }}
    >
      <label>
        {card.extractPage}
        <input placeholder={extract.pages} value={page} onChange={(event) => setPage(event.target.value)} />
      </label>
      <label>
        {card.extractText}
        <textarea rows={2} autoFocus value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <button type="button" disabled={extract.saving} onClick={extract.onCancel}>
        {card.extractCancel}
      </button>
      <button type="submit" disabled={extract.saving}>
        {card.extractSave}
      </button>
      <p>{card.extractNote}</p>
      {extract.error !== null && <p role="alert">{extract.error}</p>}
    </form>
  );
}

export function ControlCard({ view, onAction, onAskBrief, busy, error, extract, older }: ControlCardProps) {
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
            <span className="chicago-cc-text">
              {row.text}
              {row.sub != null && row.sub !== "" && ` · ${row.sub}`}
            </span>
            {row.button !== null && (
              <button type="button" className="chicago-btn" disabled={busy} title={row.hint ?? undefined} onClick={() => onAction(row)}>
                {row.button}
              </button>
            )}
          </li>
        ))}
      </ul>
      {extract !== null && <ExtractForm extract={extract} />}
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
