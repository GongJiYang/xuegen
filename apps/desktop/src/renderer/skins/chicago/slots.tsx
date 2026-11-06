/**
 * Chicago skin slots (message level).
 *
 * The slots other than the Shell and the Composer (which live in `shell.tsx` and
 * `composer.tsx`): the thread, framed user messages (with the teaching-style
 * tag), unbordered answers, the barber-pole thinking indicator, tool rows, the
 * exercise dialog, the model picker, and the notice boxes. Text comes from
 * `core/strings.ts`; only markup and class names live here. Every copy-bearing
 * widget keeps the roles the contract test asserts.
 */

import { Fragment, useRef, useState } from "react";
import type {
  AssistantMessageProps,
  BoardPanelProps,
  CourseIntroCardProps,
  ExerciseProps,
  ModelPickerProps,
  NotesPanelProps,
  NoticeProps,
  ThreadProps,
  ThinkingProps,
  ToolActivityProps,
  UserMessageProps,
} from "../contract.js";
import { strings } from "../../core/strings.js";
import { courseIntroLines } from "../../core/board/course-intro.js";
import { notesAt } from "../../core/chat/context-usage.js";
import { useMotion } from "../../core/motion/index.js";
import { useScrollMemory } from "../../core/chat/use-scroll-memory.js";
import { useFollowBottom } from "../../core/chat/use-follow-bottom.js";
import { lastAssistantMessage } from "../../core/chat/last-assistant.js";
import { thinkingFor } from "../../core/chat/thinking.js";
import { isAborted, translateModelError } from "../../core/chat/model-error.js";
import { chicagoMotion, INTENT_ATTRIBUTE } from "./motion.js";
import { Dialog } from "./dialog.js";
import { StopIcon } from "./stop-icon.js";

/**
 * The expandable "详情" holding an error's raw text.
 *
 * The translated summary is what the user reads; the original upstream text
 * (HTTP status and body, socket error) lives here so it is available without
 * drowning the message in JSON.
 */
export function ErrorDetail({ raw }: { raw: string }) {
  return (
    <details className="chicago-error-detail">
      <summary>{strings.chat.errorDetail}</summary>
      <pre className="chicago-code">{raw}</pre>
    </details>
  );
}

/**
 * An in-message error: the translated summary plus the raw detail.
 *
 * A user-initiated stop is not a failure, so it renders as a plain status line
 * (no alert role, no detail) — the 重试 button beside it offers the next step.
 */
function MessageError({ raw }: { raw: string }) {
  const { summary, detail } = translateModelError(raw);
  if (isAborted(raw)) {
    return (
      <div className="chicago-message-stopped" role="status">
        <p>{summary}</p>
      </div>
    );
  }
  return (
    <div className="chicago-message-error" role="alert">
      <p>{summary}</p>
      {detail && <ErrorDetail raw={detail} />}
    </div>
  );
}

export function Thread({
  messages,
  thinking,
  noModels,
  modelsReason,
  renderMessage,
  intro,
  systemNotes,
}: ThreadProps) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  // Restore the reading position across a skin switch (core remembers it).
  useScrollMemory(paneRef);
  // Pin a new answer's opening line to the viewport top, then stop following.
  const answerRef = useRef<HTMLDivElement | null>(null);
  const lastAssistant = lastAssistantMessage(messages);
  const { atBottom, scrollToBottom } = useFollowBottom(paneRef, {
    answer: lastAssistant ? { key: lastAssistant.id, elementRef: answerRef } : null,
    answerStreaming: lastAssistant?.streaming ?? false,
  });
  const lastAssistantIndex = lastAssistant ? messages.indexOf(lastAssistant) : -1;
  const card = intro ? <CourseIntroCard card={intro.card} /> : null;
  // Before the opening prompt arrives, the card belongs after the transcript.
  const cardIndex = intro ? Math.min(intro.beforeIndex, messages.length) : null;
  const notes = (index: number) =>
    notesAt(systemNotes, index, messages.length).map((note, n) => (
      <p key={`note-${index}-${n}`} className="chicago-note" role="note">
        {note.text}
      </p>
    ));

  return (
    <div className="chicago-pane chicago-body" ref={paneRef} role="log">
      <div className="chicago-thread">
        {messages.length === 0 ? (
          card ?? (
            <p className="chicago-empty">
              {noModels && modelsReason ? strings.chat.loginHint : strings.chat.empty}
            </p>
          )
        ) : (
          messages.map((message, index) => (
            <Fragment key={message.id}>
              {notes(index)}
              {cardIndex === index && card}
              <div
                ref={index === lastAssistantIndex ? answerRef : undefined}
                data-message-id={message.id}
              >
                {renderMessage(message, thinkingFor(messages, index, thinking))}
              </div>
            </Fragment>
          ))
        )}
        {messages.length > 0 && notes(messages.length)}
        {messages.length > 0 && cardIndex === messages.length && card}
      </div>
      {!atBottom && (
        <button type="button" className="chicago-back-to-latest" onClick={scrollToBottom}>
          {strings.chat.backToLatest}
        </button>
      )}
    </div>
  );
}

export function CourseIntroCard({ card }: CourseIntroCardProps) {
  const lines = courseIntroLines(card);
  const ref = useRef<HTMLElement | null>(null);
  useMotion(chicagoMotion, "appear", ref, [card.title]);
  return (
    <section ref={ref} className="chicago-intro" aria-label={card.title}>
      <div className="chicago-intro-title">{card.title}</div>
      <p>{lines.last}</p>
      <p>{lines.next}</p>
      <p>{lines.week}</p>
    </section>
  );
}

export function UserMessage({ message, body, styleTag }: UserMessageProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useMotion(chicagoMotion, "appear", ref, [message.id]);
  return (
    <div ref={ref} className="chicago-you" {...{ [INTENT_ATTRIBUTE]: "print" }}>
      {styleTag && <span className="chicago-style-tag">{styleTag}</span>}
      {body || message.markdown}
    </div>
  );
}

export function AssistantMessage({
  message,
  thinking,
  onCopy,
  copied,
  onRetry,
  nodes,
  streaming,
  renderContent,
  renderToolCall,
}: AssistantMessageProps) {
  const ref = useRef<HTMLElement | null>(null);
  useMotion(chicagoMotion, "appear", ref, [message.id]);
  return (
    <article ref={ref} className="chicago-answer">
      {message.toolCalls.map((call) => (
        <div key={call.toolCallId}>{renderToolCall(call)}</div>
      ))}
      {nodes.map((node, index) => (
        <div key={index}>{renderContent(node, streaming)}</div>
      ))}
      {streaming && <span className="chicago-caret" aria-hidden="true" />}
      {thinking && <Thinking label={strings.chat.thinking} />}
      {message.errorMessage && <MessageError raw={message.errorMessage} />}
      <div className="chicago-answer-foot">
        <button type="button" className="chicago-btn chicago-copy" onClick={onCopy}>
          {copied ? strings.chat.copied : strings.chat.copy}
        </button>
        {message.errorMessage && (
          <button type="button" className="chicago-btn chicago-retry" title={strings.chat.retryTitle} onClick={onRetry}>
            {strings.chat.retry}
          </button>
        )}
      </div>
    </article>
  );
}

export function Thinking({ label }: ThinkingProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useMotion(chicagoMotion, "busy", ref, []);
  return (
    <div className="chicago-thinking" role="status">
      <div ref={ref} className="chicago-pole" />
      <span>{label}</span>
    </div>
  );
}

export function ToolActivity({ call }: ToolActivityProps) {
  const [open, setOpen] = useState(call.status !== "running");
  const triangleRef = useRef<HTMLSpanElement | null>(null);
  useMotion(chicagoMotion, open ? "expand" : "collapse", triangleRef, [open]);

  const summary = `${call.toolName} ${strings.tool[statusKey(call.status)]}`;
  return (
    <details className="chicago-tool" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span ref={triangleRef} className="chicago-tri">
          ▸
        </span>
        {call.argsSummary || summary}
      </summary>
      <div className="chicago-rows">
        {call.argsSummary && (
          <div>
            <span>{strings.tool.arguments}</span>
            <span>{call.argsSummary}</span>
          </div>
        )}
        {call.resultText && (
          <div>
            <span>{call.status === "error" ? strings.tool.error : strings.tool.result}</span>
            <span>{call.resultText}</span>
          </div>
        )}
        <div>
          <span>{summary}</span>
          <span>{call.status === "error" ? "✗" : "✓"}</span>
        </div>
      </div>
    </details>
  );
}

function statusKey(status: ToolActivityProps["call"]["status"]): "statusRunning" | "statusSuccess" | "statusError" {
  switch (status) {
    case "running":
      return "statusRunning";
    case "error":
      return "statusError";
    default:
      return "statusSuccess";
  }
}

export function Exercise({ title, nodes, renderContent, onAnswer, onHint, onSkip }: ExerciseProps) {
  return (
    <Dialog title={title || strings.content.exerciseTitle}>
      {nodes.map((node, index) => (
        <div key={index}>{renderContent(node)}</div>
      ))}
      <div className="chicago-btns">
        <button type="button" className="chicago-btn" onClick={onSkip}>
          {strings.content.exerciseSkip}
        </button>
        <button type="button" className="chicago-btn" onClick={onHint}>
          {strings.content.exerciseHint}
        </button>
        <span className="chicago-def">
          <button type="button" className="chicago-btn" onClick={onAnswer}>
            {strings.content.exerciseAnswer}
          </button>
        </span>
      </div>
    </Dialog>
  );
}

export function ModelPicker({ models, current, onSelect, disabled }: ModelPickerProps) {
  const value = current ? `${current.provider}::${current.id}` : "";
  const label = current ? current.name : strings.topBar.modelPlaceholder;
  return (
    <select
      className="chicago-model-select"
      aria-label={strings.topBar.modelTitle}
      value={value}
      disabled={disabled || models.length === 0}
      onChange={(event) => {
        const [provider, id] = event.target.value.split("::");
        if (provider && id) onSelect(provider, id);
      }}
    >
      <option value="">{models.length === 0 ? strings.topBar.modelEmpty : label}</option>
      {models.map((model) => (
        <option key={`${model.provider}::${model.id}`} value={`${model.provider}::${model.id}`}>
          {model.name} ({model.provider})
        </option>
      ))}
    </select>
  );
}

/**
 * An inline notice.
 *
 * The gallery renders notices in place, so this slot draws them as they would
 * appear in isolation — an alert box (frame + stop icon + text + OK) for an error
 * and a modeless-style box for an info notice. Neither is a global modal: there
 * is no scrim, so a sample behind it stays visible. Errors in the real app are
 * raised by the Shell as a modal alert and never reach this slot.
 */
export function Notice({ notice, onDismiss }: NoticeProps) {
  if (notice.tone === "error") {
    return (
      <div className="chicago-inline-alert" role="alert" data-slot="notice" data-tone="error">
        <div className="chicago-dialog">
          <div className="chicago-dialog-inner">
            <div className="chicago-alert-row">
              <StopIcon />
              <div>
                <div>{notice.text}</div>
                {notice.detail && <ErrorDetail raw={notice.detail} />}
              </div>
            </div>
            <div className="chicago-btns">
              <span className="chicago-def">
                <button type="button" className="chicago-btn" onClick={onDismiss}>
                  {strings.chat.dismiss}
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="chicago-inline-modeless" role="status" data-slot="notice" data-tone={notice.tone}>
      <div className="chicago-tb">
        <span className="chicago-title">{notice.action ? strings.notice.actionTitle : strings.chat.loginHint}</span>
      </div>
      <div className="chicago-pane chicago-note">
        <p>{notice.text}</p>
        {notice.action && (
          <div className="chicago-btns">
            <button type="button" className="chicago-btn" onClick={notice.action.run}>
              {notice.action.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function BoardPanel(_props: BoardPanelProps) {
  return <section data-slot="board" aria-label={strings.panels.boardTitle} />;
}

export function NotesPanel(_props: NotesPanelProps) {
  return <section data-slot="notes" aria-label={strings.panels.notesTitle} />;
}
