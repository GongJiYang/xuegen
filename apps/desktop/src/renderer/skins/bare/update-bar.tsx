/** Bare update bar (design `?d=update`): plain semantic HTML, same rules as every skin. */

import { useState } from "react";
import type { UpdateBarProps } from "../contract.js";
import { strings } from "../../core/strings.js";

export function UpdateBar({ status, dismissed, onDownload, onInstall, onDismiss }: UpdateBarProps) {
  const [notes, setNotes] = useState(false);
  if (dismissed || status.kind === "idle") return null;
  return (
    <div data-slot="update" role="status">
      {status.kind === "available" && (
        <>
          <span>{strings.update.available(status.version, status.notes.length)}</span>
          {status.notes.length > 0 && (
            <button type="button" onClick={() => setNotes((value) => !value)}>
              {notes ? strings.update.hideNotes : strings.update.showNotes}
            </button>
          )}
          <button type="button" onClick={onDismiss}>
            {strings.update.later}
          </button>
          <button type="button" onClick={onDownload}>
            {strings.update.install}
          </button>
        </>
      )}
      {status.kind === "downloading" && (
        <>
          <span>{strings.update.downloading(status.version)}</span>
          <progress value={status.percent} max={100} />
          <span>{status.percent}%</span>
        </>
      )}
      {status.kind === "ready" && (
        <>
          <span>{strings.update.ready(status.version)}</span>
          <button type="button" onClick={onInstall}>
            {strings.update.restart}
          </button>
        </>
      )}
      {status.kind === "checking" && <span>{strings.update.checking}</span>}
      {status.kind === "latest" && (
        <>
          <span>{strings.update.latest(status.current)}</span>
          <button type="button" onClick={onDismiss}>
            {strings.update.close}
          </button>
        </>
      )}
      {status.kind === "unsupported" && (
        <>
          <span>{strings.update.unsupported}</span>
          <button type="button" onClick={onDismiss}>
            {strings.update.close}
          </button>
        </>
      )}
      {status.kind === "error" && (
        <>
          <span>{status.message}</span>
          <button type="button" onClick={onDismiss}>
            {strings.update.close}
          </button>
        </>
      )}
      {status.kind === "available" && notes && (
        <ul>
          {status.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
