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
        sessionId: null,
        streaming: false,
        queuedFollowUps: 0,
        thinkingLevel: null,
        thinkingLevels: [],
        role: { kind: "free" },
      },
      models: { models: [{ provider: "anthropic", id: "claude", name: "Claude" }] },
    });
    expect(state.ready).toBe(true);
    expect(state.agentStatus).toBe("ready");
    expect(state.session?.cwd).toBe("/x");
    expect(state.models).toHaveLength(1);
    expect(state.modelsReason).toBeNull();
  });

  it("keeps the session id a snapshot names, so the next request can name it", () => {
    const state = reduce(initialChatState, {
      type: "state",
      state: {
        cwd: "/x",
        model: null,
        sessionFile: "/home/sessions/b.jsonl",
        sessionId: "B",
        streaming: false,
        queuedFollowUps: 0,
        thinkingLevel: null,
        thinkingLevels: [],
        role: { kind: "free" },
      },
    });
    expect(state.session?.sessionId).toBe("B");
    expect(state.session?.sessionFile).toBe("/home/sessions/b.jsonl");
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

describe("chatReducer: stopped queued messages", () => {
  const u1: ChatMessage = { ...userMessage, id: "u1", markdown: "甲" };
  const a1: ChatMessage = { ...assistantMessage, id: "a1", markdown: "答甲", streaming: false };
  const u2: ChatMessage = { ...userMessage, id: "u2", markdown: "乙" };

  it("removes the messages a stop cleared out of the queue", () => {
    const state: ChatState = { ...initialChatState, messages: [u1, a1, u2], ready: true };
    const next = reduce(state, { type: "messages-removed", ids: ["u2"] });
    expect(next.messages.map((message) => message.id)).toEqual(["u1", "a1"]);
    expect(next.ready).toBe(true);
    expect(next.session).toBe(state.session);
    expect(next.errors).toBe(state.errors);
  });

  it("ignores ids that are not in the transcript", () => {
    const state: ChatState = { ...initialChatState, messages: [u1, a1] };
    const next = reduce(state, { type: "messages-removed", ids: ["nope"] });
    expect(next.messages.map((message) => message.id)).toEqual(["u1", "a1"]);
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

describe("chatReducer automatic retry updates", () => {
  const failed: ChatMessage = {
    id: "assistant-1",
    role: "assistant",
    markdown: "",
    streaming: false,
    toolCalls: [],
    errorMessage: "terminated",
  };

  it("replaces the message when its retry marker arrives", () => {
    const ended = reduce(initialChatState, { type: "message-end", message: failed });
    const retrying = reduce(ended, {
      type: "message-end",
      message: { ...failed, retry: { attempt: 1, maxAttempts: 3 } },
    });
    const recovered = reduce(retrying, { type: "message-end", message: { ...failed, retry: "recovered" } });

    expect(retrying.messages).toHaveLength(1);
    expect(retrying.messages[0]?.retry).toEqual({ attempt: 1, maxAttempts: 3 });
    expect(recovered.messages[0]?.retry).toBe("recovered");
  });

  it("drops a malformed retry marker instead of showing it", () => {
    const state = reduce(initialChatState, {
      type: "message-end",
      message: { ...failed, retry: { attempt: "x" } as never },
    });

    expect(state.messages[0]?.retry).toBeUndefined();
    expect(state.messages[0]?.errorMessage).toBe("terminated");
  });
});

describe("chatReducer retry clears the error banner", () => {
  const failed: ChatMessage = {
    id: "assistant-1",
    role: "assistant",
    markdown: "",
    streaming: false,
    toolCalls: [],
    errorMessage: "terminated",
  };

  it("drops the banner while the connection is being retried", () => {
    const errored = reduce(initialChatState, { type: "error", error: "terminated" });
    const retrying = reduce(errored, {
      type: "message-end",
      message: { ...failed, retry: { attempt: 1, maxAttempts: 3 } },
    });

    expect(retrying.errors).toEqual([]);
    expect(retrying.messages[0]?.retry).toEqual({ attempt: 1, maxAttempts: 3 });
  });

  it("raises the banner again when the retries give up", () => {
    const errored = reduce(initialChatState, { type: "error", error: "terminated" });
    const retrying = reduce(errored, {
      type: "message-end",
      message: { ...failed, retry: { attempt: 1, maxAttempts: 2 } },
    });
    const givenUp = reduce(retrying, { type: "message-end", message: failed });

    expect(givenUp.errors).toEqual(["terminated"]);
    expect(givenUp.messages[0]?.retry).toBeUndefined();
  });
});
