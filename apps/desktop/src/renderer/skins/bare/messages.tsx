/**
 * Bare skin message-level slots: the thread and its parts, the composer, the
 * model picker, the notices, and the (batch-3) board/notes placeholders — all as
 * plain semantic HTML. The reference skin: no styles, no motion.
 */

import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { TEACHING_STYLE_LABELS } from "@shared/protocol.js";
import type {
  AssistantMessageProps,
  ComposerProps,
  CourseIntroCardProps,
  ExerciseProps,
  ModelPickerProps,
  NoticeProps,
  ThreadProps,
  ThinkingProps,
  ToolActivityProps,
  UserMessageProps,
} from "../contract.js";
import { strings } from "../../core/strings.js";
import { courseIntroLines } from "../../core/board/course-intro.js";
import { notesAt } from "../../core/chat/context-usage.js";
import { useFollowBottom } from "../../core/chat/use-follow-bottom.js";
import { lastAssistantMessage } from "../../core/chat/last-assistant.js";
import { thinkingFor } from "../../core/chat/thinking.js";
import { SlashMenu } from "./panels-more.js";

/** Ignore a second send click this soon after the first (double-click guard). */
const SEND_DEBOUNCE_MS = 600;

export function Thread({
  messages,
  thinking,
  noModels,
  modelsReason,
  renderMessage,
  intro,
  systemNotes,
  header,
}: ThreadProps) {
  const paneRef = useRef<HTMLDivElement | null>(null);
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
      <p key={`note-${index}-${n}`} data-slot="thread-note" role="note">
        {note.text}
      </p>
    ));
  if (messages.length === 0 && !card && !header) {
    return (
      <div data-slot="thread" role="log">
        <p>{noModels && modelsReason ? strings.chat.loginHint : strings.chat.empty}</p>
      </div>
    );
  }
  return (
    <div data-slot="thread" role="log" ref={paneRef}>
      {header}
      {messages.map((message, index) => (
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
      ))}
      {notes(messages.length)}
      {cardIndex === messages.length && card}
      {!atBottom && (
        <button type="button" onClick={scrollToBottom}>
          {strings.chat.backToLatest}
        </button>
      )}
    </div>
  );
}

export function CourseIntroCard({ card }: CourseIntroCardProps) {
  const lines = courseIntroLines(card);
  return (
    <section data-slot="course-intro" aria-label={card.title}>
      <h3>{card.title}</h3>
      <p>{lines.last}</p>
      <p>{lines.next}</p>
      <p>{lines.week}</p>
    </section>
  );
}

export function UserMessage({ message, body, styleTag, actionLabel }: UserMessageProps) {
  if (actionLabel) {
    return (
      <details data-role="user">
        <summary>{actionLabel}</summary>
        <p>{body || message.markdown}</p>
      </details>
    );
  }
  return (
    <article data-role="user">
      {styleTag && <span data-slot="style-tag">[{styleTag}]</span>}
      <p>{body || message.markdown}</p>
    </article>
  );
}

export function AssistantMessage({
  message,
  thinking,
  activity,
  onCopy,
  copied,
  onRetry,
  nodes,
  streaming,
  renderContent,
  renderToolCall,
}: AssistantMessageProps) {
  return (
    <article data-role="assistant">
      {message.toolCalls.map((call) => (
        <div key={call.toolCallId}>{renderToolCall(call)}</div>
      ))}
      {nodes.map((node, index) => (
        <div key={index}>{renderContent(node, streaming)}</div>
      ))}
      {thinking && (
        <Thinking label={activity?.meta ? `${activity.label} · ${activity.meta}` : (activity?.label ?? strings.chat.thinking)} />
      )}
      {message.errorMessage && <p role="alert">{message.errorMessage}</p>}
      <button type="button" onClick={onCopy}>
        {copied ? strings.chat.copied : strings.chat.copy}
      </button>
      {(message.errorMessage || !message.streaming) && (
        <button type="button" onClick={onRetry}>
          {strings.chat.retry}
        </button>
      )}
    </article>
  );
}

export function Thinking({ label }: ThinkingProps) {
  return (
    <p data-slot="thinking" role="status">
      {label}
    </p>
  );
}

export function ToolActivity({ call }: ToolActivityProps) {
  return (
    <details data-slot="tool">
      <summary>
        {call.toolName} — {strings.tool[statusKey(call.status)]}
      </summary>
      {call.argsSummary && (
        <div>
          <h4>{strings.tool.arguments}</h4>
          <pre>{call.argsSummary}</pre>
        </div>
      )}
      {call.resultText && (
        <div>
          <h4>{call.status === "error" ? strings.tool.error : strings.tool.result}</h4>
          <pre>{call.resultText}</pre>
        </div>
      )}
    </details>
  );
}

/** Map a tool status to its strings key. */
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
    <section data-slot="exercise">
      <h3>{title || strings.content.exerciseTitle}</h3>
      {nodes.map((node, index) => (
        <div key={index}>{renderContent(node)}</div>
      ))}
      <div data-slot="exercise-actions">
        <button type="button" onClick={onSkip}>
          {strings.content.exerciseSkip}
        </button>
        <button type="button" onClick={onHint}>
          {strings.content.exerciseHint}
        </button>
        <button type="button" onClick={onAnswer}>
          {strings.content.exerciseAnswer}
        </button>
      </div>
    </section>
  );
}

export function Composer({
  streaming,
  disabled,
  onSend,
  onStop,
  style,
  onStyle,
  commandsOpen,
  commandGroups,
  commands,
  selectedCommand,
  onSelectCommand,
  onRunCommand,
  onCloseCommands,
  onInput,
  answering,
  focusRequest,
  lessonActions,
  defaultStyleLabel,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const lastSendAt = useRef(0);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const hasText = value.trim().length > 0;

  useEffect(() => {
    if (focusRequest > 0) fieldRef.current?.focus();
  }, [focusRequest]);

  function submit(): void {
    const text = value.trim();
    if (!text) return;
    const now = Date.now();
    if (now - lastSendAt.current < SEND_DEBOUNCE_MS) return;
    lastSendAt.current = now;
    onSend(text);
    setValue("");
    onInput("");
  }

  function runCommand(command: (typeof commands)[number]): void {
    if (command.command.startsWith("/skill:")) {
      setValue(`${command.command} `);
      onInput(`${command.command} `);
      return;
    }
    setValue("");
    onInput("");
    onRunCommand(command);
  }

  /**
   * Stop the answer and put the prompt just sent back into the field.
   *
   * The field is left alone when it already has text: whatever the user is
   * writing now outranks the message being returned. The caret goes to the end
   * once React has committed the restored value.
   */
  function stopAndRestore(): void {
    const back = onStop();
    if (!back || hasText) return;
    setValue(back);
    onInput(back);
    requestAnimationFrame(() => {
      const field = fieldRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(back.length, back.length);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // An IME is still composing (Chinese/Japanese input): the Enter picks a
    // candidate and Escape cancels it, so neither belongs to the composer.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (commandsOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onSelectCommand((selectedCommand + 1) % Math.max(1, commands.length));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        onSelectCommand((selectedCommand - 1 + commands.length) % Math.max(1, commands.length));
        return;
      }
      if (event.key === "Enter" && commands[selectedCommand]) {
        event.preventDefault();
        runCommand(commands[selectedCommand]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseCommands();
        return;
      }
    }
    if (event.key === "Escape" && streaming) {
      event.preventDefault();
      stopAndRestore();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (hasText) submit();
    }
  }

  const showStop = streaming && !hasText;

  return (
    <div data-slot="composer">
      <div data-slot="composer-style">
        <span>{strings.input.styleLabel}</span>
        {TEACHING_STYLE_LABELS.map((entry) => (
          <label key={entry.id}>
            <input
              type="radio"
              name="session-style"
              checked={style === entry.id}
              onChange={() => onStyle(entry.id)}
              aria-label={entry.id === "default" ? defaultStyleLabel : entry.label}
            />
            {entry.id === "default" ? defaultStyleLabel : entry.label}
          </label>
        ))}
        {lessonActions.map((action) => (
          <span key={action.label}>
            <button type="button" disabled={streaming} title={action.hint} onClick={action.run}>
              {action.label}
            </button>
            {action.options.map((option) => (
              <button key={option.label} type="button" disabled={streaming} title={action.hint} onClick={option.run}>
                {option.label}
              </button>
            ))}
          </span>
        ))}
      </div>
      {commandsOpen && (
        <SlashMenu
          groups={commandGroups}
          commands={commands}
          selected={selectedCommand}
          onSelect={onSelectCommand}
          onRun={runCommand}
        />
      )}
      {answering !== null && <div data-slot="composer-answering">{strings.content.answering(answering)}</div>}
      <textarea
        ref={fieldRef}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value);
          onInput(event.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder={disabled ? strings.input.placeholderDisabled : strings.input.placeholder}
        aria-label={strings.input.placeholder}
      />
      {showStop ? (
        <button type="button" onClick={stopAndRestore}>
          {strings.input.stop}
        </button>
      ) : (
        <button type="button" onClick={submit} disabled={disabled || !hasText}>
          {strings.input.send}
        </button>
      )}
    </div>
  );
}

export function ModelPicker({ models, current, onSelect, disabled }: ModelPickerProps) {
  const value = current ? `${current.provider}::${current.id}` : "";
  return (
    <select
      aria-label={strings.topBar.modelTitle}
      value={value}
      disabled={disabled || models.length === 0}
      onChange={(event) => {
        const [provider, id] = event.target.value.split("::");
        if (provider && id) onSelect(provider, id);
      }}
    >
      <option value="">{models.length === 0 ? strings.topBar.modelEmpty : strings.topBar.modelPlaceholder}</option>
      {models.map((model) => (
        <option key={`${model.provider}::${model.id}`} value={`${model.provider}::${model.id}`}>
          {model.name} ({model.provider})
        </option>
      ))}
    </select>
  );
}

export function Notice({ notice, onDismiss }: NoticeProps) {
  return (
    <span data-slot="notice" data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
      {notice.text}
      {notice.action && (
        <button type="button" onClick={notice.action.run}>
          {notice.action.label}
        </button>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label={strings.chat.dismiss}>
          ×
        </button>
      )}
    </span>
  );
}
