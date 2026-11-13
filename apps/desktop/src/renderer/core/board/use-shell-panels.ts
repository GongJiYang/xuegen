/**
 * The `shellPanels` call's argument assembly, lifted out of `App` to keep it
 * under its line budget.
 *
 * `App` passes the raw hook results and setters; the derived callbacks (the
 * day editor's lookup, the card-drafting prompt, 回到这门课) are built here —
 * the same wiring that used to sit inline. It is a hook in name and position
 * only: everything inside is a pure call, like `shellPanels` itself.
 */

import type { Dispatch, SetStateAction } from "react";
import type { CourseSummary, ReadingDue, ReadingPriority, SubjectsOverview } from "@shared/data-protocol.js";
import type { ShellPanels, SkillsPanelProps, ToolFocus, AddedReading } from "../../skins/contract.js";
import { splitActionMarker, withActionMarker } from "../chat/action-marker.js";
import { strings } from "../strings.js";
import type { ResumePoint, TodayPlanItem } from "../today.js";
import { todayKey } from "../today.js";
import type { SessionStyle } from "../chat/use-session-style.js";
import type { useChat } from "../chat/useChat.js";
import type { BoardResource } from "./use-resource.js";
import type { NewCourseRequest } from "./course-prompts.js";
import type { CoursesResource } from "./use-courses.js";
import type { useReading } from "./use-reading.js";
import type { useCards, useAnki } from "./use-cards.js";
import type { useCalendar } from "./use-calendar.js";
import type { CycleResource } from "./use-cycle.js";
import type { useControlSession } from "./use-control-session.js";
import type { useSessionList } from "./use-session-list.js";
import { shellPanels } from "./shell-panels.js";

/**
 * The course title a fold label shows, from the list the shell already loaded.
 * A course that is not there yet (still loading, or a slug from the cycle page
 * that has no course file) leaves the label at the bare action name.
 */
export function courseTitleOf(courses: CoursesResource, slug: string): string | null {
  if (courses.state.status !== "ready") return null;
  return courses.state.value.find((course) => course.slug === slug)?.title ?? null;
}

/** 周核实: the cycle page's 「核实 →」 hands this to the course's own session. */
export function verifyMessage(slug: string, title: string | null): string {
  const text = strings.cycle.verifyPrompt(slug);
  return title === null ? withActionMarker(text, "verify") : withActionMarker(text, "verify", { slug, title });
}

/** 起草卡片: the cards panel's default prompt, or the text the panel passed in. */
export function draftedCardsMessage(prompt: string | undefined): string {
  const text = prompt ?? strings.cards.draftPrompt;
  // `shellPanels` already marks its two buttons; never stack a second marker.
  return splitActionMarker(text).action === null ? withActionMarker(text, "cards") : text;
}

export interface ShellPanelsArgs {
  courses: CoursesResource;
  reading: ReturnType<typeof useReading>;
  cards: ReturnType<typeof useCards>;
  anki: ReturnType<typeof useAnki>;
  calendar: ReturnType<typeof useCalendar>;
  cycle: CycleResource;
  subjects: BoardResource<SubjectsOverview>;
  skillsPanel: Omit<SkillsPanelProps, "tool">;
  todayPlan: TodayPlanItem[];
  tomorrowPlan: TodayPlanItem[];
  courseTitles: Record<string, string>;
  sessionStyle: SessionStyle;
  startedToday: Record<string, boolean>;
  resume: ResumePoint | null;
  agentReady: boolean;
  /** The tool field to focus once its window opens (`/加入阅读`). */
  pendingFocus: ToolFocus | null;
  onFocusHandled(): void;
  /** `controller.sendCommand` — the card-drafting prompt goes through it. */
  controller: ReturnType<typeof useChat>;
  /** `control` — only its `openControl` is read. */
  control: ReturnType<typeof useControlSession>;
  cycleId: string | null;
  sessionList: ReturnType<typeof useSessionList>;
  /** The `useCourseSessions` handlers the panels wire to. */
  handleResume(): void;
  handleStudy(course: CourseSummary): void;
  handleNewCourse(request: NewCourseRequest): void;
  handleEditPlan(course: CourseSummary, change: string): void;
  handleStartSession(slug: string, text: string): void;
  /** `studyCourse`: start today's lesson of the named course. */
  studyCourse(slug: string): void;
  /** `setEditingDay`: open the day editor for the given date. */
  setEditingDay: Dispatch<SetStateAction<{ date: string; text: string } | null>>;
  handleReadingAdd(
    source: string,
    priority: ReadingPriority,
    due: ReadingDue,
  ): Promise<AddedReading | null>;
  handleReadingClip(url: string, priority: ReadingPriority, due: ReadingDue): void;
}

export function useShellPanels(input: ShellPanelsArgs): ShellPanels {
  const { calendar, controller, control, cycleId, sessionList, sessionStyle } = input;
  return shellPanels({
    courses: input.courses,
    reading: input.reading,
    cards: input.cards,
    anki: input.anki,
    calendar,
    cycle: input.cycle,
    subjects: input.subjects,
    today: todayKey(),
    skillsPanel: input.skillsPanel,
    todayPlan: input.todayPlan,
    tomorrowPlan: input.tomorrowPlan,
    courseTitles: input.courseTitles,
    courseStyles: sessionStyle.courseStyles,
    startedToday: input.startedToday,
    resume: input.resume,
    agentReady: input.agentReady,
    focus: input.pendingFocus,
    onFocusHandled: input.onFocusHandled,
    onResume: input.handleResume,
    onCourseStyle: sessionStyle.setCourse,
    onStudy: input.handleStudy,
    onNewCourse: input.handleNewCourse,
    onEditPlan: input.handleEditPlan,
    onReadingAdd: input.handleReadingAdd,
    onReadingClip: input.handleReadingClip,
    onDraftCards: (prompt) => controller.sendCommand(draftedCardsMessage(prompt)),
    onEditDay: (date) => {
      const day =
        calendar.resource.state.status === "ready" ? calendar.resource.state.value.days[date] : undefined;
      input.setEditingDay({ date, text: day?.note ?? "" });
    },
    onStudyCourse: input.studyCourse,
    onVerifyCourse: (slug) => input.handleStartSession(slug, verifyMessage(slug, courseTitleOf(input.courses, slug))),
    onOpenControl: cycleId ? control.openControl : null,
    sessions: sessionList.view,
  });
}
