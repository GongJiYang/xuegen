/**
 * Chicago composer behaviour — the F5 fix for accidentally stopping an answer.
 *
 * The 发送/停止 button must follow the field's contents (not merely the streaming
 * flag), a double-click must not fire two sends, and Escape stops only when the
 * field is empty and the `/` menu is closed.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./composer.js";
import type { ComposerProps } from "../contract.js";
import { strings } from "../../core/strings.js";

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
    lessonActions: [],
    defaultStyleLabel: "默认",
    ...overrides,
  };
}

describe("Chicago composer", () => {
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
    const button = screen.getByRole("button", { name: strings.input.send });
    await userEvent.click(button);
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

  it("shows the 「正在回答：第 N 题」 banner while answering (B10)", () => {
    render(<Composer {...baseProps({ answering: 2 })} />);
    expect(screen.getByText(strings.content.answering(2))).toBeTruthy();
  });

  it("hides the answering banner when no question is being answered", () => {
    render(<Composer {...baseProps({ answering: null })} />);
    expect(screen.queryByText(strings.content.answering(1))).toBeNull();
  });

  it("focuses the field when core bumps focusRequest (B10)", () => {
    const { rerender } = render(<Composer {...baseProps({ focusRequest: 0 })} />);
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));

    rerender(<Composer {...baseProps({ focusRequest: 1 })} />);
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });
});
