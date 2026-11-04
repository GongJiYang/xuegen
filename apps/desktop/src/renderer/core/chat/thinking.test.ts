import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/protocol.js";
import { thinkingFor } from "./thinking.js";

function message(id: string, role: ChatMessage["role"], overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role, markdown: "", streaming: false, toolCalls: [], ...overrides };
}

describe("thinkingFor", () => {
  it("is false for every message when the session is not thinking", () => {
    const messages = [message("u1", "user", { markdown: "hi" }), message("a1", "assistant", { streaming: true })];
    expect(thinkingFor(messages, 0, false)).toBe(false);
    expect(thinkingFor(messages, 1, false)).toBe(false);
  });

  it("marks only the last assistant block as thinking", () => {
    const messages = [
      message("u1", "user", { markdown: "hi" }),
      message("a1", "assistant", { streaming: true }),
    ];
    expect(thinkingFor(messages, 0, true)).toBe(false);
    expect(thinkingFor(messages, 1, true)).toBe(true);
  });

  it("does not mark an earlier assistant block when a tool round added a later one", () => {
    // a1 streamed text and ran tools; a2 is the fresh, still-empty block the user
    // is waiting on. Only a2 may show 正在思考.
    const messages = [
      message("u1", "user", { markdown: "问题" }),
      message("a1", "assistant", { markdown: "先查一下。", streaming: false, toolCalls: [{ toolCallId: "c1", toolName: "bash", argsSummary: "ls", status: "success" }] }),
      message("a2", "assistant", { streaming: true }),
    ];
    expect(thinkingFor(messages, 1, true)).toBe(false);
    expect(thinkingFor(messages, 2, true)).toBe(true);
  });

  it("marks a trailing assistant block even after tool calls on it", () => {
    const messages = [
      message("u1", "user", { markdown: "问题" }),
      message("a1", "assistant", { streaming: true, toolCalls: [{ toolCallId: "c1", toolName: "bash", argsSummary: "ls", status: "running" }] }),
    ];
    expect(thinkingFor(messages, 1, true)).toBe(true);
  });

  it("is false when there is no assistant message", () => {
    const messages = [message("u1", "user", { markdown: "hi" })];
    expect(thinkingFor(messages, 0, true)).toBe(false);
  });

  it("matches isThinking's window: the last block must be streaming and empty", () => {
    const settled = [
      message("u1", "user", { markdown: "hi" }),
      message("a1", "assistant", { markdown: "done", streaming: false }),
    ];
    // The session flag is derived by the caller from isThinking, so here it is false.
    expect(thinkingFor(settled, 1, false)).toBe(false);
  });
});
