/**
 * Bear day editor — BE-2 完善前的最小可用版.
 *
 * A centred dialog (1px `--rule` border, no shadow) with the date title, a
 * multi-line field, the save-path hint, and 取消 / 保存. The final Animate UI
 * dialog treatment is BE-2 work; Escape already cancels.
 */

import { useState, type KeyboardEvent } from "react";
import type { DayEditorProps } from "../contract.js";
import { strings } from "../../core/strings.js";

export function DayEditor({ title, initialText, savePath, onSave, onCancel }: DayEditorProps) {
  const [text, setText] = useState(initialText);
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Escape") onCancel();
  }
  return (
    <div className="bear-daydlg-scrim">
      <div className="bear-daydlg" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <textarea
          aria-label={title}
          value={text}
          placeholder={strings.dayEditor.placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <p className="bear-muted">{strings.calendar.saveTo(savePath)}</p>
        <div className="bear-daydlg-btns">
          <button type="button" onClick={onCancel}>
            {strings.dayEditor.cancel}
          </button>
          <button type="button" className="bear-btn-save" onClick={() => onSave(text)}>
            {strings.dayEditor.save}
          </button>
        </div>
      </div>
    </div>
  );
}
