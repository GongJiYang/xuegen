/**
 * Skin switching must not reset the conversation.
 *
 * The chat controller lives above the skins, so changing the active skin only
 * swaps the presentation. This test drives the controller with a synthetic agent
 * event, changes the "skin" prop, and asserts the message survives.
 */

import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { AgentToHostMessage, HostToAgentMessage } from "@shared/protocol.js";
import { useChat } from "./useChat.js";
import { withActionMarker } from "./action-marker.js";
import * as client from "../client.js";

/** Capture the subscriber so the test can push agent events. */
function stubBridge(): { emit: (event: AgentToHostMessage) => void } {
  let listener: ((event: AgentToHostMessage) => void) | null = null;
  vi.spyOn(client, "send").mockImplementation(() => undefined);
  vi.spyOn(client, "subscribe").mockImplementation((next) => {
    listener = next;
    return () => {
      listener = null;
    };
  });
  return {
    emit: (event) => listener?.(event),
  };
}

function Harness({ skin }: { skin: string }) {
  const controller = useChat();
  return (
    <div data-skin-id={skin}>
      <span data-testid="count">{controller.messages.length}</span>
      <span data-testid="first">{controller.messages[0]?.markdown ?? ""}</span>
    </div>
  );
}

describe("useChat state across skin switches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the transcript when the skin changes", () => {
    const bridge = stubBridge();
    const { rerender } = render(<Harness skin="bare" />);

    act(() => {
      bridge.emit({
        type: "message-start",
        message: { id: "u1", role: "user", markdown: "hello", streaming: false, toolCalls: [] },
      });
    });
    expect(screen.getByTestId("count").textContent).toBe("1");

    rerender(<Harness skin="chicago" />);
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("first").textContent).toBe("hello");
  });
});

/** A harness that exposes the controller so a test can call send/sendCommand. */
let captured: ReturnType<typeof useChat> | null = null;
function ActionsHarness() {
  const controller = useChat("detailed");
  useEffect(() => {
    captured = controller;
  });
  return null;
}

describe("useChat prompt prefixing (B9)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefixes an ordinary send with the session style", () => {
    const send = vi.spyOn(client, "send").mockImplementation(() => undefined);
    render(<ActionsHarness />);
    act(() => {
      captured?.send("继续");
    });
    expect(send).toHaveBeenCalledWith({ type: "prompt", text: expect.stringContaining("[风格：细讲] 继续") });
  });

  it("sends a command prompt with no style prefix", () => {
    const send = vi.spyOn(client, "send").mockImplementation(() => undefined);
    render(<ActionsHarness />);
    act(() => {
      captured?.sendCommand("把这次学到的内容起草成卡片");
    });
    expect(send).toHaveBeenCalledWith({ type: "prompt", text: "把这次学到的内容起草成卡片" });
  });

  it("prepends the refresh note until it is cleared", () => {
    const send = vi.spyOn(client, "send").mockImplementation(() => undefined);
    render(<ActionsHarness />);
    act(() => {
      captured?.setRefreshNote("[N]");
      captured?.send("hi");
    });
    expect(send).toHaveBeenCalledWith({ type: "prompt", text: expect.stringContaining("[N] hi") });

    act(() => {
      captured?.setRefreshNote(null);
      captured?.send("hi");
    });
    expect(send).toHaveBeenLastCalledWith({ type: "prompt", text: expect.not.stringContaining("[N]") });
  });
});

describe("useChat openSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Subscribe a listener and capture the `open-session` requestId. */
  function setUp(): {
    emit(event: AgentToHostMessage): void;
    requestId(): string;
    openMessages(): Array<Extract<HostToAgentMessage, { type: "open-session" }>>;
  } {
    const send = vi.spyOn(client, "send").mockImplementation(() => undefined);
    let listener: ((event: AgentToHostMessage) => void) | null = null;
    vi.spyOn(client, "subscribe").mockImplementation((next) => {
      listener = next;
      return () => {
        listener = null;
      };
    });
    return {
      emit: (event) => listener?.(event),
      requestId: () => {
        const call = send.mock.calls.find(([message]) => message.type === "open-session");
        if (!call || call[0].type !== "open-session") throw new Error("no open-session sent");
        return call[0].requestId;
      },
      openMessages: () =>
        send.mock.calls
          .flatMap(([message]) => (message.type === "open-session" ? [message] : [])),
    };
  }

  it("resolves only for the matching requestId", async () => {
    const bridge = setUp();
    render(<ActionsHarness />);
    const controller = captured;
    if (!controller) throw new Error("controller not captured");

    let promise: Promise<string | null> = Promise.resolve(null);
    act(() => {
      promise = controller.openSession("/home/sessions/course.jsonl", { kind: "course", slug: "ctm" });
    });

    let resolved: string | null | undefined;
    void promise.then((value) => {
      resolved = value;
    });

    act(() => {
      bridge.emit({ type: "session-opened", requestId: "other-request", sessionFile: "/elsewhere.jsonl" });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolved).toBeUndefined();

    act(() => {
      bridge.emit({
        type: "session-opened",
        requestId: bridge.requestId(),
        sessionFile: "/home/sessions/course.jsonl",
      });
    });
    await expect(promise).resolves.toBe("/home/sessions/course.jsonl");
  });

  it("sends the role with the open-session request, so the agent can pick the permission set", () => {
    const bridge = setUp();
    render(<ActionsHarness />);
    const controller = captured;
    if (!controller) throw new Error("controller not captured");

    act(() => {
      void controller.openSession(null, { kind: "course", slug: "discrete-math-epp" });
    });
    expect(bridge.openMessages()).toHaveLength(1);
    expect(bridge.openMessages()[0]?.role).toEqual({ kind: "course", slug: "discrete-math-epp" });
    expect(bridge.openMessages()[0]?.sessionFile).toBeNull();
  });
});

describe("useChat stop hands back the prompt just sent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A controller harness plus a way to push agent events at it. */
  function setUp(): {
    controller(): ReturnType<typeof useChat>;
    emit(event: AgentToHostMessage): void;
    sent: ReturnType<typeof vi.spyOn>;
  } {
    const sent = vi.spyOn(client, "send").mockImplementation(() => undefined);
    let listener: ((event: AgentToHostMessage) => void) | null = null;
    vi.spyOn(client, "subscribe").mockImplementation((next) => {
      listener = next;
      return () => {
        listener = null;
      };
    });
    render(<ActionsHarness />);
    const capturedController = captured;
    if (!capturedController) throw new Error("controller not captured");
    return { controller: () => capturedController, emit: (event) => listener?.(event), sent };
  }

  /** A session snapshot with the given streaming flag; other fields don't matter here. */
  function sessionState(streaming: boolean): AgentToHostMessage {
    return {
      type: "state",
      state: {
        cwd: "/tmp",
        model: null,
        sessionFile: null,
        sessionId: null,
        streaming,
        queuedFollowUps: 0,
        thinkingLevel: null,
        thinkingLevels: [],
        role: { kind: "free" },
      },
    };
  }

  it("returns the text just sent, and only once", () => {
    const bridge = setUp();
    act(() => {
      bridge.controller().send("你好");
    });
    let back: string | null = "not asked";
    act(() => {
      back = bridge.controller().stop();
    });
    expect(back).toBe("你好");
    expect(bridge.sent).toHaveBeenCalledWith({ type: "abort" });

    let again: string | null = "not asked";
    act(() => {
      again = bridge.controller().stop();
    });
    expect(again).toBeNull();
  });

  it("returns the user's own words, without the style prefix or refresh note", () => {
    const bridge = setUp();
    act(() => {
      bridge.controller().setRefreshNote("[N]");
      bridge.controller().send("继续");
    });
    // The wire text carries both; what comes back must not.
    expect(bridge.sent).toHaveBeenCalledWith({ type: "prompt", text: expect.stringContaining("[风格：细讲] [N] 继续") });
    let back: string | null = null;
    act(() => {
      back = bridge.controller().stop();
    });
    expect(back).toBe("继续");
  });

  it("does not hand back a slash command", () => {
    const bridge = setUp();
    act(() => {
      bridge.controller().sendCommand("把这次学到的内容起草成卡片");
    });
    let back: string | null = "not asked";
    act(() => {
      back = bridge.controller().stop();
    });
    expect(back).toBeNull();
  });

  it("does not hand back a marked action the UI sent (开课)", () => {
    const bridge = setUp();
    act(() => {
      bridge.controller().send(withActionMarker("开始今天的 C 语言", "open", { slug: "c-language", title: "C 语言" }));
    });
    let back: string | null = "not asked";
    act(() => {
      back = bridge.controller().stop();
    });
    expect(back).toBeNull();
  });

  it("forgets the prompt once its turn settles on its own", () => {
    const bridge = setUp();
    act(() => {
      bridge.controller().send("你好");
    });
    act(() => {
      bridge.emit(sessionState(true));
      bridge.emit(sessionState(false));
    });
    let back: string | null = "not asked";
    act(() => {
      back = bridge.controller().stop();
    });
    expect(back).toBeNull();
  });
});
