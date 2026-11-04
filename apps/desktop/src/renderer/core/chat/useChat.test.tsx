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
import type { AgentToHostMessage } from "@shared/protocol.js";
import { useChat } from "./useChat.js";
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
});

describe("useChat openSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Subscribe a listener and capture the `open-session` requestId. */
  function setUp(): {
    emit(event: AgentToHostMessage): void;
    requestId(): string;
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
    };
  }

  it("resolves only for the matching requestId", async () => {
    const bridge = setUp();
    render(<ActionsHarness />);
    const controller = captured;
    if (!controller) throw new Error("controller not captured");

    let promise: Promise<string | null> = Promise.resolve(null);
    act(() => {
      promise = controller.openSession("/home/sessions/course.jsonl");
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
});
