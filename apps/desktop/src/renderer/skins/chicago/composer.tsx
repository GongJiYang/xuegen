/**
 * Chicago composer.
 *
 * The design's `.composer.f`: a bar with the session style radio row and the
 * "输入 / 查看功能" hint, then the textarea and the pixel-cornered send button.
 * When the `/` menu is open it floats above the field. A `/skill:<name>`
 * command inserts into the field for the user to finish; every other command is
 * handed to core through `onRunCommand`. Escape stops a running answer even with
 * text in the field, and a stop puts the prompt just sent back into an empty field.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { TEACHING_STYLE_LABELS } from "@shared/protocol.js";
import type { ComposerProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { isUnknownCommand } from "../../core/commands/commands.js";
import { SlashMenu } from "./slash-menu.js";

/** Ignore a second send click this soon after the first (double-click guard). */
const SEND_DEBOUNCE_MS = 600;

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
  const [sending, setSending] = useState(false);
  // Set when the user submits a `/xxx` the menu does not know: nothing is sent,
  // and the field shows 「没有这个命令」.
  const [unknownCommand, setUnknownCommand] = useState(false);
  // Timestamp of the last send; a click within the debounce window is ignored.
  const lastSendAt = useRef(0);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus the field whenever core asks (「我来回答」 on an 「检查理解」 box). The
  // counter changes on every request, so a repeat request for the same question
  // still focuses.
  useEffect(() => {
    if (focusRequest > 0) fieldRef.current?.focus();
  }, [focusRequest]);

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
    // Escape stops a running answer whether or not the field has text, so a
    // draft never blocks a stop; a `/` menu still gets its own Escape first.
    if (event.key === "Escape" && streaming) {
      event.preventDefault();
      stopAndRestore();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // With content, Enter queues a follow-up send — never a stop.
      if (hasText) submit();
    }
  }

  // The button is "停止" only when there is nothing to send; typing turns it back
  // into "发送", which queues the text as a follow-up while the answer streams.
  const showStop = streaming && !hasText;
  const sendDisabled = disabled || (!hasText && !streaming);

  return (
    <div className="chicago-composer chicago-composer-f">
      {commandsOpen && (
        <SlashMenu
          groups={commandGroups}
          commands={commands}
          selected={selectedCommand}
          onSelect={onSelectCommand}
          onRun={runCommand}
        />
      )}
      <div className="chicago-cbar">
        <div className="chicago-radio">
          {strings.input.styleLabel}
          {TEACHING_STYLE_LABELS.map((entry) => (
            <label key={entry.id}>
              <input
                type="radio"
                name="session-style"
                value={entry.id}
                checked={style === entry.id}
                onChange={() => onStyle(entry.id)}
                aria-label={entry.id === "default" ? defaultStyleLabel : entry.label}
              />
              {entry.id === "default" ? defaultStyleLabel : entry.label}
            </label>
          ))}
        </div>
        {lessonActions.length > 0 && (
          <span className="chicago-clessons">
            {lessonActions.map((action) => (
              <span key={action.label}>
                <button type="button" className="chicago-btn" disabled={streaming} title={action.hint} onClick={action.run}>
                  {action.label}
                </button>
                {action.options.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className="chicago-btn"
                    disabled={streaming}
                    title={action.hint}
                    onClick={option.run}
                  >
                    {option.label}
                  </button>
                ))}
              </span>
            ))}
          </span>
        )}
        <span>{streaming ? strings.input.streaming : strings.input.slashHint}</span>
      </div>
      {answering !== null && (
        <div className="chicago-answering" role="status">
          {strings.content.answering(answering)}
        </div>
      )}
      {unknownCommand && (
        <div className="chicago-cslash-hint" role="alert">
          {strings.commands.unknown}
        </div>
      )}
      <div className="chicago-composer-row">
        <textarea
          ref={fieldRef}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            setValue(event.target.value);
            setUnknownCommand(false);
            onInput(event.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={disabled ? strings.input.placeholderDisabled : strings.input.placeholder}
          aria-label={strings.input.placeholder}
        />
        {showStop ? (
          <button type="button" className="chicago-btn chicago-stop" onClick={stopAndRestore}>
            {strings.input.stop}
          </button>
        ) : (
          <span className="chicago-def">
            <button
              type="button"
              className={`chicago-btn ${sending ? "chicago-pressed" : ""}`}
              disabled={sendDisabled}
              onMouseDown={() => setSending(true)}
              onMouseUp={() => setSending(false)}
              onMouseLeave={() => setSending(false)}
              onClick={submit}
            >
              {strings.input.send}
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
