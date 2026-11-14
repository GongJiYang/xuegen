/**
 * The planbook (PLANBOOK-1111) view models: aggregate the cycle's lessons, the
 * calendar's due 讲后读 items, the shelf's per-day schedule and Anki's due
 * count into the day / week / month rows the approved design shows.
 *
 * Everything here is pure: `today`, the anchor and every data source are
 * arguments, so marks and week boundaries are fully testable. The reading side
 * effects live in `use-planbook.ts`; calendar arithmetic lives in
 * `planbook-range.ts` and the per-date grid items in `planbook-items.ts` (the
 * former is re-exported below so callers keep one import).
 */

import type {
  AnkiStatus,
  CalendarMonth,
  CourseSummary,
  CycleDayType,
  CycleMonth,
  CycleOverview,
  ShelfListItem,
} from "@shared/data-protocol.js";
import { ankiDueCount } from "./cycle-today.js";
import {
  afterReadItems,
  lessonItems,
  missedLessons,
  selfItemsByDate,
  verifyItems,
  weekGoals,
} from "./planbook-items.js";
import { addDays, planWeekRange, slotOf, weekdayOf } from "./planbook-range.js";

export { addDays, mondayIndex, planWeekRange, weekdayOf, type PlanWeekRange } from "./planbook-range.js";

/** The four rows of a planbook day: main lessons, 讲后读, 带读 (aux), self-reading. */
export type PlanLane = "main" | "after" | "guide" | "self";
/** ✓ done / ● today / ○ planned / ! missed. */
export type PlanMark = "done" | "now" | "plan" | "warn";

export interface PlanItem {
  lane: PlanLane;
  text: string;
  /**
   * The grid one-liner: 「离散 D3」 / 「C 语言 D1」 (course short name plus lesson
   * id), 「离散 §2.1–2.2」 for 讲后读, 「Epp pp.1–9」 for 自读. The week grid shows
   * it (PANEL-PLAN 宽屏 1920: short cells); the month view still lists lessons only.
   */
  short: string;
  mark: PlanMark;
  slug: string | null;
  id: string | null;
  /** A 讲后读 not read on its day, shown on today instead: the earliest original date. */
  from?: string;
}

export interface PlanDay {
  date: string;
  /** 「周一」…「周日」, same as `CycleDay.weekday`. */
  weekday: string;
  /** The cycle day type, or null outside every cycle. */
  type: CycleDayType | null;
  isToday: boolean;
  items: PlanItem[];
  /** Anki cards due — only on today, else null (never a historical count). */
  ankiDue: number | null;
}

export interface PlanWeek {
  cycle: string | null;
  week: number | null;
  start: string;
  end: string;
  days: PlanDay[];
  /** 周核实 tasks of the main courses. */
  goals: { course: string; name: string; label: string; done: boolean }[];
  /** Earlier new lessons not yet done, merged per course. */
  overdue: { course: string; name: string; count: number }[];
  /**
   * The 整合日 the week's 复盘 is written on: the first one within the seven days
   * after `end` (C1 W1 → 11-13), or null when that week has none.
   */
  reviewDate: string | null;
}

/** Everything the builders need; `today` and `anchor` are explicit inputs. */
export interface PlanbookInput {
  today: string;
  /** The day the shown week is anchored on; defaults to `today`. */
  anchor?: string;
  /** `cycle.month` data covering the shown range (may span two months). */
  cycleMonths: CycleMonth[];
  /** `calendar.month` data covering the same range (holds `readingDue`). */
  calendarMonths: CalendarMonth[];
  /** `shelf.list` rows requested with `from`/`to` — `schedule` carries the days. */
  shelf: ShelfListItem[];
  overview: CycleOverview | null;
  courses: CourseSummary[];
  anki: AnkiStatus | null;
  /** The day each course's weekly verify was last started (`settings.verifiedOn`). */
  verifiedOn?: Record<string, string>;
}

const ALL_LANES: PlanLane[] = ["main", "after", "guide", "self"];
const MONTH_LANES: PlanLane[] = ["main", "guide"];

/** One day, lanes in the design's row order, filtered down to `lanes`. */
function planDay(
  input: PlanbookInput,
  date: string,
  self: Map<string, PlanItem[]>,
  lanes: PlanLane[],
): PlanDay {
  const lessons = lessonItems(input, date);
  const items = [
    ...(lanes === ALL_LANES ? verifyItems(input, date) : []),
    ...lessons.filter((item) => item.lane === "main"),
    ...afterReadItems(input, date),
    ...lessons.filter((item) => item.lane === "guide"),
    ...(self.get(date) ?? []),
  ].filter((item) => lanes.includes(item.lane));
  return {
    date,
    weekday: weekdayOf(date),
    type: slotOf(input.cycleMonths, date)?.type ?? null,
    isToday: date === input.today,
    items,
    // Anki is a count for today only — never a 「没刷」 mark, never a guess at
    // past days (decided 2026-11-11).
    ankiDue: date === input.today && input.anki !== null ? ankiDueCount(input.anki) : null,
  };
}

/**
 * The 整合日 the week's 复盘 belongs to: the first one in the seven days after
 * `end` (C1 W1 ends 11-12, so 复盘 is 11-13). Null when there is none — the week
 * outside every cycle, or a cycle without a 整合日 that week.
 */
function reviewDayOf(input: PlanbookInput, end: string): string | null {
  for (let i = 1; i <= 7; i += 1) {
    const date = addDays(end, i);
    if (slotOf(input.cycleMonths, date)?.type === "整合") return date;
  }
  return null;
}

/** The seven days of `input.anchor`'s (default: today's) week, plus goals and missed lessons. */
export function buildWeek(input: PlanbookInput): PlanWeek {
  const range = planWeekRange(input.cycleMonths, input.anchor ?? input.today);
  const self = selfItemsByDate(input);
  const days: PlanDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    days.push(planDay(input, addDays(range.start, i), self, ALL_LANES));
  }
  return {
    ...range,
    days,
    goals: weekGoals(input),
    overdue: missedLessons(input),
    reviewDate: reviewDayOf(input, range.end),
  };
}

/** One `PlanDay` for `date` — same per-day logic as `buildWeek`. */
export function buildDay(input: PlanbookInput, date: string): PlanDay {
  return planDay(input, date, selfItemsByDate(input), ALL_LANES);
}

/** Every day of `month` (`YYYY-MM`); the month view keeps only main / guide rows. */
export function buildMonth(input: PlanbookInput, month: string): PlanDay[] {
  const [year = 1970, monthNumber = 1] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days: PlanDay[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    days.push(planDay(input, date, new Map(), MONTH_LANES));
  }
  return days;
}
