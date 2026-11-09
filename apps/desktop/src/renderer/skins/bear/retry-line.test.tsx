/**
 * Bear automatic-retry rendering.
 *
 * A dropped connection that Pi retries by itself reads as one soft line: the
 * attempt count while it runs, one recovered line afterwards — never an alert
 * box and never a 重试 button.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ChatMessage } from "@shared/protocol.js";
import { AssistantMessage } from "./slots.js";
import type { AssistantMessageProps } from "../contract.js";
import { MODEL_ERROR_SUMMARIES } from "../../core/chat/model-error.js";
import { strings } from "../../core/strings.js";

afterEach(cleanup);

function retryProps(retry: NonNullable<ChatMessage["retry"]>): AssistantMessageProps {
  return {
    message: {
      id: "a1",
      role: "assistant",
      markdown: "",
      streaming: false,
      toolCalls: [],
      errorMessage: "terminated",
      retry,
    },
    thinking: false,
    activity: null,
    onCopy: vi.fn(),
    copied: false,
    onRetry: vi.fn(),
    nodes: [],
    streaming: false,
    renderContent: () => null,
    renderToolCall: () => null,
  };
}

describe("Bear retry lines", () => {
  it("shows the attempt count without an alert or a 重试 button", () => {
    render(<AssistantMessage {...retryProps({ attempt: 2, maxAttempts: 3 })} />);

    expect(screen.getByText(strings.chat.retrying(2, 3))).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: strings.chat.retry })).toBeNull();
  });

  it("shows only the soft recovered line once the retry worked", () => {
    render(<AssistantMessage {...retryProps("recovered")} />);

    expect(screen.getByText(strings.chat.retried)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(MODEL_ERROR_SUMMARIES.network)).toBeNull();
    expect(screen.queryByRole("button", { name: strings.chat.retry })).toBeNull();
  });

  it("keeps the alert and 重试 for a failure that was not retried", () => {
    const props = retryProps("recovered");
    render(
      <AssistantMessage
        {...props}
        message={{ ...props.message, id: "a2", retry: undefined }}
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: strings.chat.retry })).toBeTruthy();
  });
});
