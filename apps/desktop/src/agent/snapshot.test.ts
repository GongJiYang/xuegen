/**
 * The session snapshot is the one place `sessionId` enters the renderer, so its
 * shape is tested against a structural session instead of a live Pi session.
 */

import { describe, expect, it } from "vitest";
import { sessionState, type SnapshotSession } from "./snapshot.js";

function session(overrides: Partial<SnapshotSession> = {}): SnapshotSession {
  return {
    sessionId: "S1",
    sessionFile: "/home/sessions/course.jsonl",
    model: { provider: "anthropic", id: "claude", name: "Claude" },
    isStreaming: false,
    supportsThinking: () => true,
    thinkingLevel: "medium",
    getAvailableThinkingLevels: () => ["low", "medium", "high"],
    ...overrides,
  };
}

const base = { cwd: "/work", role: { kind: "free" } as const, queuedFollowUps: 0 };

describe("sessionState", () => {
  it("carries the session id, so the renderer can stamp its next request", () => {
    expect(sessionState({ ...base, session: session() }).sessionId).toBe("S1");
  });

  it("reports a null session id before the first session exists", () => {
    const state = sessionState({ ...base, session: null });
    expect(state.sessionId).toBeNull();
    expect(state.sessionFile).toBeNull();
    expect(state.model).toBeNull();
    expect(state.streaming).toBe(false);
  });

  it("reports the session file, model, and streaming flag", () => {
    const state = sessionState({ ...base, session: session({ isStreaming: true }) });
    expect(state.sessionFile).toBe("/home/sessions/course.jsonl");
    expect(state.model).toEqual({ provider: "anthropic", id: "claude", name: "Claude" });
    expect(state.streaming).toBe(true);
  });

  it("hides the thinking level when the model does not support thinking", () => {
    const state = sessionState({
      ...base,
      session: session({ supportsThinking: () => false }),
    });
    expect(state.thinkingLevel).toBeNull();
    expect(state.thinkingLevels).toEqual([]);
  });

  it("passes through the role and the queued follow-up count", () => {
    const state = sessionState({
      cwd: "/work",
      role: { kind: "course", slug: "ctm" },
      queuedFollowUps: 2,
      session: session(),
    });
    expect(state.role).toEqual({ kind: "course", slug: "ctm" });
    expect(state.queuedFollowUps).toBe(2);
    expect(state.cwd).toBe("/work");
  });

  it("drops a model value Pi cannot describe", () => {
    expect(sessionState({ ...base, session: session({ model: undefined }) }).model).toBeNull();
  });
});
