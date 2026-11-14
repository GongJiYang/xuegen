/**
 * The planbook's calendar arithmetic: day shifting, weekday names, the
 * Monday-first index and the cycle-week range. Split out of `planbook.ts` so the
 * view model stays within the file-size budget; all of it is pure and takes the
 * data it needs as arguments.
 */

import type { CycleMonth, CycleSlot } from "@shared/data-protocol.js";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const;

function dayNumber(date: string): number {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** `YYYY-MM-DD` shifted by whole days (shared with `planbook-nav.ts`). */
export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** 「周五」 for a `YYYY-MM-DD`. */
export function weekdayOf(date: string): string {
  const day = new Date(dayNumber(date) * DAY_MS).getUTCDay();
  return `周${WEEKDAYS[day] ?? ""}`;
}

/** 0 = Monday … 6 = Sunday, for the out-of-cycle Monday–Sunday fallback. */
export function mondayIndex(date: string): number {
  return (new Date(dayNumber(date) * DAY_MS).getUTCDay() + 6) % 7;
}

/** The cycle slot covering `date`, from whichever month holds it. */
export function slotOf(months: CycleMonth[], date: string): CycleSlot | null {
  for (const month of months) {
    const slot = month.days[date];
    if (slot !== undefined) return slot;
  }
  return null;
}

export interface PlanWeekRange {
  start: string;
  end: string;
  cycle: string | null;
  week: number | null;
}

/**
 * The seven days of `anchor`'s week: its cycle week when `anchor` sits inside a
 * cycle (weeks run from the cycle start's weekday — C1 is Friday–Thursday),
 * else the plain Monday–Sunday containing it.
 */
export function planWeekRange(cycleMonths: CycleMonth[], anchor: string): PlanWeekRange {
  const slot = slotOf(cycleMonths, anchor);
  if (slot !== null) {
    const cycle = cycleMonths.flatMap((month) => month.cycles).find((bounds) => bounds.cycle === slot.cycle);
    if (cycle !== undefined) {
      const start = addDays(cycle.start, (slot.week - 1) * 7);
      return { start, end: addDays(start, 6), cycle: slot.cycle, week: slot.week };
    }
  }
  const start = addDays(anchor, -mondayIndex(anchor));
  return { start, end: addDays(start, 6), cycle: null, week: null };
}
