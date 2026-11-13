/**
 * Bare composer behaviour, mirroring the F5 fix so the reference skin cannot
 * drift from Chicago: 发送 with content (even while streaming), 停止 only when
 * empty, an Enter that only picks an IME candidate never sends, Escape stops a
 * running answer even with a draft in the field, and a stop puts the prompt just
 * sent back into an empty field.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMessage } from "@shared/protocol.js";
import { AssistantMessage, Composer, Thread } from "./messages.js";
import type { AssistantMessageProps, ComposerProps, ThreadProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { MessageRenderer } from "../../core/chat/message-renderer.js";
import { bareSkin } from "./index.js";

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

describe("Bare composer", () => {
  it("sends a follow-up while streaming when the field has content", async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    render(<Composer {...baseProps({ streaming: true, onSend, onStop })} />);
    await userEvent.type(screen.getByRole("textbox"), "追问");
    await userEvent.click(screen.getByRole("button", { name: strings.input.send }));
    expect(onSend).toHaveBeenCalledWith("追问");
    expect(onStop).not.toHaveBeenCalled();
  });

  it("shows 停止 only when empty during streaming", () => {
    render(<Composer {...baseProps({ streaming: true })} />);
    expect(screen.getByRole("button", { name: strings.input.stop })).toBeTruthy();
  });

  it("stops on Escape with an empty field and no menu", async () => {
    const onStop = vi.fn(() => null);
    render(<Composer {...baseProps({ streaming: true, onStop })} />);
    screen.getByRole("textbox").focus();
    await userEvent.keyboard("{Escape}");
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("does not send an Enter that only picks an IME candidate", async () => {
    const onSend = vi.fn();
    render(<Composer {...baseProps({ onSend })} />);
    const field = screen.getByRole("textbox");
    await userEvent.type(field, "你好");
    fireEvent.keyDown(field, { key: "Enter", isComposing: true });
    fireEvent.keyDown(field, { key: "Enter", keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
    expect((field as HTMLTextAreaElement).value).toBe("你好");
  });

  it("stops on Escape even when the field has text", async () => {
    const onStop = vi.fn(() => null);
    render(<Composer {...baseProps({ streaming: true, onStop })} />);
    await userEvent.type(screen.getByRole("textbox"), "还在写");
    await userEvent.keyboard("{Escape}");
    expect(onStop).toHaveBeenCalledTimes(1);
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
  });

  it("keeps the draft when a stop returns a prompt and the field has text", async () => {
    const onStop = vi.fn(() => "hello");
    render(<Composer {...baseProps({ streaming: true, onStop })} />);
    await userEvent.type(screen.getByRole("textbox"), "还在写");
    expect(screen.queryByRole("button", { name: strings.input.stop })).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("还在写");
  });
});

/**
 * Bug 1 (F6): the thinking indicator belongs to the last assistant block only.
 * A tool round leaves several assistant messages in the transcript; only the
 * final, still-empty one may show 正在思考.
 */
describe("Bare Thread thinking indicator", () => {
  function message(id: string, role: ChatMessage["role"], overrides: Partial<ChatMessage> = {}): ChatMessage {
    return { id, role, markdown: "", streaming: false, toolCalls: [], ...overrides };
  }

  function renderThread(messages: ChatMessage[], thinking: boolean): void {
    const slots = bareSkin.slots;
    const props: ThreadProps = {
      messages,
      thinking,
      noModels: false,
      modelsReason: null,
      intro: null,
      systemNotes: [],
      activity: null,
      pin: null,
      header: null,
      older: null,
      renderMessage: (message, isThinking) => (
        <MessageRenderer
          slots={slots}
          content={bareSkin.content}
          message={message}
          thinking={isThinking}
          onRetry={() => undefined}
          onExerciseAnswer={() => undefined}
          onExerciseHint={() => undefined}
          onExerciseSkip={() => undefined}
        />
      ),
    };
    render(<Thread {...props} />);
  }

  it("shows the indicator only on the last assistant block after tool calls", () => {
    renderThread(
      [
        message("u1", "user", { markdown: "问题" }),
        message("a1", "assistant", {
          markdown: "我先查一下。",
          toolCalls: [{ toolCallId: "c1", toolName: "bash", argsSummary: "ls", status: "success" }],
        }),
        message("a2", "assistant", { streaming: true }),
      ],
      true,
    );
    expect(screen.getAllByText(strings.chat.thinking)).toHaveLength(1);
    // The indicator sits inside the last assistant article.
    const articles = screen.getAllByRole("article");
    const last = articles[articles.length - 1];
    expect(last?.textContent).toContain(strings.chat.thinking);
  });

  it("shows no indicator once the block has text", () => {
    renderThread([message("u1", "user", { markdown: "hi" }), message("a1", "assistant", { markdown: "答" })], false);
    expect(screen.queryByText(strings.chat.thinking)).toBeNull();
  });
});

describe("Bare AssistantMessage automatic retry", () => {
  const props = (retry: NonNullable<ChatMessage["retry"]>): AssistantMessageProps => ({
    message: { id: "a1", role: "assistant", markdown: "", streaming: false, toolCalls: [], errorMessage: "terminated", retry },
    thinking: false,
    activity: null,
    onCopy: vi.fn(),
    copied: false,
    onRetry: vi.fn(),
    nodes: [],
    streaming: false,
    renderContent: () => null,
    renderToolCall: () => null,
  });

  it("shows the attempt count without an alert or a 重试 button", () => {
    render(<AssistantMessage {...props({ attempt: 1, maxAttempts: 2 })} />);

    expect(screen.getByText(strings.chat.retrying(1, 2))).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: strings.chat.retry })).toBeNull();
  });

  it("shows only the soft recovered line once the retry worked", () => {
    render(<AssistantMessage {...props("recovered")} />);

    expect(screen.getByText(strings.chat.retried)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: strings.chat.retry })).toBeNull();
  });
});
