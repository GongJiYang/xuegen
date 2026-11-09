/**
 * Bear 总控 今日卡 (design `?d=control`, `?d=shelf`): a white card with a hairline
 * border — grey headline plus the 「让总控说说」 text button, then one row per
 * thing today holds (mark, text with an optional grey sub, button), the foot
 * line, and the failed-write error. A 书房 row whose block is done today opens
 * the inline 「摘几句」 form right under it. All decisions come from
 * `core/board/control-card`; only presentation lives here.
 */

import { Fragment, useState } from "react";
import type { ControlCardExtract, ControlCardProps } from "../contract.js";
import type { ControlCardMark } from "../../core/board/control-card.js";
import { strings } from "../../core/strings.js";

const MARK: Record<ControlCardMark, string> = { now: "●", warn: "!", plan: "○", faint: "◌", done: "✓" };

/** The 摘几句 form: page + sentence fields, cancel/save, note and error. */
function ExtractForm({ extract }: { extract: ControlCardExtract }) {
  const card = strings.control.card;
  const [page, setPage] = useState("");
  const [text, setText] = useState("");
  return (
    <li
      className="bear-cc-extract"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          extract.onCancel();
        }
      }}
    >
      <label className="bear-cc-field">
        {card.extractPage}
        <input
          className="bear-cc-input bear-cc-page"
          placeholder={extract.pages}
          value={page}
          onChange={(event) => setPage(event.target.value)}
        />
      </label>
      <label className="bear-cc-field bear-cc-grow">
        {card.extractText}
        <textarea
          className="bear-cc-input"
          rows={2}
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              extract.onSave(page, text);
            }
          }}
        />
      </label>
      <div className="bear-cc-extract-btns">
        <button type="button" className="bear-cc-btn" disabled={extract.saving} onClick={extract.onCancel}>
          {card.extractCancel}
        </button>
        <button
          type="button"
          className="bear-cc-btn bear-cc-save"
          disabled={extract.saving}
          onClick={() => extract.onSave(page, text)}
        >
          {card.extractSave}
        </button>
      </div>
      <p className="bear-cc-note">{card.extractNote}</p>
      {extract.error !== null && (
        <p className="bear-cc-error" role="alert">
          {extract.error}
        </p>
      )}
    </li>
  );
}

export function ControlCard({ view, onAction, onAskBrief, busy, error, extract, older }: ControlCardProps) {
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
            <Fragment key={index}>
              <li data-mark={row.mark}>
                <span className="bear-cc-mark" aria-hidden="true">
                  {MARK[row.mark]}
                </span>
                <span className="bear-cc-text">
                  {row.text}
                  {row.sub != null && row.sub !== "" && <span className="bear-cc-sub"> · {row.sub}</span>}
                </span>
                {row.button !== null && (
                  <button type="button" className="bear-cc-btn" disabled={busy} title={row.hint ?? undefined} onClick={() => onAction(row)}>
                    {row.button}
                  </button>
                )}
              </li>
              {extract !== null && row.action?.kind === "extract" && row.action.slug === extract.slug && (
                <ExtractForm extract={extract} />
              )}
            </Fragment>
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
