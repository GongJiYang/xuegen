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
import type { CoursesResource } from "./use-courses.js";
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
    send: vi.fn(),
    openSession: vi.fn().mockResolvedValue(sessionFile),
  } as unknown as ChatController & { send: ReturnType<typeof vi.fn>; openSession: ReturnType<typeof vi.fn> };
}

let actions: CourseSessionActions | null = null;

function Harness({
  controller,
  courses,
  update,
  setActiveCourse,
}: {
  controller: ChatController;
  courses: CoursesResource;
  update: (patch: Partial<DesktopSettings>) => void;
  setActiveCourse: (slug: string | null) => void;
}) {
  const current = useCourseSessions(controller, DEFAULT_DESKTOP_SETTINGS, update, courses, null, setActiveCourse);
  useEffect(() => {
    actions = current;
  });
  return null;
}

afterEach(() => {
  actions = null;
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
        "algebra",
        setActiveCourse,
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
        minutesPerDay: 30,
        startDate: "2026-11-04",
        style: "deep",
      });
      await Promise.resolve();
    });
    expect(controller.send).toHaveBeenCalledTimes(1);

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
