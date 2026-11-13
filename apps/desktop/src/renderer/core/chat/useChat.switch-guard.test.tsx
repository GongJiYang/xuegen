/**
 * The session-switch guard (batch-switch-guard, 11-12).
 *
 * While 学根 is answering, a click on any session-switch entry (开课, 回到这节
 * 课, the session list, the 总控 entry, 新会话) must first ask: the held switch
 * runs only after 「切换」 stops the answer like the stop button and the agent
 * reports the turn settled — or after a 2s grace period without that report.
 */

import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { AgentToHostMessage } from "@shared/protocol.js";
import { useChat, type ChatController } from "./useChat.js";
import * as client from "../client.js";

let captured: ChatController | null = null;

function Harness() {
  const controller = useChat();
  useEffect(() => {
    captured = controller;
  });
  return null;
}

/** A session snapshot carrying the given streaming flag; other fields don't matter here. */
function sessionState(streaming: boolean, queuedFollowUps = 0): AgentToHostMessage {
  return {
    type: "state",
    state: {
      cwd: "/tmp",
      model: null,
      sessionFile: null,
      sessionId: null,
      streaming,
      queuedFollowUps,
      thinkingLevel: null,
      thinkingLevels: [],
      role: { kind: "free" },
    },
  };
}

function setUp() {
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
    controller: (): ChatController => {
      if (!captured) throw new Error("controller not captured");
      return captured;
    },
    emit: (event: AgentToHostMessage) => listener?.(event),
    sent,
  };
}

afterEach(() => {
  captured = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useChat guardSwitch", () => {
  it("runs the switch at once when no answer is streaming", () => {
    const bridge = setUp();
    const run = vi.fn();
    act(() => bridge.controller().guardSwitch(run));
    expect(run).toHaveBeenCalledTimes(1);
    expect(bridge.controller().pendingSwitch).toBe(false);
  });

  it("holds the switch and raises pendingSwitch while answering", () => {
    const bridge = setUp();
    act(() => bridge.emit(sessionState(true)));
    const run = vi.fn();
    act(() => bridge.controller().guardSwitch(run));
    expect(run).not.toHaveBeenCalled();
    expect(bridge.controller().pendingSwitch).toBe(true);
  });

  it("cancelSwitch drops the held switch without running it", () => {
    const bridge = setUp();
    act(() => bridge.emit(sessionState(true)));
    const run = vi.fn();
    act(() => {
      bridge.controller().guardSwitch(run);
      bridge.controller().cancelSwitch();
    });
    expect(bridge.controller().pendingSwitch).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(bridge.sent).not.toHaveBeenCalledWith({ type: "abort" });
  });

  it("confirmSwitch aborts, then runs only after the agent reports streaming stopped", () => {
    const bridge = setUp();
    act(() => bridge.emit(sessionState(true)));
    const run = vi.fn();
    act(() => bridge.controller().guardSwitch(run));
    act(() => bridge.controller().confirmSwitch());
    // The same path as the stop button: abort first, held switch still waiting.
    expect(bridge.sent).toHaveBeenCalledWith({ type: "abort" });
    expect(bridge.controller().pendingSwitch).toBe(false);
    expect(run).not.toHaveBeenCalled();
    act(() => bridge.emit(sessionState(false)));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("still runs the held switch 2s after confirmSwitch without a settled report", () => {
    vi.useFakeTimers();
    const bridge = setUp();
    act(() => bridge.emit(sessionState(true)));
    const run = vi.fn();
    act(() => bridge.controller().guardSwitch(run));
    act(() => bridge.controller().confirmSwitch());
    expect(run).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs the held switch at once when the answer already settled before the confirm", () => {
    const bridge = setUp();
    act(() => bridge.emit(sessionState(true)));
    const run = vi.fn();
    act(() => bridge.controller().guardSwitch(run));
    // The answer finished on its own while the confirm was on screen.
    act(() => bridge.emit(sessionState(false)));
    expect(run).not.toHaveBeenCalled();
    act(() => bridge.controller().confirmSwitch());
    expect(run).toHaveBeenCalledTimes(1);
    // Nothing was running: no abort should have gone out for this confirm.
    expect(bridge.sent).not.toHaveBeenCalledWith({ type: "abort" });
  });

  it("keeps the newest switch when a second one arrives while asking", () => {
    const bridge = setUp();
    act(() => bridge.emit(sessionState(true)));
    const first = vi.fn();
    const second = vi.fn();
    act(() => {
      bridge.controller().guardSwitch(first);
      bridge.controller().guardSwitch(second);
    });
    act(() => bridge.controller().confirmSwitch());
    act(() => bridge.emit(sessionState(false)));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("puts a queue withdrawn by a confirmed switch into the new session's composer", () => {
    const bridge = setUp();
    act(() => bridge.emit(sessionState(true)));
    act(() => bridge.controller().send("排队那句"));
    const run = vi.fn();
    act(() => bridge.controller().guardSwitch(run));
    act(() => bridge.controller().confirmSwitch());
    expect(bridge.controller().carriedDraft).toBeNull();
    act(() => bridge.emit(sessionState(false)));
    expect(run).toHaveBeenCalledTimes(1);
    expect(bridge.controller().carriedDraft).toBe("排队那句");
    act(() => bridge.controller().takeCarriedDraft());
    expect(bridge.controller().carriedDraft).toBeNull();
  });

  it("carries nothing when only the answer in progress was withdrawn", () => {
    const bridge = setUp();
    act(() => bridge.controller().send("正在回答的那句"));
    act(() => bridge.emit(sessionState(true)));
    const run = vi.fn();
    act(() => bridge.controller().guardSwitch(run));
    act(() => bridge.controller().confirmSwitch());
    act(() => bridge.emit(sessionState(false)));
    expect(run).toHaveBeenCalledTimes(1);
    // Its answer was saved in half: only the queue comes back, and it was empty.
    expect(bridge.controller().carriedDraft).toBeNull();
  });

  it("does not carry a queue that 「等它说完」 left alone", () => {
    const bridge = setUp();
    act(() => bridge.emit(sessionState(true)));
    act(() => bridge.controller().send("排队那句"));
    const run = vi.fn();
    act(() => {
      bridge.controller().guardSwitch(run);
      bridge.controller().cancelSwitch();
    });
    expect(bridge.controller().carriedDraft).toBeNull();
  });
});
