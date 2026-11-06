import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/protocol.js";
import { lastAssistantMessage } from "./last-assistant.js";

function message(id: string, role: ChatMessage["role"]): ChatMessage {
  return { id, role, markdown: "", streaming: false, toolCalls: [] };
}

describe("lastAssistantMessage", () => {
  it("returns the newest assistant block", () => {
    const messages = [
      message("u1", "user"),
      message("a1", "assistant"),
      message("u2", "user"),
      message("a2", "assistant"),
    ];
    expect(lastAssistantMessage(messages)?.id).toBe("a2");
  });

  it("returns the earlier answer while the next turn is still waiting", () => {
    const messages = [message("a1", "assistant"), message("u2", "user")];
    expect(lastAssistantMessage(messages)?.id).toBe("a1");
  });

  it("returns undefined for an empty or answer-less transcript", () => {
    expect(lastAssistantMessage([])).toBeUndefined();
    expect(lastAssistantMessage([message("u1", "user")])).toBeUndefined();
  });
});
