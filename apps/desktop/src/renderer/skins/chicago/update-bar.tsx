/** Chicago update bar (design `?d=update`): one pane line above the transcript. */

import { useState } from "react";
import type { UpdateBarProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { Note } from "./panel-shared.js";
import { Bar } from "./widgets.js";

function DefButton({ onClick, children }: { onClick(): void; children: React.ReactNode }) {
  return (
    <span className="chicago-def">
      <button type="button" className="chicago-btn" onClick={onClick}>
        {children}
      </button>
    </span>
  );
}

export function UpdateBar({ status, dismissed, onDownload, onInstall, onDismiss }: UpdateBarProps) {
  const [notes, setNotes] = useState(false);
  if (dismissed || status.kind === "idle") return null;
  return (
    <div className="chicago-pane-inner" role="status">
      {status.kind === "available" && (
        <>
          <Note>{strings.update.available(status.version, status.notes.length)}</Note>
          {status.notes.length > 0 && (
            <DefButton onClick={() => setNotes((value) => !value)}>
              {notes ? strings.update.hideNotes : strings.update.showNotes}
            </DefButton>
          )}
          <DefButton onClick={onDismiss}>{strings.update.later}</DefButton>
          <DefButton onClick={onDownload}>{strings.update.install}</DefButton>
        </>
      )}
      {status.kind === "downloading" && (
        <>
          <Note>{strings.update.downloading(status.version)}</Note>
          <Bar percent={status.percent} />
          <span className="chicago-pct">{status.percent}%</span>
        </>
      )}
      {status.kind === "ready" && (
        <>
          <Note>{strings.update.ready(status.version)}</Note>
          <DefButton onClick={onInstall}>{strings.update.restart}</DefButton>
        </>
      )}
      {status.kind === "checking" && <Note>{strings.update.checking}</Note>}
      {status.kind === "latest" && (
        <>
          <Note>{strings.update.latest(status.current)}</Note>
          <DefButton onClick={onDismiss}>{strings.update.close}</DefButton>
        </>
      )}
      {status.kind === "unsupported" && (
        <>
          <Note>{strings.update.unsupported}</Note>
          <DefButton onClick={onDismiss}>{strings.update.close}</DefButton>
        </>
      )}
      {status.kind === "error" && (
        <>
          <Note>{status.message}</Note>
          <DefButton onClick={onDismiss}>{strings.update.close}</DefButton>
        </>
      )}
      {status.kind === "available" && notes && (
        <ul className="chicago-small">
          {status.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
