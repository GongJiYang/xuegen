/**
 * Fold `useControlPlan`'s `plan` (view + paging + the loaded result) into the
 * props the `Planbook` slot takes.
 *
 * Pure: `today` is an argument and `PlanbookResult` arrives inside
 * `plan.data`. `showCard` is the day view's 「看的是今天」 question — the 今日卡
 * only renders on today's day view, other days get the read-only list.
 */

import type { PlanbookProps } from "../../skins/contract.js";
import type { ControlPlan } from "./use-control-plan.js";
import type { PlanDay, PlanWeek } from "./planbook.js";

export type PlanbookAssembly = Omit<PlanbookProps, "todayCard" | "onOpenAnki"> & { showCard: boolean };
export function planbookProps(
  plan: ControlPlan["plan"],
  card: ControlPlan["card"],
  tomorrow: string | null,
  today: string,
): PlanbookAssembly {
  const data = plan.data;
  let state: PlanbookProps["state"] = "loading";
  let error: string | null = null;
  let week: PlanWeek | null = null;
  let day: PlanDay | null = null;
  let month: PlanDay[] | null = null;
  if (data.status === "error") {
    state = "error";
    error = data.message;
  } else if (data.status === "ready" && data.value.view === plan.view) {
    state = "ready";
    // The loader answers with the view it was asked for, but the result may
    // still be the previous view's while a switch loads — only hand the slot
    // the model matching `plan.view`; a mismatched answer keeps `loading`.
    if (data.value.view === "week") week = data.value.week;
    else if (data.value.view === "day") day = data.value.day;
    else month = data.value.days;
  }
  return {
    view: plan.view,
    onView: plan.setView,
    label: plan.label,
    onPrev: plan.prev,
    onNext: plan.next,
    onToday: plan.today,
    todayDisabled: plan.todayDisabled,
    onPrint: () => window.print(),
    state,
    error,
    week,
    day,
    month,
    tomorrow,
    onOpenDay: plan.openDay,
    showCard: plan.view === "day" && plan.anchor === today && card !== null,
  };
}
