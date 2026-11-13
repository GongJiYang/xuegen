/**
 * Session freshness: the stale-session notice and the 「先重读」 prompt note.
 * The chat controller and the courses resource are test doubles; dates are
 * computed from the real clock so the tests never hard-code a day.
 */

import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { DEFAULT_DESKTOP_SETTINGS, type DesktopSettings } from "@shared/protocol.js";
import type { CourseSummary } from "@shared/data-protocol.js";
import type { ChatController } from "../chat/useChat.js";
import { strings } from "../strings.js";
import { splitActionMarker } from "../chat/action-marker.js";
import * as client from "../client.js";
import { dateKey } from "./use-calendar.js";
import type { CoursesResource } from "./use-courses.js";
import { useSessionFreshness, type SessionFreshness } from "./use-session-freshness.js";

// The answer-end record fetches the course list directly; the test controls what it returns.
const listed = vi.hoisted(() => ({ changedAt: 100 }));
vi.mock("../client.js", () => ({
  data: vi.fn(() => Promise.resolve({ ok: true, data: [{ slug: "ctm", changedAt: listed.changedAt }] })),
}));

/** The session-file stamp for a local day at local noon, in the file-name format. */
function stampFor(localDay: string): string {
  const [year, month, day] = localDay.split("-").map(Number);
  const iso = new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1, 12, 0, 0).toISOString();
  return `/sessions/${iso.replace(/[:.]/g, "-")}_abc.jsonl`;
}

const TODAY = dateKey(new Date());
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const YESTERDAY = dateKey(yesterday);
const CYCLE = "C1";

function readyCourses(value: CourseSummary[]): CoursesResource {
  return {
    state: { status: "ready", value },
    reload: vi.fn(),
    mutate: vi.fn(),
  } as unknown as CoursesResource;
}

function fakeController(streaming = false, messageCount = 1) {
  return {
    streaming,
    messages: Array.from({ length: messageCount }, (_, index) => ({ id: `m${index}` })),
    openedHistory: () => [],
    setRefreshNote: vi.fn(),
    sendCommand: vi.fn(),
    contextUsage: null,
  } as unknown as ChatController & { setRefreshNote: ReturnType<typeof vi.fn>; sendCommand: ReturnType<typeof vi.fn> };
}

const course = {
  slug: "ctm",
  title: "CTM 7 周",
  changedAt: 100,
} as unknown as CourseSummary;

let captured: SessionFreshness | null = null;

function Harness({
  controller,
  courses,
  activeCourse,
  openSessionFile,
  settings = DEFAULT_DESKTOP_SETTINGS,
  onStudy = () => undefined,
  onContinueFresh = () => undefined,
  isControl = false,
}: {
  controller: ChatController;
  courses: CoursesResource;
  activeCourse: string | null;
  openSessionFile: string | null;
  settings?: DesktopSettings;
  onStudy?: (course: CourseSummary) => void;
  onContinueFresh?: (slug: string, text: string) => void;
  isControl?: boolean;
}) {
  const freshness = useSessionFreshness(
    controller,
    courses,
    activeCourse,
    openSessionFile,
    settings,
    onStudy,
    onContinueFresh,
    isControl,
  );
  useEffect(() => {
    captured = freshness;
  });
  return null;
}

afterEach(() => {
  captured = null;
  vi.restoreAllMocks();
});

describe("useSessionFreshness — stale session notice", () => {
  it("shows the notice for yesterday's remembered session and runs its action", () => {
    const file = stampFor(YESTERDAY);
    const onStudy = vi.fn();
    render(
      <Harness
        controller={fakeController()}
        courses={readyCourses([course])}
        activeCourse="ctm"
        openSessionFile={file}
        settings={{ ...DEFAULT_DESKTOP_SETTINGS, courseSessions: { ctm: file } }}
        onStudy={onStudy}
      />,
    );

    const notice = captured?.notice;
    expect(notice).not.toBeNull();
    expect(notice?.text).toBe(strings.notice.staleSession(YESTERDAY.slice(5), "CTM 7 周"));
    act(() => notice?.action?.run());
    expect(onStudy).toHaveBeenCalledWith(course);

    act(() => {
      captured?.dismiss();
    });
    expect(captured?.notice).toBeNull();
  });

  it("shows no notice for today's session", () => {
    const file = stampFor(TODAY);
    render(
      <Harness
        controller={fakeController()}
        courses={readyCourses([course])}
        activeCourse="ctm"
        openSessionFile={file}
        settings={{ ...DEFAULT_DESKTOP_SETTINGS, courseSessions: { ctm: file } }}
      />,
    );
    expect(captured?.notice).toBeNull();
  });
});

describe("useSessionFreshness — 存档提示", () => {
  it("contextUsage 到 60% 以上时提示「先存档」，点了发存档指令", () => {
    const file = stampFor(TODAY);
    const controller = fakeController();
    controller.contextUsage = { tokens: 65_000, contextWindow: 100_000, percent: 65 };
    render(
      <Harness
        controller={controller}
        courses={readyCourses([course])}
        activeCourse="ctm"
        openSessionFile={file}
        settings={{ ...DEFAULT_DESKTOP_SETTINGS, courseSessions: { ctm: file } }}
      />,
    );

    const notice = captured?.notice;
    expect(notice?.action?.label).toBe(strings.notice.checkpointAction);
    expect(notice?.text).toBe(strings.notice.checkpoint(65));
    act(() => notice?.action?.run());
    const sent = splitActionMarker(controller.sendCommand.mock.calls[0]?.[0] ?? "");
    expect(sent.action).toBe("checkpoint");
    expect(sent.body).toBe(strings.chat.checkpointPrompt);
  });
});

describe("useSessionFreshness — refresh note", () => {
  it("sets the note until an answer records the page, then again on a newer page", async () => {
    const file = stampFor(TODAY);
    const controller = fakeController();
    const settings: DesktopSettings = { ...DEFAULT_DESKTOP_SETTINGS, courseSessions: { ctm: file } };
    const first = readyCourses([course]);
    const { rerender } = render(
      <Harness
        controller={controller}
        courses={first}
        activeCourse="ctm"
        openSessionFile={file}
        settings={settings}
      />,
    );
    expect(controller.setRefreshNote).toHaveBeenLastCalledWith(strings.chat.refreshNote);

    // One turn runs and finishes; the board reloads afterwards.
    controller.streaming = true;
    rerender(
      <Harness
        controller={controller}
        courses={first}
        activeCourse="ctm"
        openSessionFile={file}
        settings={settings}
      />,
    );
    controller.streaming = false;
    rerender(
      <Harness
        controller={controller}
        courses={first}
        activeCourse="ctm"
        openSessionFile={file}
        settings={settings}
      />,
    );
    // The answer-end fetch lands with the same changedAt: the page did not change.
    await act(async () => {
      await Promise.resolve();
    });
    expect(controller.setRefreshNote).toHaveBeenLastCalledWith(null);

    // The page then changes: the next prompt must carry the note again.
    rerender(
      <Harness
        controller={controller}
        courses={readyCourses([{ ...course, changedAt: 200 } as CourseSummary])}
        activeCourse="ctm"
        openSessionFile={file}
        settings={settings}
      />,
    );
    expect(controller.setRefreshNote).toHaveBeenLastCalledWith(strings.chat.refreshNote);
  });

  it("总控会话：第一条消息带 controlRefreshNote，答完之后不再带", async () => {
    const file = stampFor(TODAY);
    const controller = fakeController();
    const settings: DesktopSettings = { ...DEFAULT_DESKTOP_SETTINGS, controlSessions: { [CYCLE]: file } };
    const courses = readyCourses([course]);
    const { rerender } = render(
      <Harness
        controller={controller}
        courses={courses}
        activeCourse={null}
        openSessionFile={file}
        settings={settings}
        isControl
      />,
    );
    expect(controller.setRefreshNote).toHaveBeenLastCalledWith(strings.chat.controlRefreshNote);

    // One turn runs and ends: the 总控 session is recorded as seen without fetching the course list.
    for (const streaming of [true, false]) {
      controller.streaming = streaming;
      rerender(
        <Harness
          controller={controller}
          courses={courses}
          activeCourse={null}
          openSessionFile={file}
          settings={settings}
          isControl
        />,
      );
    }
    await act(async () => {
      await Promise.resolve();
    });
    expect(controller.setRefreshNote).toHaveBeenLastCalledWith(null);
    // The 总控 session records its own mark; no course list is needed.
    expect(client.data).not.toHaveBeenCalled();
  });
});
