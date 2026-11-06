/** Bear update bar (design `?d=update`): one quiet line above the transcript. */

import { useState } from "react";
import type { UpdateBarProps } from "../contract.js";
import { strings } from "../../core/strings.js";

export function UpdateBar({ status, dismissed, onDownload, onInstall, onDismiss }: UpdateBarProps) {
  const [notes, setNotes] = useState(false);
  if (dismissed || status.kind === "idle") return null;
  const close = (
    <button type="button" className="bear-up-link" onClick={onDismiss}>
      {strings.update.close}
    </button>
  );
  let line;
  switch (status.kind) {
    case "available":
      line = (
        <>
          <span className="bear-up-dot" />
          <span>{strings.update.available(status.version, status.notes.length)}</span>
          {status.notes.length > 0 && (
            <button type="button" className="bear-up-link" onClick={() => setNotes((value) => !value)}>
              {notes ? strings.update.hideNotes : strings.update.showNotes}
            </button>
          )}
          <span className="bear-up-gap" />
          <button type="button" className="bear-up-link" onClick={onDismiss}>
            {strings.update.later}
          </button>
          <button type="button" className="bear-up-btn" onClick={onDownload}>
            {strings.update.install}
          </button>
        </>
      );
      break;
    case "downloading":
      line = (
        <>
          <span>{strings.update.downloading(status.version)}</span>
          <span className="bear-up-prog">
            <i style={{ width: `${status.percent}%` }} />
          </span>
          <span className="bear-up-pct">{status.percent}%</span>
        </>
      );
      break;
    case "ready":
      line = (
        <>
          <span className="bear-up-dot is-ok" />
          <span>{strings.update.ready(status.version)}</span>
          <span className="bear-up-gap" />
          <button type="button" className="bear-up-btn" onClick={onInstall}>
            {strings.update.restart}
          </button>
        </>
      );
      break;
    case "checking":
      line = <span>{strings.update.checking}</span>;
      break;
    case "latest":
      line = (
        <>
          <span>{strings.update.latest(status.current)}</span>
          <span className="bear-up-gap" />
          {close}
        </>
      );
      break;
    case "unsupported":
      line = (
        <>
          <span>{strings.update.unsupported}</span>
          <span className="bear-up-gap" />
          {close}
        </>
      );
      break;
    case "error":
      line = (
        <>
          <span className="bear-up-error">{status.message}</span>
          <span className="bear-up-gap" />
          {close}
        </>
      );
      break;
  }
  return (
    <div className="bear-up" role="status">
      <div className="bear-up-bar">{line}</div>
      {status.kind === "available" && notes && (
        <ul className="bear-up-notes">
          {status.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
