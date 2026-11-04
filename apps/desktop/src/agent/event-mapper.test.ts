import { describe, expect, it } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import { createEventMapperState, mapPiEvent, type EventMapperState } from "./event-mapper.js";
import type { AgentToHostMessage, ToolCallView } from "../shared/protocol.js";

const usage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** A minimal but structurally valid assistant message for test events. */
function assistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude",
    usage,
    stopReason: "stop",
    timestamp: 0,
    ...overrides,
  };
}

/** Deterministic id factory so assertions do not depend on time or a counter. */
function idFactory(): (prefix: string) => string {
  let counter = 0;
  return (prefix) => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

/** Fold a sequence of events through the mapper, collecting every posted message. */
function run(events: AgentSessionEvent[]): { state: EventMapperState; messages: AgentToHostMessage[] } {
  const nextId = idFactory();
  let state = createEventMapperState();
  const messages: AgentToHostMessage[] = [];
  for (const event of events) {
    const mapped = mapPiEvent(state, event, nextId);
    state = mapped.state;
    messages.push(...mapped.messages);
  }
  return { state, messages };
}

function assistantStart(): AgentSessionEvent {
  return { type: "message_start", message: assistantMessage({ stopReason: "pending" }) };
}

function userStart(): AgentSessionEvent {
  return { type: "message_start", message: { role: "user", content: "", timestamp: 0 } };
}

function textDelta(delta: string): AgentSessionEvent {
  return {
    type: "message_update",
    message: assistantMessage({ stopReason: "pending" }),
    assistantMessageEvent: {
      type: "text_delta",
      contentIndex: 0,
      delta,
      partial: assistantMessage({ stopReason: "pending" }),
    },
  };
}

function assistantEnd(overrides: Partial<AssistantMessage> = {}): AgentSessionEvent {
  return {
    type: "message_end",
    message: assistantMessage({ content: [{ type: "text", text: "hello" }], ...overrides }),
  };
}

function toolStart(toolCallId: string, toolName: string, args: unknown): AgentSessionEvent {
  return { type: "tool_execution_start", toolCallId, toolName, args };
}

function toolEnd(toolCallId: string, toolName: string, isError: boolean, result: unknown): AgentSessionEvent {
  return { type: "tool_execution_end", toolCallId, toolName, result, isError };
}

function toolCallsOf(messages: AgentToHostMessage[]): Array<{ messageId: string; call: ToolCallView }> {
  return messages
    .filter(
      (message): message is Extract<AgentToHostMessage, { type: "tool-call" }> =>
        message.type === "tool-call",
    )
    .map((message) => ({ messageId: message.messageId, call: message.call }));
}

describe("mapPiEvent tool attribution", () => {
  it("routes tool events to the assistant message that requested them", () => {
    // The exact ordering from docs/json.md: the assistant `message_end` arrives
    // before its tool executions, then the next message starts.
    const { messages } = run([
      assistantStart(),
      textDelta("Hello"),
      assistantEnd(),
      toolStart("call_abc123", "bash", { command: "ls -la" }),
      toolEnd("call_abc123", "bash", false, { content: [{ type: "text", text: "total 48" }] }),
    ]);

    const calls = toolCallsOf(messages);
    expect(calls).toHaveLength(2);
    // Both belong to the assistant message that just ended (assistant-1).
    expect(calls.map((entry) => entry.messageId)).toEqual(["assistant-1", "assistant-1"]);
    expect(calls[0]?.call.status).toBe("running");
    expect(calls[1]?.call.status).toBe("success");
    expect(calls[1]?.call.resultText).toBe("total 48");
  });

  it("marks a failed tool call as error", () => {
    const { messages } = run([
      assistantStart(),
      assistantEnd(),
      toolStart("call_x", "read", { path: "/nope" }),
      toolEnd("call_x", "read", true, { content: [{ type: "text", text: "ENOENT" }] }),
    ]);
    const calls = toolCallsOf(messages);
    expect(calls.at(-1)?.call.status).toBe("error");
    expect(calls.at(-1)?.call.resultText).toBe("ENOENT");
  });

  it("does not fall through: no tool events before any assistant message", () => {
    const { messages } = run([toolStart("call_early", "bash", {})]);
    expect(toolCallsOf(messages)).toHaveLength(0);
  });

  it("keeps multi-turn attribution correct across messages", () => {
    const { messages } = run([
      assistantStart(),
      assistantEnd(),
      toolStart("call_1", "bash", { command: "one" }),
      toolEnd("call_1", "bash", false, { content: [{ type: "text", text: "1" }] }),
      assistantStart(),
      textDelta("again"),
      assistantEnd(),
      toolStart("call_2", "bash", { command: "two" }),
      toolEnd("call_2", "bash", false, { content: [{ type: "text", text: "2" }] }),
    ]);
    const calls = toolCallsOf(messages);
    expect(calls.map((entry) => entry.messageId)).toEqual([
      "assistant-1",
      "assistant-1",
      "assistant-2",
      "assistant-2",
    ]);
  });
});

describe("mapPiEvent messages", () => {
  it("streams text deltas and finalizes with the authoritative content", () => {
    const { messages } = run([
      assistantStart(),
      textDelta("Hel"),
      textDelta("lo"),
      assistantEnd({ content: [{ type: "text", text: "Hello" }] }),
    ]);
    expect(messages.filter((entry) => entry.type === "message-delta")).toHaveLength(2);
    const end = messages.find(
      (entry): entry is Extract<AgentToHostMessage, { type: "message-end" }> => entry.type === "message-end",
    );
    expect(end?.message.markdown).toBe("Hello");
    expect(end?.message.streaming).toBe(false);
  });

  it("reports an error stop reason and clears the streaming id", () => {
    const { messages, state } = run([
      assistantStart(),
      assistantEnd({ stopReason: "error", errorMessage: "boom", content: [] }),
    ]);
    expect(state.currentAssistantId).toBeNull();
    expect(messages.some((entry) => entry.type === "error" && entry.error === "boom")).toBe(true);
    const end = messages.find(
      (entry): entry is Extract<AgentToHostMessage, { type: "message-end" }> => entry.type === "message-end",
    );
    expect(end?.message.errorMessage).toBe("boom");
  });

  it("reports an abort with the Chinese fallback text", () => {
    const { messages } = run([assistantStart(), assistantEnd({ stopReason: "aborted", content: [] })]);
    const end = messages.find(
      (entry): entry is Extract<AgentToHostMessage, { type: "message-end" }> => entry.type === "message-end",
    );
    expect(end?.message.errorMessage).toBe("已中止");
  });

  it("ignores user message events", () => {
    const { messages } = run([userStart()]);
    expect(messages).toHaveLength(0);
  });
});

describe("mapPiEvent queue and state", () => {
  it("counts steering plus follow-up messages and flags a state change", () => {
    const mapped = mapPiEvent(
      createEventMapperState(),
      { type: "queue_update", steering: ["a"], followUp: ["b", "c"] },
      idFactory(),
    );
    expect(mapped.state.queuedFollowUps).toBe(3);
    expect(mapped.stateChanged).toBe(true);
  });

  it("flags agent lifecycle events as state changes", () => {
    const events: AgentSessionEvent[] = [
      { type: "agent_start" },
      { type: "agent_end", messages: [], willRetry: false },
      { type: "agent_settled", aborted: false },
    ];
    for (const event of events) {
      const mapped = mapPiEvent(createEventMapperState(), event, idFactory());
      expect(mapped.stateChanged).toBe(true);
    }
  });

  it("does not flag unrelated events", () => {
    const mapped = mapPiEvent(createEventMapperState(), assistantStart(), idFactory());
    expect(mapped.stateChanged).toBe(false);
  });
});
