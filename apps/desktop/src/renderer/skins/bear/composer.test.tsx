/**
 * Bear composer behaviour — same contract as Chicago's.
 *
 * The 发送/停止 button follows the field's contents (not merely the streaming
 * flag), a double-click must not fire two sends, an Enter that only picks an IME
 * candidate never sends, Escape stops a running answer even with a draft in the
 * field (and puts the prompt just sent back into an empty field), the `/` menu
 * takes arrows/Enter, and the 「正在回答：第 N 题」 banner / focusRequest wiring work.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./composer.js";
import type { ComposerProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import type { SlashCommand } from "../../core/commands/commands.js";
import { clearBackToLatest, publishBackToLatest } from "./back-to-latest.js";

afterEach(cleanup);

function baseProps(overrides: Partial<ComposerProps> = {}): ComposerProps {
  return {
    streaming: false,
    disabled: false,
    onSend: vi.fn(),
    onStop: vi.fn(),
    carriedDraft: null,
    onCarriedDraftTaken: vi.fn(),
    style: "plain",
    onStyle: vi.fn(),
    commandsOpen: false,
    commandGroups: [],
    commands: [],
    selectedCommand: 0,
    onSelectCommand: vi.fn(),
    onRunCommand: vi.fn(),
    onCloseCommands: vi.fn(),
    onInput: vi.fn(),
    answering: null,
    focusRequest: 0,
    lessonActions: [],
    defaultStyleLabel: "默认",
    ...overrides,
  };
}

const NEW_SESSION: SlashCommand = { command: "/新会话", group: "会话", description: "开一个空白会话" };

describe("Bear composer", () => {
  it("sends on Enter, not on Shift+Enter", async () => {
    const onSend = vi.fn();
    render(<Composer {...baseProps({ onSend })} />);
    const field = screen.getByRole("textbox");
    await userEvent.type(field, "第一行{Shift>}{Enter}{/Shift}第二行");
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(field, "{Enter}");
    expect(onSend).toHaveBeenCalledWith("第一行\n第二行");
  });

  it("shows 发送 and queues a follow-up when the field has content while streaming", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    render(<Composer {...baseProps({ streaming: true, onSend, onStop })} />);

    await userEvent.type(screen.getByRole("textbox"), "再讲讲边界");
    const send = screen.getByRole("button", { name: strings.input.send });
    expect(screen.queryByRole("button", { name: strings.input.stop })).toBeNull();

    await userEvent.click(send);
    expect(onSend).toHaveBeenCalledWith("再讲讲边界");
    expect(onStop).not.toHaveBeenCalled();
  });

  it("shows 停止 only when the field is empty during streaming", () => {
    render(<Composer {...baseProps({ streaming: true })} />);
    expect(screen.getByRole("button", { name: strings.input.stop })).toBeTruthy();
    expect(screen.queryByRole("button", { name: strings.input.send })).toBeNull();
  });

  it("ignores a second send within the debounce window", async () => {
    const onSend = vi.fn();
    render(<Composer {...baseProps({ onSend })} />);
    await userEvent.type(screen.getByRole("textbox"), "问题");
    await userEvent.click(screen.getByRole("button", { name: strings.input.send }));
    // The field is cleared by the first send, so re-fill and click again at once.
    await userEvent.type(screen.getByRole("textbox"), "第二问");
    await userEvent.click(screen.getByRole("button", { name: strings.input.send }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("does not send an Enter that only picks an IME candidate", async () => {
    const onSend = vi.fn();
    render(<Composer {...baseProps({ onSend })} />);
    const field = screen.getByRole("textbox");
    await userEvent.type(field, "你好");
    // Chromium/Safari report the candidate Enter as composing; some IMEs only
    // leave `keyCode 229` behind, hence both cases.
    fireEvent.keyDown(field, { key: "Enter", isComposing: true });
    fireEvent.keyDown(field, { key: "Enter", keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
    expect((field as HTMLTextAreaElement).value).toBe("你好");
  });

  it("does not stop on an Escape that cancels an IME composition", async () => {
    const onStop = vi.fn(() => "hello");
    render(<Composer {...baseProps({ streaming: true, onStop })} />);
    const field = screen.getByRole("textbox");
    fireEvent.keyDown(field, { key: "Escape", isComposing: true });
    fireEvent.keyDown(field, { key: "Escape", keyCode: 229 });
    expect(onStop).not.toHaveBeenCalled();
    expect((field as HTMLTextAreaElement).value).toBe("");
  });

  it("stops on Escape even when the field has text", async () => {
    const onStop = vi.fn(() => null);
    render(<Composer {...baseProps({ streaming: true, onStop })} />);
    await userEvent.type(screen.getByRole("textbox"), "还在写");
    await userEvent.keyboard("{Escape}");
    expect(onStop).toHaveBeenCalledTimes(1);
    // Nothing to put back, so the draft stays in the field.
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("还在写");
  });

  it("puts the prompt just sent back into an empty field on stop", async () => {
    const onInput = vi.fn();
    const onStop = vi.fn(() => "hello");
    render(<Composer {...baseProps({ streaming: true, onStop, onInput })} />);
    const field = screen.getByRole("textbox");
    field.focus();
    await userEvent.keyboard("{Escape}");
    expect((field as HTMLTextAreaElement).value).toBe("hello");
    expect(onInput).toHaveBeenCalledWith("hello");
    expect((field as HTMLTextAreaElement).selectionStart).toBe("hello".length);
  });

  it("puts the prompt back from the ■ button too", async () => {
    const onStop = vi.fn(() => "hello");
    render(<Composer {...baseProps({ streaming: true, onStop })} />);
    await userEvent.click(screen.getByRole("button", { name: strings.input.stop }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("hello");
  });

  it("puts a withdrawn message in front of a draft the field already has", async () => {
    const onInput = vi.fn();
    const onStop = vi.fn(() => "B");
    render(<Composer {...baseProps({ streaming: true, onStop, onInput })} />);
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(field, "新写的");
    await userEvent.keyboard("{Escape}");
    expect(onStop).toHaveBeenCalledTimes(1);
    // The withdrawn message was already removed from the transcript, so dropping
    // it would lose it: it goes in front of the draft instead.
    expect(field.value).toBe("B\n新写的");
    expect(onInput).toHaveBeenLastCalledWith("B\n新写的");
    // The caret moves once React has committed the value (next animation frame).
    await waitFor(() => expect(field.selectionStart).toBe("B".length));
  });

  it("puts words carried over from a confirmed switch in front of the draft, once", async () => {
    const onInput = vi.fn();
    const onCarriedDraftTaken = vi.fn();
    const { rerender } = render(<Composer {...baseProps({ carriedDraft: null, onCarriedDraftTaken })} />);
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(field, "草稿");
    expect(onCarriedDraftTaken).not.toHaveBeenCalled();
    rerender(<Composer {...baseProps({ carriedDraft: "排队那句", onInput, onCarriedDraftTaken })} />);
    await waitFor(() => expect(field.value).toBe("排队那句\n草稿"));
    expect(onInput).toHaveBeenLastCalledWith("排队那句\n草稿");
    expect(onCarriedDraftTaken).toHaveBeenCalledTimes(1);
    // Core clears the value after taking it: a re-render must not put it in again.
    rerender(<Composer {...baseProps({ carriedDraft: null, onInput, onCarriedDraftTaken })} />);
    expect(field.value).toBe("排队那句\n草稿");
    expect(onCarriedDraftTaken).toHaveBeenCalledTimes(1);
  });

  it("let Escape close the / menu instead of stopping", async () => {
    const onStop = vi.fn();
    const onCloseCommands = vi.fn();
    render(<Composer {...baseProps({ streaming: true, onStop, commandsOpen: true, onCloseCommands })} />);
    screen.getByRole("textbox").focus();
    await userEvent.keyboard("{Escape}");
    expect(onCloseCommands).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("moves the / menu selection with arrows and runs it on Enter", async () => {
    const onSelectCommand = vi.fn();
    const onRunCommand = vi.fn();
    render(
      <Composer
        {...baseProps({
          commandsOpen: true,
          commands: [NEW_SESSION],
          commandGroups: [{ group: "会话", commands: [NEW_SESSION] }],
          selectedCommand: 0,
          onSelectCommand,
          onRunCommand,
        })}
      />,
    );
    const field = screen.getByRole("textbox");
    field.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onSelectCommand).toHaveBeenCalledWith(0);
    await userEvent.keyboard("{Enter}");
    expect(onRunCommand).toHaveBeenCalledWith(NEW_SESSION);
  });

  it("shows the 「正在回答：第 N 题」 banner while answering", () => {
    render(<Composer {...baseProps({ answering: 2 })} />);
    expect(screen.getByText(strings.content.answering(2))).toBeTruthy();
  });

  it("focuses the field when core bumps focusRequest", () => {
    const { rerender } = render(<Composer {...baseProps({ focusRequest: 0 })} />);
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));

    rerender(<Composer {...baseProps({ focusRequest: 1 })} />);
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("hides 「回到最新」 while the transcript is at its bottom", () => {
    const published = publishBackToLatest(true, vi.fn());
    render(<Composer {...baseProps()} />);
    expect(screen.queryByRole("button", { name: strings.chat.backToLatest })).toBeNull();
    clearBackToLatest(published);
  });

  it("draws 「回到最新」 inside the composer wrapper and jumps on click", async () => {
    const jump = vi.fn();
    const published = publishBackToLatest(false, jump);
    render(<Composer {...baseProps()} />);
    const button = screen.getByRole("button", { name: strings.chat.backToLatest });
    // A child of the composer wrapper, so it hangs on the card's top edge.
    expect(button.parentElement?.className).toBe("bear-composer");
    await userEvent.click(button);
    expect(jump).toHaveBeenCalledTimes(1);
    clearBackToLatest(published);
  });
});
