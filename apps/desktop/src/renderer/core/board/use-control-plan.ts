/**
 * The 总控 planbook hook: the 今日卡 plus the day/week/month paging above it.
 *
 * Owns what `App.tsx` assembled inline for the control session — the
 * `useControlCard` props (merged with the 「更早的对话」 fold row) — and the
 * planbook state machine from `planbook-nav.ts`: `view` starts on `day` (the
 * control session opens on today's actionable list), `anchor` on today; ‹ ›
 * page the anchor, 「今天」 snaps it back, `openDay` jumps a cell/row click to
 * that day. Data comes from `usePlanbook`; on a non-control session the card
 * and fold are null and no planbook request is made.
 */

import { useReloadOnAnswer } from "./use-reload-on-answer.js";
import { useState } from "react";
import type { ControlCardProps } from "../../skins/contract.js";
import { strings } from "../strings.js";
import { todayKey } from "../today.js";
import type { ControlFold } from "./control-fold.js";
import { isTodayInView, rangeLabel, shiftAnchor, type PlanView } from "./planbook-nav.js";
import type { PlanWeek } from "./planbook.js";
import type { AsyncState } from "./state.js";
import { useControlCard, type ControlCardInput } from "./use-control-card.js";
import { usePlanbook, type PlanbookResult } from "./use-planbook.js";

export interface ControlPlanInput extends ControlCardInput {
  /** Whether the open session is the 总控 one. */
  isControl: boolean;
  /** The transcript fold (`useControlFold`'s return). */
  fold: ControlFold & { open: boolean; toggle(): void };
}

export interface ControlPlan {
  /** The 今日卡 props, `older` merged in — `useControlCard`'s return plus the fold row. */
  card: ControlCardProps | null;
  /** The 「更早的对话」 fold row, or null. */
  older: { label: string; onToggle(): void } | null;
  plan: {
    view: PlanView;
    anchor: string;
    setView(view: PlanView): void;
    prev(): void;
    next(): void;
    today(): void;
    /** True when the shown range already contains today (「今天」 has nothing to do). */
    todayDisabled: boolean;
    /** The title beside ‹ ›: 「11-11 周三」 / 「C1 W1 · 11-06 – 11-12」 / 「2026 年 11 月」. */
    label: string;
    /** Jump to a day cell: switches to the day view anchored on `date`. */
    openDay(date: string): void;
    /** Show the week containing `date`. */
    showWeek(date: string): void;
    /** Read the shown range again (after an undo). */
    reload(): void;
    data: AsyncState<PlanbookResult>;
  };
}

export function useControlPlan(input: ControlPlanInput): ControlPlan {
  const card = useControlCard(input);
  // The 总控 panel's right block pages weeks / months; the day is the left block.
  const [view, setView] = useState<PlanView>("week");
  const [anchor, setAnchor] = useState(todayKey);
  const resource = usePlanbook(view, anchor, input.isControl, input.verifiedOn);
  // A 总控 answer may have moved lessons: the grid reloads like the other boards.
  useReloadOnAnswer(input.streaming, resource.reload);
  const week: PlanWeek | null =
    resource.state.status === "ready" && resource.state.value.view === "week"
      ? resource.state.value.week
      : null;
  const older =
    input.isControl && input.fold.older !== null
      ? {
          label: strings.control.card.older(input.fold.older.count, input.fold.older.since, input.fold.open),
          onToggle: input.fold.toggle,
        }
      : null;
  const today = todayKey();
  return {
    card: input.isControl && card !== null ? { ...card, older } : null,
    older,
    plan: {
      view,
      anchor,
      setView,
      prev: () => setAnchor(shiftAnchor(view, anchor, -1)),
      next: () => setAnchor(shiftAnchor(view, anchor, 1)),
      today: () => setAnchor(today),
      todayDisabled: isTodayInView(view, anchor, today, week),
      label: rangeLabel(view, anchor, week),
      openDay: (date: string) => {
        setView("day");
        setAnchor(date);
      },
      showWeek: (date: string) => {
        setView("week");
        setAnchor(date);
      },
      reload: resource.reload,
      data: resource.state,
    },
  };
}
