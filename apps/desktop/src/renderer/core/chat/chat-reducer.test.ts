import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState, isThinking, type ChatState } from "./chat-reducer.js";
import type { AgentToHostMessage, ChatMessage } from "@shared/protocol.js";

function reduce(state: ChatState, event: AgentToHostMessage): ChatState {
  return chatReducer(state, { kind: "agent-event", event });
}

const userMessage: ChatMessage = {
  id: "user-1",
  role: "user",
  markdown: "hi",
  streaming: false,
  toolCalls: [],
};

const assistantMessage: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  markdown: "",
  streaming: true,
  toolCalls: [],
};

describe("chatReducer agent events", () => {
  it("applies ready: session, models, and ready flag", () => {
    const state = reduce(initialChatState, {
      type: "ready",
      state: {
        cwd: "/x",
        model: null,
        sessionFile: null,
        streaming: false,
        queuedFollowUps: 0,
        thinkingLevel: null,
        thinkingLevels: [],
      },
      models: { models: [{ provider: "anthropic", id: "claude", name: "Claude" }] },
    });
    expect(state.ready).toBe(true);
    expect(state.agentStatus).toBe("ready");
    expect(state.session?.cwd).toBe("/x");
    expect(state.models).toHaveLength(1);
    expect(state.modelsReason).toBeNull();
  });

  it("records a model-list reason", () => {
    const state = reduce(initialChatState, {
      type: "models",
      models: { models: [], reason: "未配置任何凭据或模型。" },
    });
    expect(state.modelsReason).toBe("未配置任何凭据或模型。");
  });

  it("replaces the transcript on history", () => {
    const withOne = reduce(initialChatState, { type: "message-end", message: userMessage });
    const replaced = reduce(withOne, { type: "history", messages: [assistantMessage] });
    expect(replaced.messages).toHaveLength(1);
    expect(replaced.messages[0]?.id).toBe("assistant-1");
  });

  it("appends streaming text deltas to the matching message", () => {
    const started = reduce(initialChatState, { type: "message-start", message: assistantMessage });
    const updated = reduce(started, { type: "message-delta", messageId: "assistant-1", text: "He" });
    const more = reduce(updated, { type: "message-delta", messageId: "assistant-1", text: "llo" });
    expect(more.messages[0]?.markdown).toBe("Hello");
    expect(more.messages[0]?.streaming).toBe(true);
  });

  it("ignores a delta for an unknown message id", () => {
    const state = reduce(initialChatState, { type: "message-delta", messageId: "nope", text: "x" });
    expect(state.messages).toHaveLength(0);
  });

  it("finalizes a message on message-end", () => {
    const started = reduce(initialChatState, { type: "message-start", message: assistantMessage });
    const ended = reduce(started, {
      type: "message-end",
      message: { ...assistantMessage, markdown: "done", streaming: true },
    });
    expect(ended.messages[0]?.streaming).toBe(false);
    expect(ended.messages[0]?.markdown).toBe("done");
  });

  it("adds then updates a tool call in place", () => {
    const started = reduce(initialChatState, { type: "message-start", message: assistantMessage });
    const running = reduce(started, {
      type: "tool-call",
      messageId: "assistant-1",
      call: { toolCallId: "c1", toolName: "bash", argsSummary: "ls", status: "running" },
    });
    expect(running.messages[0]?.toolCalls).toHaveLength(1);
    const done = reduce(running, {
      type: "tool-call",
      messageId: "assistant-1",
      call: {
        toolCallId: "c1",
        toolName: "bash",
        argsSummary: "ls",
        status: "success",
        resultText: "ok",
      },
    });
    expect(done.messages[0]?.toolCalls).toHaveLength(1);
    expect(done.messages[0]?.toolCalls[0]?.status).toBe("success");
  });

  it("tracks agent status", () => {
    const restarting = reduce(initialChatState, { type: "agent-status", status: "restarting" });
    expect(restarting.agentStatus).toBe("restarting");
  });

  it("collects error and fatal messages", () => {
    const first = reduce(initialChatState, { type: "error", error: "boom" });
    const second = reduce(first, { type: "fatal", error: "crash" });
    expect(second.errors).toEqual(["boom", "crash"]);
  });

  it("shows a repeated error once, keeping the latest", () => {
    const limit = (id: string): string =>
      `429: {"message":"您已达到请求数限制：1分钟内最多请求1000次 (request id: ${id})"}`;
    const three = [limit("a"), limit("b"), limit("c")].reduce(
      (state, error) => reduce(state, { type: "error", error }),
      initialChatState,
    );
    expect(three.errors).toEqual([limit("c")]);
    const mixed = reduce(reduce(three, { type: "error", error: "boom" }), { type: "error", error: "boom" });
    expect(mixed.errors).toEqual([limit("c"), "boom"]);
  });

  it("does not mutate the previous state", () => {
    const started = reduce(initialChatState, { type: "message-start", message: assistantMessage });
    reduce(started, { type: "message-delta", messageId: "assistant-1", text: "x" });
    expect(started.messages[0]?.markdown).toBe("");
  });
});

describe("chatReducer local actions", () => {
  it("dismisses an error by index", () => {
    const withErrors = reduce(reduce(initialChatState, { type: "error", error: "a" }), {
      type: "error",
      error: "b",
    });
    const dismissed = chatReducer(withErrors, { kind: "dismiss-error", index: 0 });
    expect(dismissed.errors).toEqual(["b"]);
  });

  it("clears messages", () => {
    const withMessage = reduce(initialChatState, { type: "message-end", message: userMessage });
    const cleared = chatReducer(withMessage, { kind: "clear-messages" });
    expect(cleared.messages).toHaveLength(0);
  });
});

describe("isThinking", () => {
  it("is true only for a streaming, still-empty assistant block", () => {
    expect(isThinking([assistantMessage])).toBe(true);
    expect(isThinking([{ ...assistantMessage, markdown: "hi" }])).toBe(false);
    expect(isThinking([{ ...assistantMessage, streaming: false }])).toBe(false);
    expect(isThinking([userMessage])).toBe(false);
    expect(isThinking([userMessage, assistantMessage])).toBe(true);
    expect(isThinking([])).toBe(false);
  });
});

describe("chatReducer context usage and compaction", () => {
  it("drops the previous session's usage when a transcript is replayed", () => {
    const withUsage = reduce(initialChatState, {
      type: "context-usage",
      tokens: 10,
      contextWindow: 100,
      percent: 10,
    });
    expect(withUsage.contextUsage?.percent).toBe(10);
    const replayed = reduce(withUsage, { type: "history", messages: [], notes: [] });
    expect(replayed.contextUsage).toBeNull();
  });

  it("adds a compaction note at the end of the transcript when one finishes", () => {
    const started = reduce(initialChatState, { type: "compaction", phase: "start", reason: "threshold" });
    expect(started.compaction?.phase).toBe("start");
    const ended = reduce(started, { type: "compaction", phase: "end", reason: "threshold", aborted: false });
    expect(ended.compaction).toBeNull();
    expect(ended.systemNotes).toEqual([{ beforeIndex: 0, kind: "compaction" }]);
  });
});
