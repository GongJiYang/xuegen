/**
 * The planbook's data hook — not wired to any UI yet (interface batch).
 *
 * Loads exactly what each view needs through the data channel, assembles a
 * {@link PlanbookInput}, and hands it to the pure builders in `planbook.ts`:
 * - `month` needs only `cycle.month` (self-reading and 讲后读 stay out).
 * - `day` adds `calendar.month`, a one-day `shelf.list` range and `anki.status`.
 * - `week` adds the whole week's range — one or two months each of `cycle` and
 *   `calendar` — plus `cycle.overview` and `courses.list` for goals / missed
 *   lessons.
 */

import type { CalendarMonth, CycleMonth } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { todayKey } from "../today.js";
import {
  addDays,
  buildDay,
  buildMonth,
  buildWeek,
  planWeekRange,
  type PlanDay,
  type PlanWeek,
  type PlanbookInput,
} from "./planbook.js";
import { useBoardResource, type BoardResource, type LoadResult } from "./use-resource.js";

export type PlanbookView = "day" | "week" | "month";

/** The resolved view model; `view` tells which builder produced it. */
export type PlanbookResult =
  | { view: "day"; day: PlanDay }
  | { view: "week"; week: PlanWeek }
  | { view: "month"; month: string; days: PlanDay[] };

/** Load every source a day/week view needs and fold failures into one result. */
async function loadRange(
  view: "day" | "week",
  anchor: string,
  today: string,
  first: CycleMonth,
): Promise<LoadResult<PlanbookResult>> {
  const range =
    view === "day" ? { start: anchor, end: anchor } : planWeekRange([first], anchor);
  const months = [...new Set([range.start.slice(0, 7), range.end.slice(0, 7)])];
  // The week's 复盘 lookup looks up to seven days past `end`, which leaves the
  // fetched months only when the week ends on a month's last day. That month is
  // worth one extra read (a cycle page may not exist for it — a miss is fine).
  const tailMonth = view === "week" ? addDays(range.end, 7).slice(0, 7) : null;
  const extraMonth = tailMonth !== null && !months.includes(tailMonth) ? tailMonth : null;

  const [restCycles, calendars, shelf, anki, overview, courses, tailCycle] = await Promise.all([
    Promise.all(
      months
        .filter((month) => month !== anchor.slice(0, 7))
        .map((month) => client.data({ kind: "cycle.month", month })),
    ),
    Promise.all(months.map((month) => client.data({ kind: "calendar.month", month }))),
    client.data({ kind: "shelf.list", from: range.start, to: range.end }),
    client.data({ kind: "anki.status" }),
    view === "week" ? client.data({ kind: "cycle.overview", date: today }) : Promise.resolve(null),
    view === "week" ? client.data({ kind: "courses.list" }) : Promise.resolve(null),
    extraMonth === null ? Promise.resolve(null) : client.data({ kind: "cycle.month", month: extraMonth }),
  ]);

  const cycleMonths: CycleMonth[] = [first];
  for (const result of restCycles) {
    if (!result.ok) return result;
    cycleMonths.push(result.data);
  }
  // A missing 复盘 month only costs the date: keep the week either way.
  if (tailCycle !== null && tailCycle.ok) cycleMonths.push(tailCycle.data);
  const calendarMonths: CalendarMonth[] = [];
  for (const result of calendars) {
    if (!result.ok) return result;
    calendarMonths.push(result.data);
  }
  if (!shelf.ok) return shelf;
  if (!anki.ok) return anki;
  if (overview !== null && !overview.ok) return overview;
  if (courses !== null && !courses.ok) return courses;

  const input: PlanbookInput = {
    today,
    anchor,
    cycleMonths,
    calendarMonths,
    shelf: shelf.data,
    overview: overview?.data ?? null,
    courses: courses?.data ?? [],
    anki: anki.data,
  };
  return {
    ok: true,
    data:
      view === "day"
        ? { view: "day", day: buildDay(input, anchor) }
        : { view: "week", week: buildWeek(input) },
  };
}

async function loadPlanbook(view: PlanbookView, anchor: string, today: string): Promise<LoadResult<PlanbookResult>> {
  const month = anchor.slice(0, 7);
  const first = await client.data({ kind: "cycle.month", month });
  if (!first.ok) return first;
  if (view === "month") {
    const input: PlanbookInput = {
      today,
      anchor,
      cycleMonths: [first.data],
      calendarMonths: [],
      shelf: [],
      overview: null,
      courses: [],
      anki: null,
    };
    return { ok: true, data: { view: "month", month, days: buildMonth(input, month) } };
  }
  return loadRange(view, anchor, today, first.data);
}

/**
 * A load that never finishes: a disabled planbook makes no request and just
 * stays `loading` until it is enabled (the 总控 planbook area is not shown on
 * other sessions, so nothing reads that state).
 */
const DISABLED = new Promise<LoadResult<PlanbookResult>>(() => {});

/**
 * The planbook view model for `view` anchored on `anchor` (`YYYY-MM-DD`).
 * `anchor` is the day a day view shows, any day inside the wanted week, or any
 * day of the wanted month. Reloads when `view`/`anchor` change. `enabled`
 * false makes no request at all — the state simply stays `loading`.
 */
export function usePlanbook(view: PlanbookView, anchor: string, enabled = true): BoardResource<PlanbookResult> {
  return useBoardResource(() => (enabled ? loadPlanbook(view, anchor, todayKey()) : DISABLED), [view, anchor, enabled]);
}
