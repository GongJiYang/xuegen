/**
 * Stop / error status at the end of an answer (retry-line mockup, user 11-16).
 *
 * A user stop reads as one thin line with the next steps; a real failure shows
 * the translated summary, a 重试 link and an expandable raw detail. Text comes
 * from `core/strings.ts`; only markup and class names live here.
 */

import { useState } from "react";
import type { JSX } from "react";
import { isAborted, translateModelError } from "../../core/chat/model-error.js";
import { strings } from "../../core/strings.js";

export interface AnswerStatusProps {
  /** The message's errorMessage. */
  raw: string;
  /** Whether the answer has any text above (draws the divider). */
  hasText: boolean;
  onRetry(): void;
}

export function AnswerStatus({ raw, hasText, onRetry }: AnswerStatusProps): JSX.Element {
  const { summary, detail } = translateModelError(raw);
  const [open, setOpen] = useState(false);

  if (isAborted(raw)) {
    return (
      <div
        className="bear-answer-status"
        data-kind="stopped"
        data-has-text={hasText ? "" : undefined}
        role="status"
      >
        <p className="bear-answer-status-row">
          <span className="bear-answer-status-mark" aria-hidden="true">
            ■
          </span>
          <span>{summary}</span>
          <span className="bear-answer-status-sep bear-answer-status-act" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            className="bear-answer-status-link bear-answer-status-act"
            title={strings.chat.retryTitle}
            onClick={onRetry}
          >
            {strings.chat.answerAgain}
          </button>
          <span className="bear-answer-status-sep bear-answer-status-act" aria-hidden="true">
            ·
          </span>
          <span className="bear-answer-status-act">{strings.chat.askOn}</span>
        </p>
      </div>
    );
  }

  return (
    <div
      className="bear-answer-status"
      data-kind="error"
      data-has-text={hasText ? "" : undefined}
      role="alert"
    >
      <p className="bear-answer-status-row">
        <span className="bear-answer-status-mark" aria-hidden="true">
          !
        </span>
        <span className="bear-answer-status-msg">{summary}</span>
      </p>
      <p className="bear-answer-status-row bear-answer-status-actions bear-answer-status-act">
        <button
          type="button"
          className="bear-answer-status-link"
          title={strings.chat.retryTitle}
          onClick={onRetry}
        >
          {strings.chat.retry}
        </button>
        {detail && (
          <>
            <span className="bear-answer-status-sep" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              className="bear-answer-status-link"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {strings.chat.errorDetail} <span aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>
          </>
        )}
      </p>
      {open && detail && <pre className="bear-answer-status-detail">{detail}</pre>}
    </div>
  );
}
