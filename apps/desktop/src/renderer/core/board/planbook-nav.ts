/**
 * The planbook's paging and range title (design `?d=plan2`: ‹ 今天 › beside a
 * 「11-11 周三」 / 「C1 W1 · 11-06 – 11-12」 / 「2026 年 11 月」 title).
 *
 * All pure: `anchor` is the day the shown range is anchored on — the day a day
 * view shows, any day inside the wanted week, or any day of the wanted month —
 * and `week` is the loaded `PlanWeek` when the week view has one, else null.
 * No clock: 「今天」 arrives as an argument.
 */

import { strings } from "../strings.js";
import { addDays, mondayIndex, weekdayOf, type PlanWeek } from "./planbook.js";

export type PlanView = "day" | "week" | "month";

/**
 * Move `anchor` one page back (`-1`) or forward (`1`): a day for the day view,
 * a whole week for the week view, or to the previous/next month's 1st for the
 * month view (an anchored month always lands on its first day).
 */
export function shiftAnchor(view: PlanView, anchor: string, dir: -1 | 1): string {
  if (view === "day") return addDays(anchor, dir);
  if (view === "week") return addDays(anchor, dir * 7);
  const [year = 1970, month = 1] = anchor.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + dir, 1)).toISOString().slice(0, 10);
}

/** The week's [start, end]: the loaded week's own, else the plain Monday–Sunday of `anchor`. */
function shownRange(anchor: string, week: PlanWeek | null): { start: string; end: string } {
  if (week !== null) return { start: week.start, end: week.end };
  const start = addDays(anchor, -mondayIndex(anchor));
  return { start, end: addDays(start, 6) };
}

/**
 * The title beside the ‹ › buttons for the shown range: 「11-11 周三」 for a
 * day, 「C1 W1 · 11-06 – 11-12」 for a cycle week (「11-09 – 11-15」 outside
 * every cycle or before the week loads), 「2026 年 11 月」 for a month.
 */
export function rangeLabel(view: PlanView, anchor: string, week: PlanWeek | null): string {
  const planbook = strings.planbook;
  if (view === "day") return planbook.dayLabel(anchor, weekdayOf(anchor));
  if (view === "month") {
    const [year = 0, month = 0] = anchor.split("-").map(Number);
    return planbook.monthLabel(year, month);
  }
  if (week !== null && week.cycle !== null && week.week !== null) {
    return planbook.weekLabel(week.cycle, week.week, week.start, week.end);
  }
  const range = shownRange(anchor, week);
  return planbook.plainWeekLabel(range.start, range.end);
}

/**
 * Whether the shown range already contains `today` — when it does, the 「今天」
 * button is disabled since paging back to today would change nothing.
 */
export function isTodayInView(view: PlanView, anchor: string, today: string, week: PlanWeek | null): boolean {
  if (view === "day") return anchor === today;
  if (view === "month") return anchor.slice(0, 7) === today.slice(0, 7);
  const range = shownRange(anchor, week);
  return range.start <= today && today <= range.end;
}
