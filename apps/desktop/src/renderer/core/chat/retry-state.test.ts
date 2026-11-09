import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/protocol.js";
import { retryDisplayOf } from "./retry-state.js";
import { strings } from "../strings.js";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "a1",
    role: "assistant",
    markdown: "",
    streaming: false,
    toolCalls: [],
    errorMessage: "terminated",
    ...overrides,
  };
}

describe("retryDisplayOf", () => {
  it("shows the attempt count while Pi retries", () => {
    expect(retryDisplayOf(message({ retry: { attempt: 2, maxAttempts: 3 } }))).toEqual({
      kind: "retrying",
      text: strings.chat.retrying(2, 3),
    });
  });

  it("shows one soft line once a retry produced an answer", () => {
    expect(retryDisplayOf(message({ retry: "recovered" }))).toEqual({
      kind: "recovered",
      text: strings.chat.retried,
    });
  });

  it("falls back to the error block when there is no retry marker", () => {
    expect(retryDisplayOf(message())).toEqual({ kind: "error" });
  });
});
