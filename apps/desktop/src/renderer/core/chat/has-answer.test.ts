import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/protocol.js";
import { hasAnswer } from "./has-answer.js";

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return { id: "m1", role: "assistant", markdown: "", streaming: false, toolCalls: [], ...overrides };
}

describe("hasAnswer", () => {
  it("is false for an empty transcript", () => {
    expect(hasAnswer([])).toBe(false);
  });

  it("is false while only the learner has spoken", () => {
    expect(hasAnswer([message({ role: "user", markdown: "开始今天的学习" })])).toBe(false);
  });

  it("is true once 学根 has written something", () => {
    expect(hasAnswer([message({ markdown: "今天读 2.1" })])).toBe(true);
  });

  it("ignores an assistant message with only whitespace", () => {
    expect(hasAnswer([message({ markdown: "  \n " })])).toBe(false);
  });

  it("ignores a failed assistant message", () => {
    expect(hasAnswer([message({ markdown: "", errorMessage: "连接中断：模型返回错误。" })])).toBe(false);
  });
});
