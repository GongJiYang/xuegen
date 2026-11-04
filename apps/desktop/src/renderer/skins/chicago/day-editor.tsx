/**
 * Chicago day editor (the calendar write dialog).
 *
 * The design's `#daydlg`: a double-bordered dialog with the date as its title, a
 * multi-line field, the save-path hint, and 取消 / 保存 (保存 is the default
 * button). Opened by double-clicking a calendar day or the 写笔记 button.
 */

import { useState } from "react";
import type { DayEditorProps } from "../contract.js";
import { strings } from "../../core/strings.js";

export function DayEditor({ title, initialText, savePath, onSave, onCancel }: DayEditorProps) {
  const [text, setText] = useState(initialText);
  return (
    <div className="chicago-scrim chicago-show chicago-dlg-scrim">
      <div className="chicago-dialog chicago-daydlg" role="dialog" aria-label={title}>
        <div className="chicago-dialog-inner">
          <div className="chicago-dialog-head">{title}</div>
          <textarea
            className="chicago-field chicago-area chicago-day-text"
            value={text}
            rows={6}
            placeholder={strings.dayEditor.placeholder}
            aria-label={title}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancel();
            }}
          />
          <div className="chicago-small chicago-day-path">{strings.calendar.saveTo(savePath)}</div>
          <div className="chicago-btns">
            <button type="button" className="chicago-btn" onClick={onCancel}>
              {strings.dayEditor.cancel}
            </button>
            <span className="chicago-def">
              <button type="button" className="chicago-btn" onClick={() => onSave(text)}>
                {strings.dayEditor.save}
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
