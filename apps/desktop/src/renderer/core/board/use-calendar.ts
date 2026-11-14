/**
 * Calendar view model and grid math.
 *
 * `useCalendar(month)` loads one month of aggregated content. The grid layout
 * (which weekday a month starts on, how many days, which cells belong to the
 * previous/next month) is pure and shared by every skin, so the pixel calendar
 * and the bare list agree on what each cell means.
 *
 * The week starts on Monday, matching the design's 一…日 header row.
 */

import { useMemo, useState } from "react";
import type { CalendarDay, CalendarMonth } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { todayKey } from "../today.js";
import { useBoardResource, type BoardResource, type LoadResult } from "./use-resource.js";

/** The empty day, used when a month has no entry for a date. */
export const EMPTY_DAY: CalendarDay = { records: [], plans: [], readingDue: [], log: [], note: null };

/** One cell of a rendered month grid. */
export interface CalendarCell {
  /** The full `YYYY-MM-DD` date the cell stands for. */
  date: string;
  /** The day-of-month number shown in the cell. */
  day: number;
  /** True for a cell outside the displayed month (a leading/trailing pad). */
  out: boolean;
}

/** The empty month, so a panel renders a grid before the data arrives. */
export function emptyMonth(month: string): CalendarMonth {
  return { month, days: {} };
}

/** `YYYY-MM` for a `Date`. */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` for a `Date`. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Move a `YYYY-MM` string by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year ?? 2000, (monthNumber ?? 1) - 1 + delta, 1);
  return monthKey(date);
}

/**
 * Lay out a month as a 7-wide grid starting on Monday.
 *
 * Leading cells pad to the first Monday, then every day of the month, then
 * trailing cells to complete the last week. A trailing/leading cell carries the
 * neighbouring month's real date so clicking it is meaningful.
 */
export function monthGrid(month: string): CalendarCell[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year ?? 2000, (monthNumber ?? 1) - 1, 1);
  const daysInMonth = new Date(year ?? 2000, monthNumber ?? 1, 0).getDate();
  // getDay(): 0=Sunday; shift so Monday is 0.
  const leading = (first.getDay() + 6) % 7;
  const cells: CalendarCell[] = [];
  for (let index = leading; index > 0; index -= 1) {
    const date = new Date(year ?? 2000, (monthNumber ?? 1) - 1, 1 - index);
    cells.push({ date: dateKey(date), day: date.getDate(), out: true });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: dateKey(new Date(year ?? 2000, (monthNumber ?? 1) - 1, day)), day, out: false });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const next = new Date(`${last?.date ?? `${month}-01`}T00:00:00`);
    next.setDate(next.getDate() + 1);
    cells.push({ date: dateKey(next), day: next.getDate(), out: true });
  }
  return cells;
}

/** The day's entry from a month, or the empty day. */
export function dayOf(month: CalendarMonth, date: string): CalendarDay {
  return month.days[date] ?? EMPTY_DAY;
}

/**
 * The `●`, `◆`, `▲` marks a day shows, in the design's order.
 *
 * The `✎` note mark is *not* included: the grid draws it at the cell's top-right
 * corner on its own, and including it here would show it a second time in the
 * bottom marks row.
 */
export function dayMarks(day: CalendarDay): string {
  let marks = "";
  if (day.records.length > 0) marks += "●";
  if (day.plans.length > 0) marks += "◆";
  if (day.readingDue.length > 0) marks += "▲";
  return marks;
}

export interface CalendarResource {
  month: string;
  setMonth(month: string): void;
  resource: BoardResource<CalendarMonth>;
  /** The currently selected day (`YYYY-MM-DD`). */
  selected: string;
  select(date: string): void;
  /** Write a day's note; refreshes the month on success. */
  writeNote(date: string, text: string): Promise<LoadResult<unknown>>;
}

/**
 * @param initialMonth The `YYYY-MM` to open on (typically the current month).
 */
export function useCalendar(initialMonth: string): CalendarResource {
  const [month, setMonth] = useState(initialMonth);
  const [storedSelected, setStoredSelected] = useState(todayKey);
  const resource = useBoardResource(() => client.data({ kind: "calendar.month", month }), [month]);

  // Keep the selection inside the displayed month: when the month changes and the
  // stored day is no longer shown, fall back to the first of the new month. This
  // is derived at read time rather than synced in an effect, so it never cascades.
  const selected = storedSelected.startsWith(month) ? storedSelected : `${month}-01`;

  const writeNote = useMemo(
    () => (date: string, text: string) =>
      resource.mutate(() => client.data({ kind: "calendar.write", date, text })),
    [resource],
  );

  return { month, setMonth, resource, selected, select: setStoredSelected, writeNote };
}
