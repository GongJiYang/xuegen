/**
 * The session list's pick goes through the chat controller's switch guard
 * (batch-switch-guard, 11-12): while an answer streams, choosing a transcript
 * must not call `openSession` until the guard releases it.
 */

import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { DEFAULT_DESKTOP_SETTINGS } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import type { CycleResource } from "./use-cycle.js";
import type { CoursesResource } from "./use-courses.js";
import * as client from "../client.js";
import { useSessionList, type SessionListController } from "./use-session-list.js";

let captured: SessionListController | null = null;

function Harness({ controller }: { controller: ChatController }) {
  const list = useSessionList(
    controller,
    DEFAULT_DESKTOP_SETTINGS,
    vi.fn(),
    { month: { state: { status: "loading" } } } as unknown as CycleResource,
    { state: { status: "ready", value: [] } } as unknown as CoursesResource,
    vi.fn(),
  );
  useEffect(() => {
    captured = list;
  });
  return null;
}

function fakeController(guardSwitch: (run: () => void) => void) {
  return {
    sessionFile: "/sessions/current.jsonl",
    openedHistory: () => [],
    openSession: vi.fn().mockResolvedValue("/sessions/current.jsonl"),
    guardSwitch: vi.fn(guardSwitch),
  } as unknown as ChatController & {
    openSession: ReturnType<typeof vi.fn>;
    guardSwitch: ReturnType<typeof vi.fn>;
  };
}

afterEach(() => {
  captured = null;
  vi.restoreAllMocks();
});

describe("useSessionList — session-switch guard", () => {
  it("onPick goes through guardSwitch, not straight to openSession", () => {
    vi.spyOn(client, "data").mockResolvedValue({ ok: true, data: [] });
    const held: (() => void)[] = [];
    const controller = fakeController((run) => {
      held.push(run);
    });
    render(<Harness controller={controller} />);

    act(() => {
      captured?.view.onPick("/sessions/picked.jsonl");
    });

    expect(controller.guardSwitch).toHaveBeenCalledTimes(1);
    expect(controller.openSession).not.toHaveBeenCalled();

    act(() => held[0]?.());
    // An unknown row opens with the free role, never a guessed one.
    expect(controller.openSession).toHaveBeenCalledWith("/sessions/picked.jsonl", { kind: "free" });
  });
});
