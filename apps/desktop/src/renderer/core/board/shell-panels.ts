/**
 * The side windows' props, assembled from the board resources and actions.
 *
 * `App` owns the resources and the callbacks; this pure function only arranges
 * them into the per-window props the skin contract asks for, so the shell stays
 * an assembly of hooks rather than a wall of object literals.
 */

import type { ReadingDue, ReadingPriority } from "@shared/data-protocol.js";
import type { CourseSummary } from "@shared/data-protocol.js";
import type { SubjectsOverview } from "@shared/data-protocol.js";
import type { TeachingStyle } from "@shared/protocol.js";
import type { SessionsView, ShellPanels, SkillsPanelProps, ToolFocus } from "../../skins/contract.js";
import type { NewCourseRequest } from "./course-prompts.js";
import { groupProgress } from "./progress-groups.js";
import { shelfPanel } from "./shelf-view.js";
import { withActionMarker } from "../chat/action-marker.js";
import { strings } from "../strings.js";
import type { BoardResource } from "./use-resource.js";
import type { ResumePoint, TodayPlanItem } from "../today.js";
import { dateKey, monthGrid, shiftMonth, type useCalendar } from "./use-calendar.js";
import type { CycleResource } from "./use-cycle.js";
import type { useCards, useAnki } from "./use-cards.js";
import type { CoursesResource } from "./use-courses.js";
import type { useReading } from "./use-reading.js";
import type { AddedReading } from "../../skins/contract.js";

export interface ShellPanelsInput {
  courses: CoursesResource;
  reading: ReturnType<typeof useReading>;
  cards: ReturnType<typeof useCards>;
  anki: ReturnType<typeof useAnki>;
  calendar: ReturnType<typeof useCalendar>;
  cycle: CycleResource;
  subjects: BoardResource<SubjectsOverview>;
  /** `YYYY-MM-DD` of today, for the 总进度 marks. */
  today: string;
  skillsPanel: Omit<SkillsPanelProps, "tool">;
  todayPlan: TodayPlanItem[];
  tomorrowPlan: TodayPlanItem[];
  courseTitles: Record<string, string>;
  courseStyles: Record<string, TeachingStyle>;
  startedToday: Record<string, boolean>;
  resume: ResumePoint | null;
  agentReady: boolean;
  focus: ToolFocus | null;
  onFocusHandled(): void;
  onResume(): void;
  onCourseStyle(slug: string, style: TeachingStyle): void;
  onStudy(course: CourseSummary): void;
  onNewCourse(request: NewCourseRequest): void;
  onEditPlan(course: CourseSummary, change: string): void;
  onReadingAdd(source: string, priority: ReadingPriority, due: ReadingDue): Promise<AddedReading | null>;
  onReadingClip(url: string, priority: ReadingPriority, due: ReadingDue): void;
  /** Send a card-drafting prompt; without one the cards panel's default prompt is used. */
  onDraftCards(prompt?: string): void;
  onEditDay(date: string): void;
  onStudyCourse(slug: string): void;
  onVerifyCourse(slug: string): void;
  onOpenControl: (() => void) | null;
  /** The session list's groups + pick action, for the calendar's 「这天的会话」. */
  sessions: SessionsView;
}

export function shellPanels(input: ShellPanelsInput): ShellPanels {
  const { courses, reading, cards, anki, calendar } = input;
  return {
    today: {
      todayPlan: input.todayPlan,
      tomorrowPlan: input.tomorrowPlan,
      readingDue: reading.stats.state,
      cards: cards.stats.state,
      resume: input.resume,
      onResume: input.onResume,
      agentReady: input.agentReady,
      startedToday: input.startedToday,
      cycleToday: input.cycle.today.state,
      cycleTomorrow: input.cycle.tomorrow.state,
      courses: courses.state,
      anki: anki.state,
      onStudyCourse: input.onStudyCourse,
      onVerifyCourse: input.onVerifyCourse,
      onOpenControl: input.onOpenControl,
    },
    progress: {
      courses: courses.state,
      courseStyles: input.courseStyles,
      startedToday: input.startedToday,
      onCourseStyle: input.onCourseStyle,
      onStudy: input.onStudy,
      onNewCourse: input.onNewCourse,
      onEditPlan: input.onEditPlan,
      sources: reading.sources.state,
      groups:
        input.subjects.state.status === "ready" &&
        courses.state.status === "ready" &&
        input.subjects.state.value.subjects.length > 0
          ? groupProgress(input.subjects.state.value, courses.state.value, input.today)
          : null,
      overview: input.cycle.overview.state,
    },
    reading: {
      shelf:
        reading.shelf.list.state.status === "ready"
          ? { status: "ready", value: shelfPanel(reading.shelf.list.state.value, input.today) }
          : reading.shelf.list.state,
      queue: reading.queue.state,
      sources: reading.sources.state,
      onAdd: input.onReadingAdd,
      onClip: input.onReadingClip,
      onReview: (slug, outcome, position) => {
        void reading.review(slug, outcome, position);
      },
      onShelfCards: (slug) => {
        if (reading.shelf.list.state.status !== "ready") return;
        const book = reading.shelf.list.state.value.find((item) => item.slug === slug);
        if (book === undefined) return;
        const pending = book.extracts.filter((extract) => extract.carded === null).length;
        input.onDraftCards(withActionMarker(strings.reading.shelfCardsPrompt(book.short, slug, pending), "cards"));
      },
      focus: input.focus ?? undefined,
      onFocusHandled: input.onFocusHandled,
    },
    cards: {
      cards: cards.stats.state,
      anki: anki.state,
      onAdd: (deck, front, back) => {
        void cards.add(deck, front, back).then((result) => {
          if (result.ok) anki.reload();
        });
      },
      onRetryAnki: anki.reload,
      // The panel's button is an `onClick` handler, so it hands us the mouse event:
      // drop it explicitly, or the event object becomes the "prompt" and reaches
      // `controller.send` instead of the cards panel's default prompt.
      onDraft: () => input.onDraftCards(withActionMarker(strings.cards.draftPrompt, "cards")),
    },
    calendar: {
      month: calendar.resource.state,
      monthKey: calendar.month,
      onPrevMonth: () => calendar.setMonth(shiftMonth(calendar.month, -1)),
      onNextMonth: () => calendar.setMonth(shiftMonth(calendar.month, 1)),
      cells: monthGrid(calendar.month),
      selected: calendar.selected,
      onSelectDay: calendar.select,
      courseTitles: input.courseTitles,
      cycleMonth: input.cycle.month.state,
      onEditDay: input.onEditDay,
      daySessions: (date) => input.sessions.groups.find((group) => group.date === date)?.rows ?? [],
      onOpenSession: input.sessions.onPick,
      onToday: () => {
        const today = dateKey(new Date());
        calendar.setMonth(today.slice(0, 7));
        calendar.select(today);
      },
    },
    skills: input.skillsPanel,
  };
}
