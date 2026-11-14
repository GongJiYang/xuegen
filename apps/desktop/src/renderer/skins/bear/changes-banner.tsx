/**
 * Bear 总控 「学根刚改了 N 处」 banner over the week / month block: the moves
 * on one line, 撤销这次改动 (when the turn committed something), 看回答 and
 * 知道了 (which also clears the grid marks).
 */

import type { PlanChangesView } from "../contract.js";
import { strings } from "../../core/strings.js";

export function ChangesBanner({ changes }: { changes: PlanChangesView }) {
  const text = strings.planChanges;
  return (
    <div className="bear-cp-banner" role="status">
      <b>{text.banner(changes.lines.length)}</b>
      <span className="bear-cp-banner-lines">{changes.lines.join(" · ")}</span>
      <span className="bear-cp-banner-acts">
        {changes.undo !== null && changes.undo.status !== "undone" && (
          <button
            type="button"
            className="bear-btn"
            disabled={changes.undo.status === "undoing"}
            onClick={changes.onUndo}
          >
            {changes.undo.status === "undoing" ? text.undoing : text.undo}
          </button>
        )}
        <button type="button" className="bear-cp-link" onClick={changes.onShowAnswer}>
          {text.showAnswer}
        </button>
        <button type="button" className="bear-cp-link" onClick={changes.onDismiss}>
          {text.dismiss}
        </button>
      </span>
      {changes.undo?.error != null && (
        <span className="bear-cp-banner-error" role="alert">
          {text.undoFailed(changes.undo.error)}
        </span>
      )}
    </div>
  );
}
