/**
 * The control session's planbook assembly.
 *
 * Takes the hook results `App` already owns and returns what the shell needs:
 * `props` for the `Planbook` slot (everything but `todayCard`, which App
 * renders from `card` once the skin is resolved), `showCard` saying whether
 * the day view is looking at today, the 今日卡 props, and the 「更早的对话」
 * row for the transcript. The element itself stays in `App` because the slot
 * components only exist after the skin resolves.
 */

import type { ControlCardProps, ControlPanelProps, PlanbookProps, ToolId } from "../../skins/contract.js";
import type { SubjectsOverview } from "@shared/data-protocol.js";
import type { BoardResource } from "./use-resource.js";
import type { CardsResource } from "./use-cards.js";
import { useControlPanel } from "./use-control-panel.js";
import { useState } from "react";
import { todayKey } from "../today.js";
import type { useChat } from "../chat/useChat.js";
import { tomorrowLine } from "./cycle-today.js";
import type { useAnki } from "./use-cards.js";
import type { useCalendar } from "./use-calendar.js";
import type { CoursesResource } from "./use-courses.js";
import type { useControlFold } from "./use-control-fold.js";
import type { useControlSession } from "./use-control-session.js";
import { useControlPlan } from "./use-control-plan.js";
import { planbookProps } from "./planbook-props.js";
import type { useReading } from "./use-reading.js";
import type { CycleResource } from "./use-cycle.js";
import { courseTitleOf, verifyMessage } from "./use-shell-panels.js";

export interface ControlPlanbookInput {
  cycle: CycleResource;
  reading: ReturnType<typeof useReading>;
  anki: ReturnType<typeof useAnki>;
  controller: ReturnType<typeof useChat>;
  control: ReturnType<typeof useControlSession>;
  fold: ReturnType<typeof useControlFold>;
  courses: CoursesResource;
  calendar: ReturnType<typeof useCalendar>;
  cards: CardsResource;
  subjects: BoardResource<SubjectsOverview>;
  /** Start today's lesson of the named course. */
  studyCourse(slug: string): void;
  /** `handleStartSession`: send `text` in the course's own session. */
  startSession(slug: string, text: string): void;
  openTool(tool: ToolId): void;
}

/** The 面板 props App hands to the skin, minus the 今日卡 element. */
export type ControlPanelHookProps = Omit<ControlPanelProps, "todayCard">;

export interface ControlPlanbook {
  /** The panel's 今天 block shows today, so App attaches the 今日卡. */
  panelShowCard: boolean;
  /** `Planbook` props minus `todayCard` (App attaches the card element). */
  props: Omit<PlanbookProps, "todayCard" | "onOpenAnki"> & { onOpenAnki(): void };
  /** True only on the day view anchored at today: the 今日卡 belongs there. */
  showCard: boolean;
  /** The 今日卡 props — App renders them with `older={null}` per the planbook layout. */
  card: ControlCardProps | null;
  /** The 总控 面板 props minus the 今日卡 element (App attaches it, as for the planbook). */
  panelProps: ControlPanelHookProps;
  /** The 「更早的对话」 fold row for the transcript header. */
  older: { label: string; onToggle(): void } | null;
}

export function useControlPlanbook(input: ControlPlanbookInput): ControlPlanbook {
  const { cycle, reading, anki, controller, control, fold, courses, calendar } = input;
  const plan = useControlPlan({
    today: cycle.today,
    tomorrow: cycle.tomorrow,
    queue: reading.queue,
    anki,
    shelf: reading.shelf,
    streaming: controller.streaming,
    onStudy: input.studyCourse,
    onVerify: (slug) => input.startSession(slug, verifyMessage(slug, courseTitleOf(courses, slug))),
    onOpenTool: input.openTool,
    onAskBrief: control.askBrief,
    refresh: () => {
      courses.reload();
      calendar.resource.reload();
    },
    isControl: control.isControl,
    fold,
  });
  const tomorrow = cycle.tomorrow.state.status === "ready" ? tomorrowLine(cycle.tomorrow.state.value) : null;
  const { showCard, ...props } = planbookProps(plan.plan, plan.card, tomorrow, todayKey());
  // The 今日卡 Anki row and the week grid's 「打开 →」 run the same action: open
  // the cards tool.
  // The 今天 block's date: null is today; a week / month cell click shows that day.
  const [shownDay, setShownDay] = useState<string | null>(null);
  const today = todayKey();
  const panel = useControlPanel({
    shownDay,
    shelf: reading.shelf,
    cards: input.cards,
    anki,
    overview: cycle.overview,
    subjects: input.subjects,
    enabled: control.isControl,
  });
  const panelProps: ControlPanelHookProps = {
    tiles: panel.tiles,
    shelf: panel.shelf,
    unplanned: panel.unplanned,
    overview: panel.overview,
    cards: panel.cards,
    day: panel.day,
    // The right block pages with the plan (‹ 今天 ›); until a paged week loads,
    // this week from the panel stands in.
    week: props.week ?? panel.week,
    month: props.month,
    view: plan.plan.view,
    onView: plan.plan.setView,
    label: plan.plan.label,
    onPrev: plan.plan.prev,
    onNext: plan.plan.next,
    onToday: plan.plan.today,
    todayDisabled: plan.plan.todayDisabled,
    onPrint: () => window.print(),
    tomorrow,
    onOpenDay: (date) => setShownDay(date === today ? null : date),
    shownToday: shownDay === null,
    onBackToToday: () => setShownDay(null),
    onOpenAnki: () => input.openTool("cards"),
    onAsk: controller.send,
    onOpenSkills: () => input.openTool("skills"),
    onOpenCards: () => input.openTool("cards"),
  };
  return {
    panelShowCard: shownDay === null && plan.card !== null,
    props: { ...props, onOpenAnki: () => input.openTool("cards") },
    showCard,
    card: plan.card,
    panelProps,
    older: plan.older,
  };
}
