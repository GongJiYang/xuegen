/**
 * Every session-scoped request must name the session it was meant for.
 *
 * The agent drops a request whose `sessionId` no longer matches the active
 * session, so the controller has to pick up a new id as soon as the snapshot
 * arrives — a send in the same turn as `ready` / `state` must already use it.
 * These tests drive that timing: emit a snapshot, then send/stop/compact/retry
 * without letting an effect run in between.
 */

import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { AgentToHostMessage, HostToAgentMessage, SessionStatePayload } from "@shared/protocol.js";
import { useChat } from "./useChat.js";
import * as client from "../client.js";

let captured: ReturnType<typeof useChat> | null = null;

function Harness() {
  const controller = useChat();
  useEffect(() => {
    captured = controller;
  });
  return null;
}

function stateWith(sessionId: string | null, streaming = false): SessionStatePayload {
  return {
    cwd: "/tmp",
    model: null,
    sessionFile: sessionId === null ? null : `/home/sessions/${sessionId}.jsonl`,
    sessionId,
    role: { kind: "free" },
    streaming,
    queuedFollowUps: 0,
    thinkingLevel: null,
    thinkingLevels: [],
  };
}

interface Bridge {
  controller(): ReturnType<typeof useChat>;
  emit(event: AgentToHostMessage): void;
  sent: ReturnType<typeof vi.spyOn>;
}

function setUp(): Bridge {
  const sent = vi.spyOn(client, "send").mockImplementation(() => undefined);
  let listener: ((event: AgentToHostMessage) => void) | null = null;
  vi.spyOn(client, "subscribe").mockImplementation((next) => {
    listener = next;
    return () => {
      listener = null;
    };
  });
  render(<Harness />);
  return {
    // Read the latest render's controller: `retry` closes over the transcript,
    // so a stale one would see an empty message list.
    controller: () => {
      if (!captured) throw new Error("controller not captured");
      return captured;
    },
    emit: (event) => listener?.(event),
    sent,
  };
}

/** Narrow a captured `client.send` argument to a session-scoped request. */
function isScopedRequest(
  value: unknown,
): value is Extract<HostToAgentMessage, { type: "prompt" | "abort" | "compact" }> {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === "prompt" || type === "abort" || type === "compact";
}

/** Narrow a captured `client.send` argument to an `open-session` request. */
function isOpenRequest(value: unknown): value is Extract<HostToAgentMessage, { type: "open-session" }> {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "open-session";
}

/** The session id the last request of `type` was sent with. */
function lastIdFor(sent: Bridge["sent"], type: "prompt" | "abort" | "compact"): string | undefined {
  const calls = sent.mock.calls.flatMap(([message]: unknown[]) =>
    isScopedRequest(message) && message.type === type ? [message] : [],
  );
  return calls.at(-1)?.sessionId;
}

describe("useChat stamps requests with the session id", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a prompt with the id from `ready`", () => {
    const bridge = setUp();
    act(() => {
      bridge.emit({ type: "ready", state: stateWith("A"), models: { models: [] } });
    });
    act(() => {
      bridge.controller().send("你好");
    });
    expect(lastIdFor(bridge.sent, "prompt")).toBe("A");
  });

  it("sends a prompt with the id from a new `state`, without waiting for an effect", () => {
    const bridge = setUp();
    act(() => {
      bridge.emit({ type: "ready", state: stateWith("A"), models: { models: [] } });
    });
    // Session switch: the snapshot names B, and a send in the same turn must
    // already target B, or the agent would treat it as a stale request.
    act(() => {
      bridge.emit({ type: "state", state: stateWith("B") });
      bridge.controller().send("继续");
    });
    expect(lastIdFor(bridge.sent, "prompt")).toBe("B");
  });

  it("sends a command prompt with the current id", () => {
    const bridge = setUp();
    act(() => {
      bridge.emit({ type: "state", state: stateWith("B") });
    });
    act(() => {
      bridge.controller().sendCommand("把这次学到的内容起草成卡片");
    });
    expect(lastIdFor(bridge.sent, "prompt")).toBe("B");
  });

  it("stamps stop and compact with the current id", () => {
    const bridge = setUp();
    act(() => {
      bridge.emit({ type: "state", state: stateWith("B") });
    });
    act(() => {
      bridge.controller().stop();
      bridge.controller().compact();
    });
    expect(lastIdFor(bridge.sent, "abort")).toBe("B");
    expect(lastIdFor(bridge.sent, "compact")).toBe("B");
  });

  it("sends the new id on the first prompt after an `open-session` switch", async () => {
    const bridge = setUp();
    act(() => {
      bridge.emit({ type: "ready", state: stateWith("A"), models: { models: [] } });
    });
    let switched: Promise<string | null> = Promise.resolve(null);
    act(() => {
      switched = bridge.controller().openSession("/home/sessions/B.jsonl", { kind: "course", slug: "ctm" });
    });
    const requestId = bridge.sent.mock.calls
      .flatMap(([message]: unknown[]) => (isOpenRequest(message) ? [message.requestId] : []))
      .at(-1);
    if (!requestId) throw new Error("no open-session sent");
    // The agent restarts, then answers: the new snapshot first, then the reply.
    act(() => {
      bridge.emit({ type: "state", state: stateWith("B") });
    });
    act(() => {
      bridge.emit({ type: "session-opened", requestId, sessionFile: "/home/sessions/B.jsonl" });
    });
    act(() => {
      bridge.controller().send("开始今天的课");
    });
    expect(lastIdFor(bridge.sent, "prompt")).toBe("B");
    await expect(switched).resolves.toBe("/home/sessions/B.jsonl");
  });

  it("stamps a retry with the id current at retry time, not at send time", () => {
    const bridge = setUp();
    act(() => {
      bridge.emit({
        type: "message-end",
        message: { id: "u1", role: "user", markdown: "你好", streaming: false, toolCalls: [] },
      });
    });
    act(() => {
      bridge.emit({ type: "state", state: stateWith("A") });
    });
    act(() => {
      bridge.emit({ type: "state", state: stateWith("B") });
    });
    act(() => {
      bridge.controller().retry();
    });
    expect(lastIdFor(bridge.sent, "prompt")).toBe("B");
  });

  it("sends no id before any snapshot arrives: the agent then uses whatever is active", () => {
    const bridge = setUp();
    act(() => {
      bridge.controller().send("你好");
    });
    expect(lastIdFor(bridge.sent, "prompt")).toBeUndefined();
  });

  it("drops back to no id when a snapshot reports no session", () => {
    const bridge = setUp();
    act(() => {
      bridge.emit({ type: "state", state: stateWith("A") });
    });
    act(() => {
      bridge.emit({ type: "state", state: stateWith(null) });
      bridge.controller().send("你好");
    });
    expect(lastIdFor(bridge.sent, "prompt")).toBeUndefined();
  });
});
