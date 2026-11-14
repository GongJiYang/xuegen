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
import { useTerms } from "./use-terms.js";
import { termTrail, type TermStop } from "./terms.js";
import { activityCards } from "./activity-feed.js";
import { planMarks, changeLine } from "./plan-diff.js";
import { usePlanChanges } from "./use-plan-changes.js";
import { useReader } from "./use-reader.js";
import { useNextCycle } from "./use-next-cycle.js";
import type { ControlFeedView, PlanChangesView, ReaderNav } from "../../skins/contract.js";
import { strings } from "../strings.js";
import { useState } from "react";
import { withActionMarker } from "../chat/action-marker.js";
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
  /** Clear the remembered course when 陪读 opens a 自由 session. */
  setActiveCourse(slug: string | null): void;
  /** settings `verifiedOn` (slug → the day its 周核实 last started). */
  verifiedOn: Record<string, string>;
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
  /** The 总控 right column as cards and the reader; null outside 总控. */
  feed: ControlFeedView | null;
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
    // 陪读: a 自由 session (it may read anything, writes no course page), asked
    // first if an answer is running; the prompt is folded as 「陪读」.
    onAccompany: (prompt) =>
      controller.guardSwitch(() => {
        input.setActiveCourse(null);
        void controller.openSession(null, { kind: "free" }).then((opened) => {
          if (opened !== null) controller.sendCommand(withActionMarker(prompt, "accompany"));
        });
      }),
    verifiedOn: input.verifiedOn,
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
  const [weekFocus, setWeekFocus] = useState(0);
  const today = todayKey();
  const panel = useControlPanel({
    shownDay,
    shelf: reading.shelf,
    cards: input.cards,
    anki,
    overview: cycle.overview,
    subjects: input.subjects,
    enabled: control.isControl,
    verifiedOn: input.verifiedOn,
  });
  const names = cycle.today.state.status === "ready" ? cycle.today.state.value.names : NO_NAMES;
  const terms = useTerms(control.isControl, today, names);
  const turnId = lastUserId(controller.messages);
  const changes = usePlanChanges({
    enabled: control.isControl,
    streaming: controller.streaming,
    turnId,
    today,
    onUndone: () => {
      plan.plan.reload();
      courses.reload();
      cycle.reload();
      input.subjects.reload();
      controller.setOnceNote(strings.chat.undoneNote);
    },
  });
  const reader = useReader();
  const nextCycle = useNextCycle({
    enabled: control.isControl,
    overview: panel.overview,
    subjects: input.subjects.state.status === "ready" ? input.subjects.state.value : null,
    unplanned: panel.unplanned,
    names,
    send: controller.send,
  });
  const cards = activityCards({
    messages: fold.messages,
    changes: changes.byTurn,
    undo: changes.undo,
    names,
    streaming: controller.streaming,
  });
  const openCard = (id: string): void => {
    const card = cards.find((item) => item.id === id);
    if (card !== undefined) reader.openTurn(card);
  };
  const trail = Array.isArray(terms) ? termTrail(terms) : [];
  const openTerm = (path: string, title: string): void => {
    const stop = trail.find((item) => item.path === path);
    reader.openPage(path, title, stop === undefined ? undefined : strings.feed.termSub(stop.label));
  };
  const readerNav = termNav(trail, reader.view?.path ?? null, names, openTerm);
  const feed: ControlFeedView | null = control.isControl
    ? {
        cards,
        caption: strings.feed.countToday(cards.filter((card) => card.ask !== "").length),
        onShowAnswer: openCard,
        onShowInWeek: (id) => {
          const first = changes.byTurn[id]?.[0];
          const date = first?.to ?? first?.from;
          if (date === null || date === undefined) return;
          plan.plan.showWeek(date);
          setWeekFocus((count) => count + 1);
        },
        onUndo: changes.undoTurn,
        reader: reader.view,
        readerNav,
        onCloseReader: reader.close,
      }
    : null;
  const latest = changes.latest;
  const changesView: PlanChangesView | null =
    control.isControl && latest !== null
      ? {
          lines: latest.changes.map((change) => changeLine(change, names)),
          marks: planMarks(latest.changes, names, changes.roles),
          onDismiss: changes.dismiss,
          onShowAnswer: () => openCard(latest.turnId),
          undo: changes.undo[latest.turnId] ?? null,
          onUndo: () => changes.undoTurn(latest.turnId),
        }
      : null;
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
    terms,
    onOpenTerm: openTerm,
    changes: changesView,
    weekFocus,
    ...(nextCycle === undefined ? {} : { nextCycle }),
  };
  return {
    panelShowCard: shownDay === null && plan.card !== null,
    props: { ...props, onOpenAnki: () => input.openTool("cards") },
    showCard,
    card: plan.card,
    panelProps,
    older: plan.older,
    feed,
  };
}

function lastUserId(messages: readonly { id: string; role: string }[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return messages[index]?.id ?? null;
  }
  return null;
}

const NO_NAMES: Record<string, string> = {};

/** 上一个 / 下一个 within the open term's course, in the block's order. */
function termNav(
  trail: readonly TermStop[],
  path: string | null,
  names: Readonly<Record<string, string>>,
  open: (path: string, title: string) => void,
): ReaderNav | null {
  const current = trail.find((item) => item.path === path);
  if (current === undefined) return null;
  const course = trail.filter((item) => item.course === current.course);
  const at = course.indexOf(current);
  const step = (stop: TermStop | undefined) =>
    stop === undefined ? null : () => open(stop.path, stop.title);
  return {
    position: strings.feed.readerPosition(names[current.course] ?? "", at + 1, course.length),
    onPrev: step(course[at - 1]),
    onNext: step(course[at + 1]),
  };
}
