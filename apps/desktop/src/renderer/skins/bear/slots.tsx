/**
 * Bear skin slots (message level).
 *
 * The slots other than the Shell, the Composer and the drawer panels: the
 * single-column thread, soft user messages with a rule line, typeset answers,
 * the shimmering thinking indicator, collapsible tool rows, the accent-lined
 * exercise box, the course intro card, the model picker, and one-line notices.
 * Text comes from `core/strings.ts`; only markup and class names live here.
 */

import { Fragment, useRef, useState } from "react";

import {
  Root as Accordion,
  Content as AccordionContent,
  Item as AccordionItem,
  Trigger as AccordionTrigger,
} from "@animate-ui/react/primitives/radix-ui/accordion";
import { ShimmeringText } from "@animate-ui/react/primitives/texts/shimmering";
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
import type { Activity } from "../../core/chat/activity.js";
import { MiniBot } from "./control-bot.js";
import { courseIntroLines } from "../../core/board/course-intro.js";
import { notesAt } from "../../core/chat/context-usage.js";
import { useMotion } from "../../core/motion/index.js";
import { useScrollMemory } from "../../core/chat/use-scroll-memory.js";
import { useFollowBottom } from "../../core/chat/use-follow-bottom.js";
import { lastAssistantMessage } from "../../core/chat/last-assistant.js";
import { thinkingFor } from "../../core/chat/thinking.js";
import { assistantTurns } from "../../core/chat/turns.js";
import { isAborted, translateModelError } from "../../core/chat/model-error.js";
import { bearMotion } from "./motion.js";

/**
 * The expandable "详情" holding an error's raw text.
 *
 * The translated summary is what the user reads; the original upstream text
 * lives here so it is available without drowning the message in JSON.
 */
export function ErrorDetail({ raw }: { raw: string }) {
  return (
    <details className="bear-error-detail">
      <summary>{strings.chat.errorDetail}</summary>
      <pre>{raw}</pre>
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
      <div className="bear-message-stopped" role="status">
        <p>{summary}</p>
      </div>
    );
  }
  return (
    <div className="bear-message-error" role="alert">
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
  activity,
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
  // One answer = one turn; its tool rows fold into a single line (open per turn).
  const turns = assistantTurns(messages);
  const [openTurns, setOpenTurns] = useState<ReadonlySet<string>>(() => new Set());
  const toggleTurn = (key: string): void =>
    setOpenTurns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const notes = (index: number) =>
    notesAt(systemNotes, index, messages.length).map((note, n) => (
      <p key={`note-${index}-${n}`} className="bear-note" role="note">
        {note.text}
      </p>
    ));

  return (
    <div className="bear-thread-wrap">
      <div className="bear-pane bear-body" ref={paneRef} role="log">
        {messages.length === 0 ? (
          card ?? (
            <p className="bear-empty">
              {noModels && modelsReason ? strings.chat.loginHint : strings.chat.empty}
            </p>
          )
        ) : (
          messages.map((message, index) => {
            const turn = turns[index] ?? null;
            const open = turn !== null && openTurns.has(turn.key);
            const hasText = message.markdown.trim() !== "" || !!message.errorMessage;
            return (
              <Fragment key={message.id}>
                {notes(index)}
                {cardIndex === index && card}
                {turn?.first && turn.toolCount > 0 && (
                  <button
                    type="button"
                    className="bear-turn-tools"
                    aria-expanded={open}
                    onClick={() => toggleTurn(turn.key)}
                  >
                    <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                    {strings.chat.toolSteps(turn.toolCount)}
                  </button>
                )}
                <div
                  ref={index === lastAssistantIndex ? answerRef : undefined}
                  data-message-id={message.id}
                  className="bear-turn-part"
                  data-turn={turn ? "" : undefined}
                  data-tools-open={open ? "" : undefined}
                  data-turn-last={turn?.last ? "" : undefined}
                  data-has-text={hasText ? "" : undefined}
                >
                  {renderMessage(message, thinkingFor(messages, index, thinking))}
                </div>
              </Fragment>
            );
          })
        )}
        {activity && <ActivityLine activity={activity} />}
        {messages.length > 0 && notes(messages.length)}
        {messages.length > 0 && cardIndex === messages.length && card}
      </div>
      {!atBottom && (
        <button type="button" className="bear-back" onClick={scrollToBottom}>
          {strings.chat.backToLatest}
        </button>
      )}
    </div>
  );
}

export function CourseIntroCard({ card }: CourseIntroCardProps) {
  const lines = courseIntroLines(card);
  const ref = useRef<HTMLElement | null>(null);
  useMotion(bearMotion, "appear", ref, [card.title]);
  return (
    <section ref={ref} className="bear-intro" aria-label={card.title}>
      <div className="bear-intro-title">{card.title}</div>
      <p>{lines.last}</p>
      <p>{lines.next}</p>
      <p>{lines.week}</p>
    </section>
  );
}

export function UserMessage({ message, body, styleTag }: UserMessageProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useMotion(bearMotion, "appear", ref, [message.id]);
  return (
    <div ref={ref} className="bear-you">
      {styleTag && <span className="bear-style-tag">{styleTag}</span>}
      {body || message.markdown}
    </div>
  );
}

export function AssistantMessage({
  message,
  onCopy,
  copied,
  onRetry,
  nodes,
  streaming,
  renderContent,
  renderToolCall,
}: AssistantMessageProps) {
  const ref = useRef<HTMLElement | null>(null);
  useMotion(bearMotion, "appear", ref, [message.id]);
  return (
    <article ref={ref} className="bear-answer">
      {message.toolCalls.map((call) => (
        <div key={call.toolCallId}>{renderToolCall(call)}</div>
      ))}
      {nodes.map((node, index) => (
        <div key={index}>{renderContent(node, streaming)}</div>
      ))}
      {message.errorMessage && <MessageError raw={message.errorMessage} />}
      <div className="bear-answer-foot">
        <button type="button" title={strings.chat.copyTitle} onClick={onCopy}>
          {copied ? strings.chat.copied : strings.chat.copy}
        </button>
        {message.errorMessage && (
          <button type="button" title={strings.chat.retryTitle} onClick={onRetry}>
            {strings.chat.retry}
          </button>
        )}
      </div>
    </article>
  );
}

export function Thinking({ label }: ThinkingProps) {
  return (
    <div className="bear-thinking" role="status">
      <ShimmeringText text={label} />
    </div>
  );
}

/** The single line under the transcript while an answer runs: the avatar's mood and what 学根 is doing. */
function ActivityLine({ activity }: { activity: Activity }) {
  return (
    <div className="bear-activity">
      <MiniBot mood={activity.mood} size={24} />
      <Thinking label={activity.label} />
    </div>
  );
}

export function ToolActivity({ call }: ToolActivityProps) {
  const summary = `${call.toolName} ${call.argsSummary}`.trim();
  return (
    <Accordion type="single" collapsible className="bear-tool">
      <AccordionItem value="detail">
        <AccordionTrigger className="bear-tool-summary">
          <span aria-hidden="true">▸</span>
          <span>
            {summary} · {strings.tool[statusKey(call.status)]}
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <dl className="bear-tool-detail">
            {call.argsSummary && (
              <>
                <dt>{strings.tool.arguments}</dt>
                <dd>{call.argsSummary}</dd>
              </>
            )}
            {call.resultText && (
              <>
                <dt>{call.status === "error" ? strings.tool.error : strings.tool.result}</dt>
                <dd>{call.resultText}</dd>
              </>
            )}
          </dl>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
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
    <section className="bear-exercise">
      <div className="bear-exercise-title">{title || strings.content.exerciseTitle}</div>
      {nodes.map((node, index) => (
        <div key={index}>{renderContent(node)}</div>
      ))}
      <div className="bear-exercise-btns">
        <button type="button" className="bear-btn-answer" onClick={onAnswer}>
          {strings.content.exerciseAnswer}
        </button>
        <button type="button" onClick={onHint}>
          {strings.content.exerciseHint}
        </button>
        <button type="button" onClick={onSkip}>
          {strings.content.exerciseSkip}
        </button>
      </div>
    </section>
  );
}

export function ModelPicker({ models, current, onSelect, disabled }: ModelPickerProps) {
  const value = current ? `${current.provider}::${current.id}` : "";
  const label = current ? current.name : strings.topBar.modelPlaceholder;
  return (
    <select
      className="bear-model-select"
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
 * A one-line notice: error tone in --danger, info in --soft; dismissible.
 * The Shell lists them at the top of the reading column, one per line.
 */
export function Notice({ notice, onDismiss }: NoticeProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useMotion(bearMotion, "appear", ref, [notice.text]);
  return (
    <div
      ref={ref}
      className="bear-notice"
      data-tone={notice.tone}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      <span>
        {notice.text}
        {notice.detail && <ErrorDetail raw={notice.detail} />}
      </span>
      {onDismiss && (
        <button type="button" className="bear-notice-dismiss" onClick={onDismiss}>
          {strings.chat.dismiss}
        </button>
      )}
    </div>
  );
}

export function BoardPanel(_props: BoardPanelProps) {
  return (
    <section data-slot="board" aria-label={strings.panels.boardTitle}>
      <p className="bear-muted">{strings.panels.boardEmpty}</p>
    </section>
  );
}

export function NotesPanel(_props: NotesPanelProps) {
  return (
    <section data-slot="notes" aria-label={strings.panels.notesTitle}>
      <p className="bear-muted">{strings.panels.notesEmpty}</p>
    </section>
  );
}
