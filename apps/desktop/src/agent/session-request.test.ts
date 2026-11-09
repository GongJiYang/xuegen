/**
 * The two rules that tie protocol messages to a session: outgoing events are
 * stamped, and a request that names another session is stale.
 */

import { describe, expect, it } from "vitest";
import type { HostToAgentMessage, SessionStatePayload } from "../shared/protocol.js";
import { STALE_REQUEST_ERROR, isSessionScoped, isStaleRequest, withSessionId } from "./session-request.js";

describe("withSessionId", () => {
  it("stamps the event and keeps the payload intact", () => {
    const event = { type: "error", error: "出错了" } as const;
    expect(withSessionId(event, "S1")).toEqual({ type: "error", error: "出错了", sessionId: "S1" });
    expect(withSessionId(event, null)).toEqual({ type: "error", error: "出错了", sessionId: null });
  });

  it("does not mutate the event it stamps", () => {
    const event = { type: "models-changed" } as const;
    withSessionId(event, "S1");
    expect(event).not.toHaveProperty("sessionId");
  });

  it("stamps every kind of event, including the one carrying a state snapshot", () => {
    const state: SessionStatePayload = {
      cwd: "/x",
      model: null,
      sessionFile: null,
      sessionId: "S1",
      role: { kind: "free" },
      streaming: false,
      queuedFollowUps: 0,
      thinkingLevel: null,
      thinkingLevels: [],
    };
    expect(withSessionId({ type: "state", state }, "S1")).toHaveProperty("sessionId", "S1");
    expect(withSessionId({ type: "history", messages: [] }, "S1")).toHaveProperty("sessionId", "S1");
    expect(withSessionId({ type: "agent-status", status: "ready" }, null)).toHaveProperty("sessionId", null);
  });
});

describe("isSessionScoped", () => {
  it("covers exactly prompt, compact, and abort", () => {
    const scoped: HostToAgentMessage[] = [
      { type: "prompt", text: "hi" },
      { type: "compact" },
      { type: "abort" },
    ];
    for (const message of scoped) expect(isSessionScoped(message)).toBe(true);

    const others: HostToAgentMessage[] = [
      { type: "init" },
      { type: "new-session" },
      { type: "continue-session" },
      { type: "set-model", provider: "anthropic", id: "claude" },
      { type: "set-thinking-level", level: "high" },
      { type: "list-models" },
      { type: "list-commands", disabledSkills: [] },
      { type: "open-session", requestId: "r1", sessionFile: null },
    ];
    for (const message of others) expect(isSessionScoped(message)).toBe(false);
  });
});

describe("isStaleRequest", () => {
  const requests: HostToAgentMessage[] = [
    { type: "prompt", text: "hi", sessionId: "S2" },
    { type: "compact", sessionId: "S2" },
    { type: "abort", sessionId: "S2" },
  ];

  it("drops a request naming another session", () => {
    for (const request of requests) expect(isStaleRequest(request, "S1")).toBe(true);
  });

  it("keeps a request naming the active session", () => {
    for (const request of requests) {
      if (request.type !== "prompt" && request.type !== "compact" && request.type !== "abort") continue;
      expect(isStaleRequest({ ...request, sessionId: "S1" }, "S1")).toBe(false);
    }
  });

  it("keeps a request with no session id: it targets whatever is active", () => {
    expect(isStaleRequest({ type: "prompt", text: "hi" }, "S1")).toBe(false);
    expect(isStaleRequest({ type: "compact" }, null)).toBe(false);
    expect(isStaleRequest({ type: "abort" }, null)).toBe(false);
  });

  it("treats a request carrying an id as stale when no session is active", () => {
    expect(isStaleRequest({ type: "prompt", text: "hi", sessionId: "S1" }, null)).toBe(true);
  });

  it("never drops a request that does not act on the session", () => {
    // A stray `sessionId` on another message must not make it look stale.
    const withStrayId = { type: "init", sessionId: "S1" } as unknown as HostToAgentMessage;
    expect(isStaleRequest(withStrayId, "S1")).toBe(false);
    expect(isStaleRequest(withStrayId, "S2")).toBe(false);
  });

  it("explains itself in Chinese, so the user knows to retry in the current session", () => {
    expect(STALE_REQUEST_ERROR).toContain("已忽略");
    expect(STALE_REQUEST_ERROR).toContain("当前会话");
  });
});
