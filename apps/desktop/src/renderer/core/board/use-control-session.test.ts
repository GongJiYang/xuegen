import { describe, expect, it } from "vitest";
import { isControlSession } from "./use-control-session.js";

describe("isControlSession", () => {
  const settings = { controlSessions: { C1: "/sessions/c1.jsonl" } };

  it("is true only for the cycle's own 总控 session file", () => {
    expect(isControlSession(settings, "C1", "/sessions/c1.jsonl")).toBe(true);
    expect(isControlSession(settings, "C1", "/sessions/course.jsonl")).toBe(false);
  });

  it("is false outside a cycle or before any session is open", () => {
    expect(isControlSession(settings, null, "/sessions/c1.jsonl")).toBe(false);
    expect(isControlSession(settings, "C1", null)).toBe(false);
    expect(isControlSession(settings, "C2", "/sessions/c1.jsonl")).toBe(false);
  });
});
