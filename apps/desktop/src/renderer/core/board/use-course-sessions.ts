/**
 * Per-course sessions: which course is active, and the actions that switch it.
 *
 * Each course studies in its own transcript so courses never share a context.
 * The active course is either the one the user just started (`chosen`) or, after
 * a relaunch that resumed a session, the course whose remembered file is the one
 * now open.
 *
 * `activeCourse` must be known before `useChat` is created (the style is resolved
 * from it) while the open file is only known *after* `useChat` exists. `App`
 * therefore keeps the two bits of state, calls the pure {@link
 * resolveActiveCourse} to derive the course, then hands the controller to
 * {@link useCourseSessions} for the actions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CourseSummary } from "@shared/data-protocol.js";
import type { DesktopSettings } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import { findNewCourseSlug } from "./course-claim.js";
import { editPlanPrompt, newCoursePrompt, type NewCourseRequest } from "./course-prompts.js";
import type { CoursesResource } from "./use-courses.js";

/** The course whose session is running, or null for a free chat. */
export function resolveActiveCourse(
  chosen: string | null,
  courseSessions: Record<string, string>,
  openSessionFile: string | null,
): string | null {
  return (
    chosen ??
    Object.entries(courseSessions).find(([, file]) => file === openSessionFile)?.[0] ??
    null
  );
}

/** State `App` keeps across skin switches: the chosen course and the open file. */
export interface ActiveCourseState {
  activeCourse: string | null;
  openSessionFile: string | null;
  setActiveCourse(slug: string | null): void;
  setOpenSessionFile(file: string | null): void;
}

/** Own the chosen-course/open-file state and derive the active course. */
export function useActiveCourse(settings: DesktopSettings): ActiveCourseState {
  const [chosenCourse, setActiveCourse] = useState<string | null>(null);
  const [openSessionFile, setOpenSessionFile] = useState<string | null>(null);
  const activeCourse = resolveActiveCourse(chosenCourse, settings.courseSessions, openSessionFile);
  return { activeCourse, openSessionFile, setActiveCourse, setOpenSessionFile };
}

/** A 「新课程」 request waiting for the course file to appear in the list. */
interface PendingNewCourse {
  request: NewCourseRequest;
  /** The fresh session the request was sent in, to remember for the new slug. */
  sessionFile: string;
  /** Course slugs before the request, so the new one can be told apart. */
  before: string[];
}

export interface CourseSessionActions {
  activeCourse: string | null;
  /**
   * Study a course in its own session. Already in that course's session: just
   * send. Otherwise switch to the course's remembered session (or a fresh one),
   * remember the file, then send.
   */
  handleStartSession(slug: string, text: string): void;
  handleNewCourse(request: NewCourseRequest): void;
  handleEditPlan(course: CourseSummary, change: string): void;
  handleNewSession(): void;
  handleContinueSession(): void;
}

/** The course-session actions, bound to the already-created controller. */
export function useCourseSessions(
  controller: ChatController,
  settings: DesktopSettings,
  update: (patch: Partial<DesktopSettings>) => void,
  courses: CoursesResource,
  activeCourse: string | null,
  setActiveCourse: (slug: string | null) => void,
): CourseSessionActions {
  const pendingNewCourse = useRef<PendingNewCourse | null>(null);

  const handleStartSession = useCallback(
    (slug: string, text: string) => {
      if (activeCourse === slug) {
        controller.send(text);
        return;
      }
      const known = settings.courseSessions[slug] ?? null;
      setActiveCourse(slug);
      void controller.openSession(known).then((opened) => {
        if (opened && opened !== known) {
          update({ courseSessions: { ...settings.courseSessions, [slug]: opened } });
        }
        controller.send(text);
      });
    },
    [activeCourse, controller, settings.courseSessions, update, setActiveCourse],
  );

  const handleNewCourse = useCallback(
    (request: NewCourseRequest) => {
      // Without a loaded list there is no "before" to compare with; claiming
      // would mistake an existing course for the new one, so skip the claim.
      const before =
        courses.state.status === "ready" ? courses.state.value.map((course) => course.slug) : null;
      setActiveCourse(null);
      void controller.openSession(null).then((opened) => {
        if (!opened) return;
        if (before) pendingNewCourse.current = { request, sessionFile: opened, before };
        controller.send(newCoursePrompt(request));
      });
    },
    [courses.state, controller, setActiveCourse],
  );

  const handleEditPlan = useCallback(
    (course: CourseSummary, change: string) => {
      // A plan change belongs to the course's own session, like 开始学习.
      handleStartSession(course.slug, editPlanPrompt(course.title, change));
    },
    [handleStartSession],
  );

  // Claim the course a 「新课程」 request created: the first slug that was not in
  // the list before the request. The settings write goes through a microtask so
  // this effect never sets state synchronously (the project lint rule).
  useEffect(() => {
    const pending = pendingNewCourse.current;
    if (!pending || courses.state.status !== "ready") return;
    const slug = findNewCourseSlug(pending.before, courses.state.value);
    if (!slug) return;
    pendingNewCourse.current = null;
    void Promise.resolve().then(() => {
      setActiveCourse(slug);
      update({
        courseSessions: { ...settings.courseSessions, [slug]: pending.sessionFile },
        courseStyles: { ...settings.courseStyles, [slug]: pending.request.style },
      });
    });
  }, [courses.state, settings.courseSessions, settings.courseStyles, update, setActiveCourse]);

  const handleNewSession = useCallback(() => {
    setActiveCourse(null);
    controller.newSession();
  }, [controller, setActiveCourse]);
  const handleContinueSession = useCallback(() => {
    setActiveCourse(null);
    controller.continueSession();
  }, [controller, setActiveCourse]);

  return {
    activeCourse,
    handleStartSession,
    handleNewCourse,
    handleEditPlan,
    handleNewSession,
    handleContinueSession,
  };
}
