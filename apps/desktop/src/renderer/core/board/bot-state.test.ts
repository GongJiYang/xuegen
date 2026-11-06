import { describe, expect, it } from "vitest";
import type { CycleDay } from "@shared/data-protocol.js";
import type { ChatMessage } from "@shared/protocol.js";
import { botMood, controlView, toolRunning } from "./bot-state.js";

function day(overrides: Partial<CycleDay>): CycleDay {
  return {
    date: "2026-11-09",
    weekday: "周一",
    cycle: "C1",
    week: 1,
    type: "深度",
    subject: "discrete-math",
    course: "epp",
    aux: null,
    auxCourse: null,
    names: {},
    subjects: {},
    roles: {},
    lessons: [],
    overdue: [],
    ...overrides,
  };
}

function message(status: "running" | "success" | null): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    markdown: "",
    streaming: status === "running",
    toolCalls: status ? [{ toolCallId: "t1", toolName: "bash", argsSummary: "", status }] : [],
  };
}

describe("botMood", () => {
  it("thinks while answering and works while a tool runs", () => {
    expect(botMood(true, false, null)).toBe("thinking");
    expect(botMood(true, true, null)).toBe("working");
  });
  it("notifies about missed lessons, sleeps on a rest day, idles otherwise", () => {
    expect(botMood(false, false, day({ overdue: [{ course: "epp", id: "D1", content: "Ch1", date: "2026-11-06" }] }))).toBe("notifying");
    expect(botMood(false, false, day({ type: "休息", subject: null, course: null }))).toBe("sleeping");
    expect(botMood(false, false, day({}))).toBe("idle");
    expect(botMood(false, false, null)).toBe("idle");
  });
});

describe("toolRunning and controlView", () => {
  it("looks at the newest message's tool calls", () => {
    expect(toolRunning([message("running")])).toBe(true);
    expect(toolRunning([message("running"), message("success")])).toBe(false);
    expect(toolRunning([])).toBe(false);
  });
  it("is null outside the 总控 session", () => {
    expect(controlView(false, true, [], { status: "loading" })).toBeNull();
    expect(controlView(true, false, [], { status: "ready", value: day({ type: "休息", subject: null, course: null }) })).toEqual({ mood: "sleeping" });
    expect(controlView(true, false, [], { status: "loading" })).toEqual({ mood: "idle" });
  });
});
