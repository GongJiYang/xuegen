/**
 * One row of the Bear 阅读 panel's article queue (split from
 * `reading-panel.tsx` when the 书房 section landed, to keep the panel file
 * under the 300-line limit): title + due tag, the position meta line, and for
 * due items the 推迟 / 接着读 / 读完 actions. 接着读 asks where you stopped and
 * records it on Enter.
 */

import { useState } from "react";
import type { ReadingItem } from "@shared/data-protocol.js";
import type { ReadingPanelProps } from "../contract.js";
import { dueLabel, isDueNow } from "../../core/board/reading-due.js";
import { strings } from "../../core/strings.js";

export function ReadingRow({
  item,
  today,
  actionable,
  onReview,
}: {
  item: ReadingItem;
  today: string;
  actionable: boolean;
  onReview: ReadingPanelProps["onReview"];
}) {
  const [recording, setRecording] = useState<string | null>(null);

  function record(): void {
    if (recording === null) return;
    onReview(item.slug, "next", recording.trim());
    setRecording(null);
  }

  return (
    <li className="bear-read-item">
      <div className="bear-read-head">
        <span className="bear-read-title">{item.title}</span>
        <span className={isDueNow(item.due, today) ? "bear-read-due is-now" : "bear-read-due"}>
          {dueLabel(item.due, today)}
        </span>
      </div>
      <div className="bear-read-meta">
        {item.priority === "high" && <span className="bear-read-high">{strings.reading.priorityMark}</span>}
        <span>{item.position ? strings.reading.positionAt(item.position) : strings.reading.notStarted}</span>
      </div>
      {actionable &&
        (recording !== null ? (
          <div className="bear-inline-form">
            <input
              className="bear-input"
              autoFocus
              aria-label={strings.reading.positionLabel}
              placeholder={strings.reading.positionPlaceholder}
              value={recording}
              onChange={(event) => setRecording(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") record();
                if (event.key === "Escape") setRecording(null);
              }}
            />
            <button type="button" className="bear-link bear-link-accent" onClick={record}>
              {strings.reading.positionSave}
            </button>
          </div>
        ) : (
          <div className="bear-actions">
            <button type="button" className="bear-link" onClick={() => onReview(item.slug, "postpone")}>
              {strings.reading.postpone}
            </button>
            <button type="button" className="bear-link" onClick={() => setRecording(item.position)}>
              {strings.reading.readOn}
            </button>
            <button type="button" className="bear-link bear-link-accent" onClick={() => onReview(item.slug, "done")}>
              {strings.reading.done}
            </button>
          </div>
        ))}
    </li>
  );
}
