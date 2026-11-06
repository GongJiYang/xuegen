/**
 * Course-session actions: which session a course opens in, and claiming a
 * newly created course. The controller and board resource are test doubles; the
 * production types only describe the parts these actions use.
 */

import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { DEFAULT_DESKTOP_SETTINGS, type DesktopSettings } from "@shared/protocol.js";
import type { CourseSummary } from "@shared/data-protocol.js";
import type { ChatController } from "../chat/useChat.js";
import type { ResumePoint } from "../today.js";
import type { CoursesResource } from "./use-courses.js";
import { dateKey } from "./use-calendar.js";
import {
  resolveActiveCourse,
  useCourseSessions,
  type CourseSessionActions,
} from "./use-course-sessions.js";

describe("resolveActiveCourse", () => {
  it("prefers the course the user just chose", () => {
    expect(resolveActiveCourse("algebra", { geometry: "a.jsonl" }, "a.jsonl")).toBe("algebra");
  });

  it("maps an open session file back to its course", () => {
    expect(resolveActiveCourse(null, { geometry: "a.jsonl" }, "a.jsonl")).toBe("geometry");
  });

  it("is null for a free chat or an unknown file", () => {
    expect(resolveActiveCourse(null, { geometry: "a.jsonl" }, null)).toBeNull();
    expect(resolveActiveCourse(null, { geometry: "a.jsonl" }, "other.jsonl")).toBeNull();
  });
});

function readyCourses(value: CourseSummary[]): CoursesResource {
  return {
    state: { status: "ready", value },
    reload: vi.fn(),
    mutate: vi.fn(),
  } as unknown as CoursesResource;
}

function fakeController(sessionFile: string | null = "/home/sessions/new.jsonl") {
  return {
    messages: [],
    send: vi.fn(),
    sendCommand: vi.fn(),
    setRefreshNote: vi.fn(),
    openSession: vi.fn().mockResolvedValue(sessionFile),
    newSession: vi.fn(),
    continueSession: vi.fn(),
  } as unknown as ChatController & {
    send: ReturnType<typeof vi.fn>;
    sendCommand: ReturnType<typeof vi.fn>;
    openSession: ReturnType<typeof vi.fn>;
  };
}

let actions: CourseSessionActions | null = null;

function Harness({
  controller,
  courses,
  update,
  setActiveCourse,
  settings = DEFAULT_DESKTOP_SETTINGS,
  resume = null,
  activeCourse = null,
  requestFocus = () => undefined,
}: {
  controller: ChatController;
  courses: CoursesResource;
  update: (patch: Partial<DesktopSettings>) => void;
  setActiveCourse: (slug: string | null) => void;
  settings?: DesktopSettings;
  resume?: ResumePoint | null;
  activeCourse?: string | null;
  requestFocus?: () => void;
}) {
  const current = useCourseSessions(
    controller,
    settings,
    update,
    courses,
    resume,
    activeCourse,
    setActiveCourse,
    requestFocus,
  );
  useEffect(() => {
    actions = current;
  });
  return null;
}

afterEach(() => {
  actions = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useCourseSessions", () => {
  it("opens the course's remembered session, remembers a new file, and sends", async () => {
    const controller = fakeController("/home/sessions/opened.jsonl");
    const update = vi.fn();
    const setActiveCourse = vi.fn();
    render(
      <Harness
        controller={controller}
        courses={readyCourses([])}
        update={update}
        setActiveCourse={setActiveCourse}
      />,
    );

    await act(async () => {
      actions?.handleStartSession("algebra", "开始今天的学习");
      await Promise.resolve();
    });

    expect(setActiveCourse).toHaveBeenCalledWith("algebra");
    expect(controller.openSession).toHaveBeenCalledWith(null);
    expect(update).toHaveBeenCalledWith({
      courseSessions: { algebra: "/home/sessions/opened.jsonl" },
    });
    expect(controller.send).toHaveBeenCalledWith("开始今天的学习");
  });

  it("only sends when already in that course's session", async () => {
    const controller = fakeController();
    const update = vi.fn();
    const setActiveCourse = vi.fn();
    function ActiveHarness() {
      const current = useCourseSessions(
        controller,
        DEFAULT_DESKTOP_SETTINGS,
        update,
        readyCourses([]),
        null,
        "algebra",
        setActiveCourse,
        () => undefined,
      );
      useEffect(() => {
        actions = current;
      });
      return null;
    }
    render(<ActiveHarness />);

    act(() => {
      actions?.handleStartSession("algebra", "继续");
    });

    expect(controller.send).toHaveBeenCalledWith("继续");
    expect(controller.openSession).not.toHaveBeenCalled();
    expect(setActiveCourse).not.toHaveBeenCalled();
  });

  it("claims the newly created course when the refreshed list arrives", async () => {
    const controller = fakeController("/home/sessions/fresh.jsonl");
    const update = vi.fn();
    const setActiveCourse = vi.fn();
    const { rerender } = render(
      <Harness
        controller={controller}
        courses={readyCourses([])}
        update={update}
        setActiveCourse={setActiveCourse}
      />,
    );

    await act(async () => {
      actions?.handleNewCourse({
        title: "代数",
        material: "",
        reading: "guided",
        startDate: "2026-11-04",
        endDate: "2026-12-02",
        rest: "sun",
        style: "deep",
      });
      await Promise.resolve();
    });
    expect(controller.sendCommand).toHaveBeenCalledTimes(1);
    expect(controller.send).not.toHaveBeenCalled();

    const created = [{ slug: "algebra", title: "代数" }] as unknown as CourseSummary[];
    await act(async () => {
      rerender(
        <Harness
          controller={controller}
          courses={readyCourses(created)}
          update={update}
          setActiveCourse={setActiveCourse}
        />,
      );
      await Promise.resolve();
    });

    expect(setActiveCourse).toHaveBeenCalledWith("algebra");
    expect(update).toHaveBeenCalledWith({
      courseSessions: { algebra: "/home/sessions/fresh.jsonl" },
      courseStyles: { algebra: "deep" },
    });
  });
});

describe("useCourseSessions — opening card", () => {
  const studyCourse = {
    slug: "ctm",
    title: "CTM 7 周",
    weekLabel: "W3",
    week: {
      done: 1,
      total: 3,
      tasks: [
        { label: "读 1.1", done: true },
        { label: "读 1.2", done: false },
      ],
    },
    overall: { done: 0, total: 0 },
    lastRecord: { date: "2026-11-03", seq: "01" },
    nextSession: "2.1",
    styleHint: null,
  } as CourseSummary;

  it("sets the card the instant 开始学习 is clicked, before sending", async () => {
    const controller = fakeController();
    controller.openSession.mockReturnValue(new Promise(() => undefined));
    render(
      <Harness
        controller={controller}
        courses={readyCourses([studyCourse])}
        update={vi.fn()}
        setActiveCourse={vi.fn()}
      />,
    );

    act(() => {
      actions?.handleStudy(studyCourse);
    });

    expect(actions?.intro).toEqual({
      card: {
        title: "CTM 7 周",
        lastDate: "2026-11-03",
        lastDone: "读 1.1",
        next: "2.1",
        week: { done: 1, total: 3 },
      },
      beforeIndex: 0,
    });
    expect(controller.send).not.toHaveBeenCalled();
  });

  it("does not show a card for 改计划", async () => {
    const controller = fakeController();
    render(
      <Harness
        controller={controller}
        courses={readyCourses([studyCourse])}
        update={vi.fn()}
        setActiveCourse={vi.fn()}
      />,
    );

    await act(async () => {
      actions?.handleEditPlan(studyCourse, "少一点");
      await Promise.resolve();
    });

    expect(actions?.intro).toBeNull();
    expect(controller.send).not.toHaveBeenCalled();
    expect(controller.sendCommand).toHaveBeenCalledWith(expect.stringContaining("少一点"));
  });

  it("clears the card on 新会话", async () => {
    const controller = fakeController();
    render(
      <Harness
        controller={controller}
        courses={readyCourses([studyCourse])}
        update={vi.fn()}
        setActiveCourse={vi.fn()}
      />,
    );

    await act(async () => {
      actions?.handleStudy(studyCourse);
      await Promise.resolve();
    });
    expect(actions?.intro).not.toBeNull();

    act(() => {
      actions?.handleNewSession();
    });
    expect(actions?.intro).toBeNull();
  });
});

describe("useCourseSessions — returning to a course", () => {
  const today = "2026-11-04";
  const course = {
    slug: "ctm",
    title: "CTM 7 周",
    weekLabel: "W3",
    week: { done: 0, total: 0, tasks: [] },
    overall: { done: 0, total: 0 },
    lastRecord: null,
    nextSession: "2.1",
    styleHint: null,
  } as CourseSummary;

  function settingsWith(courseStartedOn: Record<string, string>): DesktopSettings {
    return {
      ...DEFAULT_DESKTOP_SETTINGS,
      courseStartedOn,
      courseSessions: { ctm: "/home/sessions/ctm.jsonl" },
    };
  }

  it("switches without sending when the course was opened today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 9));
    const controller = fakeController("/home/sessions/ctm.jsonl");
    const setActiveCourse = vi.fn();
    render(
      <Harness
        controller={controller}
        courses={readyCourses([course])}
        update={vi.fn()}
        setActiveCourse={setActiveCourse}
        settings={settingsWith({ ctm: today })}
      />,
    );

    await act(async () => {
      actions?.handleStudy(course);
      await Promise.resolve();
    });

    expect(setActiveCourse).toHaveBeenCalledWith("ctm");
    expect(controller.openSession).toHaveBeenCalledWith("/home/sessions/ctm.jsonl");
    expect(controller.send).not.toHaveBeenCalled();
    expect(actions?.intro).toBeNull();
  });

  it("only focuses the composer when already in that course", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 9));
    const controller = fakeController();
    const requestFocus = vi.fn();
    render(
      <Harness
        controller={controller}
        courses={readyCourses([course])}
        update={vi.fn()}
        setActiveCourse={vi.fn()}
        settings={settingsWith({ ctm: today })}
        activeCourse="ctm"
        requestFocus={requestFocus}
      />,
    );

    act(() => {
      actions?.handleStudy(course);
    });

    expect(requestFocus).toHaveBeenCalledTimes(1);
    expect(controller.send).not.toHaveBeenCalled();
    expect(controller.openSession).not.toHaveBeenCalled();
  });

  it("sends and records the day when opening the course", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 9));
    const controller = fakeController("/home/sessions/new.jsonl");
    const update = vi.fn();
    render(
      <Harness
        controller={controller}
        courses={readyCourses([course])}
        update={update}
        setActiveCourse={vi.fn()}
        settings={{ ...DEFAULT_DESKTOP_SETTINGS, courseSessions: { ctm: "/home/sessions/old.jsonl" } }}
      />,
    );

    await act(async () => {
      actions?.handleStudy(course);
      await Promise.resolve();
    });

    // The day's first lesson does not reuse yesterday's session.
    expect(controller.openSession).toHaveBeenCalledWith(null);
    expect(controller.send).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ courseStartedOn: { ctm: today } }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ courseSessions: { ctm: "/home/sessions/new.jsonl" } }),
    );
  });

  it("opens a fresh session for the day's first lesson even when that course is active", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 9));
    const controller = fakeController("/home/sessions/new.jsonl");
    render(
      <Harness
        controller={controller}
        courses={readyCourses([course])}
        update={vi.fn()}
        setActiveCourse={vi.fn()}
        activeCourse="ctm"
        settings={{ ...DEFAULT_DESKTOP_SETTINGS, courseSessions: { ctm: "/home/sessions/old.jsonl" }, courseStartedOn: { ctm: "2026-11-03" } }}
      />,
    );

    await act(async () => {
      actions?.handleStudy(course);
      await Promise.resolve();
    });

    expect(controller.openSession).toHaveBeenCalledWith(null);
    expect(controller.send).toHaveBeenCalledTimes(1);
  });

  it("degrades to sending when today's course has no recorded session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 9));
    const controller = fakeController();
    render(
      <Harness
        controller={controller}
        courses={readyCourses([course])}
        update={vi.fn()}
        setActiveCourse={vi.fn()}
        settings={{ ...DEFAULT_DESKTOP_SETTINGS, courseStartedOn: { ctm: today } }}
      />,
    );

    await act(async () => {
      actions?.handleStudy(course);
      await Promise.resolve();
    });

    expect(controller.send).toHaveBeenCalledTimes(1);
    expect(actions?.intro).not.toBeNull();
  });

  it("records the day when 继续学习 sends", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 9));
    const controller = fakeController("/home/sessions/new.jsonl");
    const update = vi.fn();
    render(
      <Harness
        controller={controller}
        courses={readyCourses([course])}
        update={update}
        setActiveCourse={vi.fn()}
        resume={{ course, nextSession: "2.1" }}
      />,
    );

    await act(async () => {
      actions?.handleResume();
      await Promise.resolve();
    });

    expect(controller.send).toHaveBeenCalledWith(expect.stringContaining("继续"));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ courseStartedOn: { ctm: today } }),
    );
  });
});

describe("useCourseSessions — stale remembered sessions", () => {
  const course = {
    slug: "ctm",
    title: "CTM 7 周",
    weekLabel: "W3",
    week: { done: 0, total: 0, tasks: [] },
    overall: { done: 0, total: 0 },
    lastRecord: null,
    nextSession: "2.1",
    styleHint: null,
  } as CourseSummary;

  /** The session-file stamp for a local day at local noon, in the file-name format. */
  function stampFor(localDay: string): string {
    const [year, month, day] = localDay.split("-").map(Number);
    const iso = new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1, 12, 0, 0).toISOString();
    return `/home/sessions/${iso.replace(/[:.]/g, "-")}_abc.jsonl`;
  }

  it("opens a fresh session for 改计划 when the remembered one is from an earlier day", async () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const controller = fakeController("/home/sessions/new.jsonl");
    render(
      <Harness
        controller={controller}
        courses={readyCourses([course])}
        update={vi.fn()}
        setActiveCourse={vi.fn()}
        settings={{ ...DEFAULT_DESKTOP_SETTINGS, courseSessions: { ctm: stampFor(dateKey(y)) } }}
      />,
    );

    await act(async () => {
      actions?.handleEditPlan(course, "少一点");
      await Promise.resolve();
    });

    expect(controller.openSession).toHaveBeenCalledWith(null);
  });

  it("reuses the remembered session for 改计划 when it is from today", async () => {
    const file = stampFor(dateKey(new Date()));
    const controller = fakeController("/home/sessions/new.jsonl");
    render(
      <Harness
        controller={controller}
        courses={readyCourses([course])}
        update={vi.fn()}
        setActiveCourse={vi.fn()}
        settings={{ ...DEFAULT_DESKTOP_SETTINGS, courseSessions: { ctm: file } }}
      />,
    );

    await act(async () => {
      actions?.handleEditPlan(course, "少一点");
      await Promise.resolve();
    });

    expect(controller.openSession).toHaveBeenCalledWith(file);
  });
});
