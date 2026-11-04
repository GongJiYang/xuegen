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
