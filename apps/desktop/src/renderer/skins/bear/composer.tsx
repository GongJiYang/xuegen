/**
 * Bear composer.
 *
 * One white card with a hairline border: an auto-growing field (1–8 lines) in
 * the body font, and a foot row with the session style as underlined text
 * options, the Enter hint, and a round send button (↑) that turns into ■ stop
 * while 学根 answers with nothing typed. Answering a 「检查理解」 question shows a
 * strip at the top of the card. Behaviour matches Chicago's: Enter sends,
 * Shift+Enter wraps, Escape stops an empty-field stream, the `/` menu takes
 * over arrows/Enter/Escape while open, a `/skill:` command inserts into the
 * field, and an unknown `/xxx` is never sent to the model.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { RadioGroup } from "radix-ui";
import { TEACHING_STYLE_LABELS } from "@shared/protocol.js";
import type { ComposerProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { isUnknownCommand } from "../../core/commands/commands.js";
import { SlashMenu } from "./slash-menu.js";

/** Ignore a second send click this soon after the first (double-click guard). */
const SEND_DEBOUNCE_MS = 600;
/** The field grows with its content up to this many lines, then scrolls. */
const MAX_LINES = 8;

function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M8 13V3M3.5 7.5 8 3l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
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
  onCancelAnswer,
  focusRequest,
}: ComposerProps) {
  const [value, setValue] = useState("");
  // Set when the user submits a `/xxx` the menu does not know: nothing is sent,
  // and the card shows 「没有这个命令」.
  const [unknownCommand, setUnknownCommand] = useState(false);
  // Timestamp of the last send; a click within the debounce window is ignored.
  const lastSendAt = useRef(0);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus the field whenever core asks (「我来回答」 on an 「检查理解」 box). The
  // counter changes on every request, so a repeat request still focuses.
  useEffect(() => {
    if (focusRequest > 0) fieldRef.current?.focus();
  }, [focusRequest]);

  // Grow with the content, up to MAX_LINES; beyond that the field scrolls.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    const line = parseFloat(getComputedStyle(field).lineHeight) || 24;
    field.style.height = `${Math.min(field.scrollHeight, line * MAX_LINES)}px`;
  }, [value]);

  const hasText = value.trim().length > 0;

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    // An unknown slash command is never sent to the model as ordinary prose.
    if (isUnknownCommand(text, commands)) {
      setUnknownCommand(true);
      return;
    }
    setUnknownCommand(false);
    const now = Date.now();
    if (now - lastSendAt.current < SEND_DEBOUNCE_MS) return;
    lastSendAt.current = now;
    onSend(text);
    setValue("");
    onInput("");
  }, [onSend, value, onInput, commands]);

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

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (commandsOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onSelectCommand(commands.length ? (selectedCommand + 1) % commands.length : 0);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        onSelectCommand(commands.length ? (selectedCommand - 1 + commands.length) % commands.length : 0);
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
    // Escape stops generation only when the field is empty and no `/` menu is
    // open, so it never swallows the menu's own Escape.
    if (event.key === "Escape" && streaming && !hasText) {
      event.preventDefault();
      onStop();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // With content, Enter queues a follow-up send — never a stop.
      if (hasText) submit();
    }
  }

  // The button is 停止 only when there is nothing to send; typing turns it back
  // into 发送, which queues the text as a follow-up while the answer streams.
  const showStop = streaming && !hasText;
  const sendDisabled = disabled || !hasText;
  const placeholder = disabled
    ? strings.input.placeholderDisabled
    : answering !== null
      ? strings.input.answerPlaceholder
      : strings.input.placeholderShort;

  return (
    <div className="bear-composer">
      {commandsOpen && (
        <SlashMenu
          groups={commandGroups}
          commands={commands}
          selected={selectedCommand}
          onSelect={onSelectCommand}
          onRun={runCommand}
        />
      )}
      {unknownCommand && (
        <div className="bear-cslash-hint" role="alert">
          {strings.commands.unknown}
        </div>
      )}
      <div className="bear-ccard">
        {answering !== null && (
          <div className="bear-answering" role="status">
            <span>{strings.content.answering(answering)}</span>
            {onCancelAnswer && (
              <button type="button" className="bear-answering-cancel" onClick={onCancelAnswer}>
                {strings.input.cancelAnswer}
              </button>
            )}
          </div>
        )}
        <textarea
          ref={fieldRef}
          className="bear-cinput"
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            setValue(event.target.value);
            setUnknownCommand(false);
            onInput(event.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={strings.input.placeholder}
        />
        <div className="bear-cfoot">
          <RadioGroup.Root
            className="bear-cstyles"
            value={style}
            orientation="horizontal"
            aria-label={strings.input.styleLabel}
            onValueChange={(next) => onStyle(next as typeof style)}
          >
            {TEACHING_STYLE_LABELS.map((entry) => (
              <RadioGroup.Item key={entry.id} value={entry.id} className="bear-cstyle" aria-label={entry.label}>
                {entry.label}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
          <span className="bear-chint">{strings.input.enterHint}</span>
          {showStop ? (
            <button type="button" className="bear-csend is-stop" aria-label={strings.input.stop} onClick={onStop}>
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              className="bear-csend"
              aria-label={strings.input.send}
              disabled={sendDisabled}
              onClick={submit}
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
      {streaming && <p className="bear-cstatus">{strings.input.queueHint}</p>}
    </div>
  );
}
