import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { DEFAULT_DESKTOP_SETTINGS, type DesktopSettings } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import { splitActionMarker } from "../chat/action-marker.js";
import { strings } from "../strings.js";
import { isControlSession, useControlSession, type ControlSession } from "./use-control-session.js";

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

function fakeController(overrides: Partial<ChatController> = {}) {
  return {
    sessionFile: null,
    streaming: false,
    messages: [],
    sendCommand: vi.fn(),
    openSession: vi.fn((file: string | null) => Promise.resolve(file ?? "/sessions/new.jsonl")),
    // The guard passes the switch straight through unless a test replaces it.
    guardSwitch: vi.fn((run: () => void) => run()),
    ...overrides,
  } as unknown as ChatController & {
    sendCommand: ReturnType<typeof vi.fn>;
    openSession: ReturnType<typeof vi.fn>;
    guardSwitch: ReturnType<typeof vi.fn>;
  };
}

let captured: ControlSession | null = null;

function Harness({
  controller,
  settings = DEFAULT_DESKTOP_SETTINGS,
  cycleId,
  ready,
}: {
  controller: ChatController;
  settings?: DesktopSettings;
  cycleId: string | null;
  ready: boolean;
}) {
  const control = useControlSession(controller, settings, vi.fn(), cycleId, vi.fn(), vi.fn(), ready);
  useEffect(() => {
    captured = control;
  });
  return null;
}

afterEach(() => {
  captured = null;
  vi.restoreAllMocks();
});

describe("useControlSession", () => {
  it("jumps to the 总控 session once ready, exactly once, sending nothing", async () => {
    const controller = fakeController();
    const { rerender } = render(<Harness controller={controller} cycleId="C1" ready={false} />);
    await act(async () => {});
    expect(controller.openSession).not.toHaveBeenCalled();

    rerender(<Harness controller={controller} cycleId="C1" ready />);
    await act(async () => {});
    expect(controller.openSession).toHaveBeenCalledTimes(1);
    expect(controller.openSession).toHaveBeenCalledWith(null, { kind: "control" });
    // The auto-open never sends a message.
    expect(controller.sendCommand).not.toHaveBeenCalled();

    rerender(<Harness controller={controller} cycleId="C1" ready />);
    await act(async () => {});
    expect(controller.openSession).toHaveBeenCalledTimes(1);
  });

  it("jumps over a restored session, course session or not", async () => {
    const restored = fakeController({ messages: [{ id: "m1" } as ChatController["messages"][number]] });
    render(<Harness controller={restored} cycleId="C1" ready />);
    await act(async () => {});
    expect(restored.openSession).toHaveBeenCalledTimes(1);

    const onCourse = fakeController();
    render(<Harness controller={onCourse} cycleId="C1" ready />);
    await act(async () => {});
    expect(onCourse.openSession).toHaveBeenCalledTimes(1);
  });

  it("askBrief sends the brief prompt folded as 今日简报", () => {
    const settings: DesktopSettings = {
      ...DEFAULT_DESKTOP_SETTINGS,
      controlSessions: { C1: "/sessions/c1.jsonl" },
    };
    const controller = fakeController({ sessionFile: "/sessions/c1.jsonl" });
    render(<Harness controller={controller} settings={settings} cycleId="C1" ready />);
    act(() => captured?.askBrief());
    const sent = splitActionMarker(controller.sendCommand.mock.calls[0]?.[0] ?? "");
    expect(sent.action).toBe("brief");
    expect(sent.body).toBe(strings.control.briefPrompt);
  });
});

describe("useControlSession — session-switch guard", () => {
  it("openControl goes through guardSwitch, not straight to openSession", () => {
    const held: (() => void)[] = [];
    const controller = fakeController({
      guardSwitch: vi.fn((run: () => void) => {
        held.push(run);
      }),
    });
    render(<Harness controller={controller} cycleId="C1" ready={false} />);

    act(() => captured?.openControl());

    expect(controller.openSession).not.toHaveBeenCalled();
    expect(held).toHaveLength(1);

    act(() => held[0]?.());
    expect(controller.openSession).toHaveBeenCalledWith(null, { kind: "control" });
  });

  it("askBrief on another session goes through guardSwitch too", () => {
    const held: (() => void)[] = [];
    const controller = fakeController({
      guardSwitch: vi.fn((run: () => void) => {
        held.push(run);
      }),
    });
    render(<Harness controller={controller} cycleId="C1" ready={false} />);

    act(() => captured?.askBrief());

    expect(controller.openSession).not.toHaveBeenCalled();
    expect(controller.sendCommand).not.toHaveBeenCalled();
    expect(held).toHaveLength(1);
  });
});
