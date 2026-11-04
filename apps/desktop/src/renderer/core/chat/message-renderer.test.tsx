/**
 * MessageRenderer exercise routing (B10): a `> [!question]` callout becomes the
 * Exercise slot, numbered 1-based within the message, and its buttons report the
 * same question number back through the callbacks.
 */

import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { MessageRenderer } from "./message-renderer.js";
import { bareSkin } from "../../skins/bare/index.js";
import { strings } from "../strings.js";
import type { ChatMessage } from "@shared/protocol.js";

afterEach(cleanup);

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
      slots={bareSkin.slots}
      content={bareSkin.content}
      message={assistant(markdown)}
      thinking={false}
      onRetry={() => undefined}
      onExerciseAnswer={handlers.answer ?? (() => undefined)}
      onExerciseHint={handlers.hint ?? (() => undefined)}
      onExerciseSkip={handlers.skip ?? (() => undefined)}
    />,
  );
}

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
