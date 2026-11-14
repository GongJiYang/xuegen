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
import type { ControlCardGroup, ControlCardMark, ControlCardRow } from "../../core/board/control-card.js";
import { strings } from "../../core/strings.js";

const MARK: Record<ControlCardMark, string> = { now: "●", warn: "!", plan: "○", faint: "◌", done: "✓" };

const GROUPS: ControlCardGroup[] = ["lesson", "read", "review"];

/**
 * A 阅读 row is ticked, not opened (panel v2): its left control is a checkbox.
 * Unticked rows tick on click; a ticked row in its undo window unticks.
 */
function checkState(row: ControlCardRow): "off" | "on" | null {
  const kind = row.action?.kind;
  if (kind === "afterRead" || kind === "shelfDone") return "off";
  if (kind === "undoRead" || kind === "undoShelf") return "on";
  if (row.group === "read" && row.mark === "done") return "on";
  return null;
}

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

/** One row: mark or checkbox, text with its sub line, then the right-hand button(s). */
function Row({
  row,
  busy,
  onAction,
  extract,
}: {
  row: ControlCardRow;
  busy: boolean;
  onAction: ControlCardProps["onAction"];
  extract: ControlCardProps["extract"];
}) {
  const check = checkState(row);
  const undo = row.action?.kind === "undoRead" || row.action?.kind === "undoShelf";
  return (
    <>
      <li data-mark={row.mark} data-group={row.group}>
        {check === null ? (
          <span className="bear-cc-mark" aria-hidden="true">
            {MARK[row.mark]}
          </span>
        ) : (
          <button
            type="button"
            role="checkbox"
            aria-checked={check === "on"}
            aria-label={`${row.text} · ${check === "on" ? strings.control.card.checkedLabel : strings.control.card.afterRead}`}
            className={`bear-cc-box${check === "on" ? " is-on" : ""}`}
            disabled={busy || (check === "on" && !undo)}
            title={row.hint ?? undefined}
            onClick={() => onAction(row)}
          >
            {check === "on" ? "✓" : ""}
          </button>
        )}
        <span className="bear-cc-text">
          {row.text}
          {row.sub != null && row.sub !== "" && <span className="bear-cc-sub">{row.sub}</span>}
        </span>
        <span className="bear-cc-right">
          {row.side && (
            <button
              type="button"
              className="bear-cc-side"
              disabled={busy}
              onClick={() => onAction({ ...row, action: row.side!.action })}
            >
              {row.side.label}
            </button>
          )}
          {/* A checkbox row's own action is the box; only undo / 摘几句 keep a button. */}
          {row.button !== null && (check === null || undo || row.action?.kind === "extract") && (
            <button
              type="button"
              className="bear-cc-btn"
              disabled={busy}
              title={row.hint ?? undefined}
              onClick={() => onAction(row)}
            >
              {row.button}
            </button>
          )}
        </span>
      </li>
      {extract !== null && row.action?.kind === "extract" && row.action.slug === extract.slug && (
        <ExtractForm extract={extract} />
      )}
    </>
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
          {view.rows
            .filter((row) => row.group === undefined)
            .map((row, index) => (
              <Row key={`free-${index}`} row={row} busy={busy} onAction={onAction} extract={extract} />
            ))}
          {GROUPS.map((group) => {
            const rows = view.rows.filter((row) => row.group === group);
            if (rows.length === 0) return null;
            const head = strings.control.card.groups[group];
            return (
              <Fragment key={group}>
                <li className="bear-cc-gh">
                  <b>{head.title}</b>
                  <span>{head.note}</span>
                </li>
                {rows.map((row, index) => (
                  <Row
                    key={`${group}-${index}`}
                    row={row}
                    busy={busy}
                    onAction={onAction}
                    extract={extract}
                  />
                ))}
              </Fragment>
            );
          })}
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
