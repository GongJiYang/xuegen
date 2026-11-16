/**
 * The stop / error status at the end of an answer (retry-line mockup, user 11-16).
 *
 * A stop reads as one thin line with a 重新回答 link; a real failure shows the
 * translated summary in red, a 重试 link and an expandable raw detail.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnswerStatus } from "./answer-status.js";
import { AssistantMessage } from "./slots.js";
import type { AssistantMessageProps } from "../contract.js";
import { MODEL_ERROR_SUMMARIES } from "../../core/chat/model-error.js";

afterEach(cleanup);

describe("AnswerStatus", () => {
  it("renders a stop with an answer above as one line with 重新回答", () => {
    const onRetry = vi.fn();
    const { container } = render(
      <AnswerStatus raw="Request was aborted" hasText onRetry={onRetry} />,
    );

    expect(screen.getByText("已停止")).toBeTruthy();
    expect(screen.getByText("或直接接着问")).toBeTruthy();
    const again = screen.getByRole("button", { name: "重新回答" });
    expect(again.getAttribute("title")).toBe("重发上一条提问");
    fireEvent.click(again);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("bear-answer-status");
    expect(root.getAttribute("data-kind")).toBe("stopped");
    expect(root.hasAttribute("data-has-text")).toBe(true);
  });

  it("renders a stop with no answer above without the divider attribute", () => {
    const { container } = render(
      <AnswerStatus raw="Request was aborted" hasText={false} onRetry={vi.fn()} />,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-kind")).toBe("stopped");
    expect(root.hasAttribute("data-has-text")).toBe(false);
  });

  it("renders an auth failure with 重试 and an expandable detail", () => {
    const raw = '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}';
    const onRetry = vi.fn();
    const { container } = render(<AnswerStatus raw={raw} hasText onRetry={onRetry} />);

    expect(screen.getByRole("alert").textContent).toContain(MODEL_ERROR_SUMMARIES.auth);
    const retry = screen.getByRole("button", { name: "重试" });
    expect(retry.getAttribute("title")).toBe("重发上一条提问");
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);

    const detail = screen.getByRole("button", { name: "详情" });
    expect(detail.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("pre")).toBeNull();
    fireEvent.click(detail);
    expect(detail.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("pre")?.textContent).toBe(raw);
    expect(screen.queryByRole("button", { name: "重新回答" })).toBeNull();
  });

  it("renders a failure with no detail without the 详情 button", () => {
    render(<AnswerStatus raw="" hasText onRetry={vi.fn()} />);

    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "详情" })).toBeNull();
  });
});

function retryProps(): AssistantMessageProps {
  return {
    message: {
      id: "a1",
      role: "assistant",
      markdown: "",
      streaming: false,
      toolCalls: [],
      errorMessage: "Request was aborted",
    },
    thinking: false,
    activity: null,
    onCopy: vi.fn(),
    copied: false,
    onRetry: vi.fn(),
    nodes: [{} as never],
    streaming: false,
    renderContent: () => <p>正文</p>,
    renderToolCall: () => null,
  };
}

describe("AssistantMessage status line", () => {
  it("wires the stop into AnswerStatus", () => {
    const { container } = render(<AssistantMessage {...retryProps()} />);

    expect(screen.getByRole("button", { name: "重新回答" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
    const root = container.querySelector(".bear-answer-status") as HTMLElement;
    expect(root.hasAttribute("data-has-text")).toBe(true);
  });
});
