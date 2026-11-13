/**
 * `openedHistory()` must answer synchronously right after `openSession` resolves.
 *
 * The agent posts `history` inside `restart()` and only then `session-opened`
 * (batch-no-resend-2). The reducer updates `messages` on the *next* render, so a
 * caller reading `controller.messages` in the `openSession().then` callback sees
 * the transcript of the session it just left. `openedHistory()` reads the ref the
 * event listener writes, so the switched session's transcript is visible at once.
 */

import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { AgentToHostMessage, ChatMessage } from "@shared/protocol.js";
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

function userMessage(id: string, markdown: string): ChatMessage {
  return { id, role: "user", markdown, streaming: false, toolCalls: [] };
}

function setUp() {
  vi.spyOn(client, "send").mockImplementation(() => undefined);
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
  };
}

/** The request id `useChat` put on the last `open-session` it sent. */
function lastOpenRequestId(): string {
  const sent = vi.mocked(client.send).mock.calls.map(([message]) => message);
  for (const message of [...sent].reverse()) {
    if (message.type === "open-session") return message.requestId;
  }
  throw new Error("no open-session request was sent");
}

afterEach(() => {
  captured = null;
  vi.restoreAllMocks();
});

describe("useChat openedHistory", () => {
  it("is empty before any history event arrives", () => {
    const bridge = setUp();
    expect(bridge.controller().openedHistory()).toEqual([]);
  });

  it("reads back a history event in the same tick, before React re-renders", () => {
    const bridge = setUp();
    const landed = [userMessage("u1", "核实第三周"), userMessage("u2", "开始今天的 CTM 7 周")];
    // The controller object rendered *before* the events; its `messages` still
    // holds the cleared transcript, but `openedHistory()` must not.
    const before = bridge.controller();

    act(() => {
      bridge.emit({ type: "history", messages: landed });
    });

    expect(before.openedHistory()).toEqual(landed);
  });

  it("answers inside a session-opened promise resolved in the same tick", async () => {
    const bridge = setUp();
    const landed = [userMessage("u1", "核实第三周")];
    const controller = bridge.controller();
    let seen: ChatMessage[] | null = null;

    act(() => {
      void controller.openSession("/home/sessions/ctm.jsonl", { kind: "course", slug: "ctm" }).then(() => {
        seen = controller.openedHistory();
      });
    });

    // The real event order: `history` first, then `session-opened`.
    await act(async () => {
      bridge.emit({ type: "history", messages: landed });
      bridge.emit({
        type: "session-opened",
        requestId: lastOpenRequestId(),
        sessionFile: "/home/sessions/ctm.jsonl",
      });
      await Promise.resolve();
    });

    expect(seen).toEqual(landed);
  });
});
