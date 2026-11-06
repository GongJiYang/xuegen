/**
 * Bear composer behaviour — same contract as Chicago's.
 *
 * The 发送/停止 button follows the field's contents (not merely the streaming
 * flag), a double-click must not fire two sends, Escape stops only when the
 * field is empty and the `/` menu is closed, the `/` menu takes arrows/Enter,
 * and the 「正在回答：第 N 题」 banner / focusRequest wiring work.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./composer.js";
import type { ComposerProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import type { SlashCommand } from "../../core/commands/commands.js";

afterEach(cleanup);

function baseProps(overrides: Partial<ComposerProps> = {}): ComposerProps {
  return {
    streaming: false,
    disabled: false,
    onSend: vi.fn(),
    onStop: vi.fn(),
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
    ...overrides,
  };
}

const NEW_SESSION: SlashCommand = { command: "/新会话", group: "学习", description: "开始一个新会话" };

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

  it("stops on Escape only when the field is empty and no menu is open", async () => {
    const onStop = vi.fn();
    render(<Composer {...baseProps({ streaming: true, onStop })} />);
    await userEvent.type(screen.getByRole("textbox"), "x");
    await userEvent.keyboard("{Escape}");
    expect(onStop).not.toHaveBeenCalled();

    cleanup();
    render(<Composer {...baseProps({ streaming: true, onStop })} />);
    screen.getByRole("textbox").focus();
    await userEvent.keyboard("{Escape}");
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("lets Escape close the / menu instead of stopping", async () => {
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
          commandGroups: [{ group: "学习", commands: [NEW_SESSION] }],
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
});
