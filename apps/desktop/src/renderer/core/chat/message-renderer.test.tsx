/**
 * MessageRenderer exercise routing (B10): a `> [!question]` callout becomes the
 * Exercise slot, numbered 1-based within the message, and its buttons report the
 * same question number back through the callbacks.
 */

import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { MessageRenderer } from "./message-renderer.js";
import { strings } from "../strings.js";
import type { ChatMessage } from "@shared/protocol.js";
import type {
  AssistantMessageProps,
  ContentRenderers,
  ExerciseProps,
  SkinSlots,
  UserMessageProps,
} from "../../skins/contract.js";

afterEach(cleanup);

/**
 * A minimal in-test skin. Core must not import a real skin (eslint enforces the
 * dependency direction), so this test double renders only what the routing
 * assertions inspect.
 */
function FakeExercise({ title, nodes, renderContent, onAnswer, onHint, onSkip }: ExerciseProps) {
  return (
    <section>
      <h3>{title || strings.content.exerciseTitle}</h3>
      {nodes.map((node, index) => (
        <div key={index}>{renderContent(node)}</div>
      ))}
      <button type="button" onClick={onSkip}>
        {strings.content.exerciseSkip}
      </button>
      <button type="button" onClick={onHint}>
        {strings.content.exerciseHint}
      </button>
      <button type="button" onClick={onAnswer}>
        {strings.content.exerciseAnswer}
      </button>
    </section>
  );
}

function FakeUser({ body }: UserMessageProps) {
  return <div data-testid="user-body">{body}</div>;
}

function FakeAssistant({ nodes, streaming, renderContent }: AssistantMessageProps) {
  return (
    <div>
      {nodes.map((node, index) => (
        <div key={index}>{renderContent(node, streaming)}</div>
      ))}
    </div>
  );
}

const fakeSlots = {
  Exercise: FakeExercise,
  AssistantMessage: FakeAssistant,
  UserMessage: FakeUser,
  ToolActivity: () => null,
} as unknown as SkinSlots;

const fakeContent: ContentRenderers = { Node: () => null };

function assistant(markdown: string): ChatMessage {
  return { id: "a1", role: "assistant", markdown, streaming: false, toolCalls: [] };
}

function renderMessage(markdown: string, handlers: {
  answer?: (n: number) => void;
  hint?: (n: number) => void;
  skip?: (n: number) => void;
} = {}): void {
  render(
    <MessageRenderer
      slots={fakeSlots}
      content={fakeContent}
      message={assistant(markdown)}
      thinking={false}
      onRetry={() => undefined}
      onExerciseAnswer={handlers.answer ?? (() => undefined)}
      onExerciseHint={handlers.hint ?? (() => undefined)}
      onExerciseSkip={handlers.skip ?? (() => undefined)}
    />,
  );
}

describe("MessageRenderer user message", () => {
  it("strips the 总控 refresh note before the user sees it", () => {
    render(
      <MessageRenderer
        slots={fakeSlots}
        content={fakeContent}
        message={{
          id: "u1",
          role: "user",
          markdown: `${strings.chat.controlRefreshNote} 今天的进度怎么样？`,
          streaming: false,
          toolCalls: [],
        }}
        thinking={false}
        onRetry={() => undefined}
        onExerciseAnswer={() => undefined}
        onExerciseHint={() => undefined}
        onExerciseSkip={() => undefined}
      />,
    );
    const body = screen.getByTestId("user-body").textContent ?? "";
    expect(body).toBe("今天的进度怎么样？");
    expect(body).not.toContain(strings.chat.controlRefreshNote);
  });

  it("still strips the course refresh note", () => {
    render(
      <MessageRenderer
        slots={fakeSlots}
        content={fakeContent}
        message={{
          id: "u2",
          role: "user",
          markdown: `${strings.chat.refreshNote} 接着上次`,
          streaming: false,
          toolCalls: [],
        }}
        thinking={false}
        onRetry={() => undefined}
        onExerciseAnswer={() => undefined}
        onExerciseHint={() => undefined}
        onExerciseSkip={() => undefined}
      />,
    );
    expect(screen.getByTestId("user-body").textContent).toBe("接着上次");
  });
});

describe("MessageRenderer exercise routing", () => {
  it("routes a question callout to the Exercise slot", () => {
    renderMessage("> [!question] 检查理解\n> X 是多少？\n");
    expect(screen.getByRole("heading", { name: strings.content.exerciseTitle })).toBeTruthy();
    expect(screen.queryByText(strings.content.exerciseHint)).toBeTruthy();
  });

  it("numbers multiple questions within one message, 1-based", () => {
    const hint = vi.fn();
    renderMessage(
      "> [!question] 检查理解\n> 第一题\n\n> [!question] 检查理解\n> 第二题\n",
      { hint },
    );
    const hintButtons = screen.getAllByRole("button", { name: strings.content.exerciseHint });
    expect(hintButtons).toHaveLength(2);
    fireEvent.click(hintButtons[1]!);
    expect(hint).toHaveBeenCalledWith(2);
  });

  it("reports the question number through answer and skip", () => {
    const answer = vi.fn();
    const skip = vi.fn();
    renderMessage("> [!question] 检查理解\n> 只有一题\n", { answer, skip });
    fireEvent.click(screen.getByRole("button", { name: strings.content.exerciseAnswer }));
    fireEvent.click(screen.getByRole("button", { name: strings.content.exerciseSkip }));
    expect(answer).toHaveBeenCalledWith(1);
    expect(skip).toHaveBeenCalledWith(1);
  });

  it("does not route a non-question callout to Exercise", () => {
    renderMessage("> [!note] 提示\n> 这只是一个提示\n");
    expect(screen.queryByRole("button", { name: strings.content.exerciseAnswer })).toBeNull();
  });
});
