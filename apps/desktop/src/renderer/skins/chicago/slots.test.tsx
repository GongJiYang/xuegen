/**
 * Chicago assistant message behaviour — the F5 "stopped is not an error" fix.
 *
 * A stopped answer shows the guidance line as a status (not an alert) and a 重试
 * button that resends the last user message; a real error keeps its alert role.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantMessage } from "./slots.js";
import type { AssistantMessageProps } from "../contract.js";
import { MODEL_ERROR_SUMMARIES } from "../../core/chat/model-error.js";
import { strings } from "../../core/strings.js";

afterEach(cleanup);

function baseProps(overrides: Partial<AssistantMessageProps> = {}): AssistantMessageProps {
  return {
    message: { id: "a1", role: "assistant", markdown: "部分内容", streaming: false, toolCalls: [] },
    thinking: false,
    onCopy: vi.fn(),
    copied: false,
    onRetry: vi.fn(),
    nodes: [],
    streaming: false,
    renderContent: () => null,
    renderToolCall: () => null,
    ...overrides,
  };
}

describe("Chicago AssistantMessage", () => {
  it("shows a stop as guidance, not an alert, and offers 重试", async () => {
    const onRetry = vi.fn();
    render(
      <AssistantMessage
        {...baseProps({
          onRetry,
          message: { id: "a1", role: "assistant", markdown: "", streaming: false, toolCalls: [], errorMessage: "已中止" },
        })}
      />,
    );

    expect(screen.getByText(MODEL_ERROR_SUMMARIES.aborted)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: strings.chat.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps a real error as an alert with a 重试 button", () => {
    render(
      <AssistantMessage
        {...baseProps({
          message: {
            id: "a1",
            role: "assistant",
            markdown: "",
            streaming: false,
            toolCalls: [],
            errorMessage: "429 Too Many Requests",
          },
        })}
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: strings.chat.retry })).toBeTruthy();
  });
});
