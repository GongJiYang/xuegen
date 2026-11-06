/**
 * Per-course sessions: which course is active, and the actions that switch it.
 *
 * Each course studies in its own transcript so courses never share a context.
 * Each day's first lesson opens a fresh transcript; the rest of that day
 * returns to it. The active course is either the one the user just started (`chosen`) or, after
 * a relaunch that resumed a session, the course whose remembered file is the one
 * now open.
 *
 * `activeCourse` must be known before `useChat` is created (the style is resolved
 * from it) while the open file is only known *after* `useChat` exists. `App`
 * therefore keeps the two bits of state, calls the pure {@link
 * resolveActiveCourse} to derive the course, then hands the controller to
 * {@link useCourseSessions} for the actions.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CourseSummary } from "@shared/data-protocol.js";
import type { DesktopSettings } from "@shared/protocol.js";
import type { ChatController } from "../chat/useChat.js";
import { findNewCourseSlug } from "./course-claim.js";
import { courseIntro, type CourseIntro, type CourseIntroState } from "./course-intro.js";
import { editPlanPrompt, newCoursePrompt, type NewCourseRequest } from "./course-prompts.js";
import { openingAction, startedTodayMap } from "./opening-action.js";
import { dateKey } from "./use-calendar.js";
import { resumePrompt, studyPrompt, type ResumePoint } from "../today.js";
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
  /** Courses opened today, as `{ slug: true }`, for the button labels. */
  startedToday: Record<string, boolean>;
  /** The local card shown while the agent reads the course file, or null. */
  intro: CourseIntroState | null;
  /** 「开始学习」/「回到这门课」: the day's first click starts today's lesson in a fresh session; later clicks switch back. */
  handleStudy(course: CourseSummary): void;
  /** 「继续学习」/「回到这门课」: resume the most recent course the same way. */
  handleResume(): void;
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
  resume: ResumePoint | null,
  activeCourse: string | null,
  setActiveCourse: (slug: string | null) => void,
  requestFocus: () => void,
): CourseSessionActions {
  const pendingNewCourse = useRef<PendingNewCourse | null>(null);
  const [intro, setIntro] = useState<CourseIntroState | null>(null);
  const startedToday = startedTodayMap(settings.courseStartedOn, dateKey(new Date()));
  // The latest transcript length, kept in a ref so the promise continuation
  // below reads the switched session's history instead of the stale closure.
  const messagesLength = useRef(controller.messages.length);
  // Layout effect (not passive) so the ref already holds the switched session's
  // history length by the time `openSession` resolves.
  useLayoutEffect(() => {
    messagesLength.current = controller.messages.length;
  }, [controller.messages.length]);

  const startSession = useCallback(
    (slug: string, text: string, card: CourseIntro | null, startedOn: string | null, command = false, fresh = false) => {
      // A course-management request (改计划) is an instruction, not a lesson:
      // it goes out without the session style prefix.
      const deliver = (message: string): void => (command ? controller.sendCommand(message) : controller.send(message));
      if (card) setIntro({ card, beforeIndex: controller.messages.length });
      if (activeCourse === slug && !fresh) {
        deliver(text);
        if (startedOn) {
          update({ courseStartedOn: { ...settings.courseStartedOn, [slug]: startedOn } });
        }
        return;
      }
      // The day's first lesson starts a fresh session, so 学根 reads the course
      // file anew instead of answering from an older session's memory.
      const known = fresh ? null : (settings.courseSessions[slug] ?? null);
      setActiveCourse(slug);
      void controller.openSession(known).then((opened) => {
        const patch: Partial<DesktopSettings> = {};
        if (opened && opened !== known) {
          patch.courseSessions = { ...settings.courseSessions, [slug]: opened };
        }
        if (startedOn) {
          patch.courseStartedOn = { ...settings.courseStartedOn, [slug]: startedOn };
        }
        if (Object.keys(patch).length > 0) update(patch);
        if (card) {
          // The switched session's history is in place now; put the card after
          // it, still before the prompt that is about to be sent.
          setIntro((current) =>
            current?.card === card ? { card, beforeIndex: messagesLength.current } : current,
          );
        }
        deliver(text);
      });
    },
    [activeCourse, controller, settings.courseSessions, settings.courseStartedOn, update, setActiveCourse],
  );

  /** Switch back to a course opened today without sending or showing a card. */
  const switchOnly = useCallback(
    (slug: string) => {
      const known = settings.courseSessions[slug] ?? null;
      setIntro(null);
      setActiveCourse(slug);
      if (!known) return;
      void controller.openSession(known).then((opened) => {
        if (opened && opened !== known) {
          update({ courseSessions: { ...settings.courseSessions, [slug]: opened } });
        }
      });
    },
    [controller, settings.courseSessions, update, setActiveCourse],
  );

  /**
   * Start today's lesson or switch back, depending on whether this course was
   * already opened today. `fallbackText`/`card` are only used when opening.
   */
  const openCourse = useCallback(
    (slug: string, fallbackText: string, card: CourseIntro) => {
      const today = dateKey(new Date());
      const action = openingAction(slug, today, settings.courseStartedOn, activeCourse);
      if (action === "focus-only") {
        requestFocus();
        return;
      }
      if (action === "switch-only" && settings.courseSessions[slug]) {
        switchOnly(slug);
        return;
      }
      startSession(slug, fallbackText, card, today, false, true);
    },
    [
      activeCourse,
      requestFocus,
      settings.courseSessions,
      settings.courseStartedOn,
      startSession,
      switchOnly,
    ],
  );

  const handleStartSession = useCallback(
    (slug: string, text: string) => startSession(slug, text, null, null),
    [startSession],
  );

  const handleStudy = useCallback(
    (course: CourseSummary) => openCourse(course.slug, studyPrompt(course), courseIntro(course)),
    [openCourse],
  );

  const handleResume = useCallback(() => {
    if (resume) openCourse(resume.course.slug, resumePrompt(resume), courseIntro(resume.course));
  }, [openCourse, resume]);

  const handleNewCourse = useCallback(
    (request: NewCourseRequest) => {
      // Without a loaded list there is no "before" to compare with; claiming
      // would mistake an existing course for the new one, so skip the claim.
      const before =
        courses.state.status === "ready" ? courses.state.value.map((course) => course.slug) : null;
      setIntro(null);
      setActiveCourse(null);
      void controller.openSession(null).then((opened) => {
        if (!opened) return;
        if (before) pendingNewCourse.current = { request, sessionFile: opened, before };
        controller.sendCommand(newCoursePrompt(request));
      });
    },
    [courses.state, controller, setActiveCourse],
  );

  const handleEditPlan = useCallback(
    (course: CourseSummary, change: string) => {
      // A plan change belongs to the course's own session, like 开始学习, but it
      // is not an opening: no intro card, and it never marks the day as started.
      startSession(course.slug, editPlanPrompt(course.title, change), null, null, true);
    },
    [startSession],
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
    setIntro(null);
    setActiveCourse(null);
    controller.newSession();
  }, [controller, setActiveCourse]);
  const handleContinueSession = useCallback(() => {
    setIntro(null);
    setActiveCourse(null);
    controller.continueSession();
  }, [controller, setActiveCourse]);

  return {
    activeCourse,
    startedToday,
    intro,
    handleStudy,
    handleResume,
    handleStartSession,
    handleNewCourse,
    handleEditPlan,
    handleNewSession,
    handleContinueSession,
  };
}
