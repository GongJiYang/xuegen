/**
 * The planbook (PLANBOOK-1111) view models: aggregate the cycle's lessons, the
 * calendar's due 讲后读 items, the shelf's per-day schedule and Anki's due
 * count into the day / week / month rows the approved design shows.
 *
 * Everything here is pure: `today`, the anchor and every data source are
 * arguments, so marks and week boundaries are fully testable. The reading side
 * effects live in `use-planbook.ts`; calendar arithmetic lives in
 * `planbook-range.ts` (re-exported below so callers keep one import).
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
import { ankiDueCount, mergeOverdue } from "./cycle-today.js";
import { addDays, planWeekRange, slotOf, weekdayOf } from "./planbook-range.js";
import { strings } from "../strings.js";

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
}

const ALL_LANES: PlanLane[] = ["main", "after", "guide", "self"];
const MONTH_LANES: PlanLane[] = ["main", "guide"];
const AFTER_READ_MARK = "#讲后读-";

/**
 * done → `done`; else by date: past `warn`, future `plan`, today `now` for a
 * main lesson and `plan` for every reading lane.
 *
 * The design marks only today's main lesson ●: 讲后读 / 带读 / 自读 stay ○ even on
 * the current day (`plan2.jsx` `WEEK`, 11-11), so the today column is not bolded
 * from top to bottom.
 */
function markOf(date: string, today: string, done: boolean, lane: PlanLane): PlanMark {
  if (done) return "done";
  if (date < today) return "warn";
  if (date !== today) return "plan";
  return lane === "main" ? "now" : "plan";
}

/** Main and guide items of one date, from `lessons[date]` across the months. */
function lessonItems(input: PlanbookInput, date: string): PlanItem[] {
  const items: PlanItem[] = [];
  for (const month of input.cycleMonths) {
    for (const lesson of month.lessons[date] ?? []) {
      const lane: PlanLane = month.roles[lesson.course] === "aux" ? "guide" : "main";
      items.push({
        lane,
        text: `${month.names[lesson.course] ?? lesson.course} ${lesson.id} · ${lesson.content}`,
        short: `${month.names[lesson.course] ?? lesson.course} ${lesson.id}`,
        mark: markOf(date, input.today, lesson.done === true, lane),
        slug: lesson.course,
        id: lesson.id,
      });
    }
  }
  return items;
}

/** 讲后读 items of one date (the `readingDue` rows whose slug marks them). */
function afterReadItems(input: PlanbookInput, date: string): PlanItem[] {
  const items: PlanItem[] = [];
  for (const month of input.calendarMonths) {
    for (const due of month.days[date]?.readingDue ?? []) {
      const cut = due.slug.indexOf(AFTER_READ_MARK);
      if (cut === -1) continue;
      // The lane already says 讲后读; drop the title's 「讲后读 · 」/「讲后读 」 lead.
      const text = due.title.startsWith("讲后读 · ")
        ? due.title.slice("讲后读 · ".length)
        : due.title.startsWith("讲后读 ")
          ? due.title.slice("讲后读 ".length)
          : due.title;
      const slug = due.slug.slice(0, cut);
      const name = input.cycleMonths.map((month) => month.names[slug]).find((value) => value !== undefined) ?? slug;
      items.push({
        lane: "after",
        text,
        // 「离散 §2.1–2.2」: the course short name plus the range before the first 「 · 」.
        short: `${name} ${text.split(" · ")[0]}`,
        mark: markOf(date, input.today, false, "after"),
        slug: due.slug.slice(0, cut),
        id: null,
      });
    }
  }
  return items;
}

/** date → self-reading items, indexed once for the whole range. */
function selfItemsByDate(input: PlanbookInput): Map<string, PlanItem[]> {
  const byDate = new Map<string, PlanItem[]>();
  for (const book of input.shelf) {
    for (const row of book.schedule ?? []) {
      const text = `${book.short} ${row.title} pp.${row.from}–${row.to}`;
      const item: PlanItem = {
        lane: "self",
        // A past day whose block was not read keeps the book row but says so: the
        // same block also shows on its carried date (design: `plan2.jsx`).
        text: row.missed === true ? text + strings.planbook.selfMissed : text,
        short: `${book.short} pp.${row.from}–${row.to}`,
        mark: row.missed === true ? "warn" : markOf(row.date, input.today, row.done, "self"),
        slug: book.slug,
        id: null,
      };
      const list = byDate.get(row.date) ?? [];
      list.push(item);
      byDate.set(row.date, list);
    }
  }
  return byDate;
}

/** One day, lanes in the design's row order, filtered down to `lanes`. */
function planDay(
  input: PlanbookInput,
  date: string,
  self: Map<string, PlanItem[]>,
  lanes: PlanLane[],
): PlanDay {
  const lessons = lessonItems(input, date);
  const items = [
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

/** The slugs of the current cycle's main courses (overview first, roles as fallback). */
function mainCourseSlugs(input: PlanbookInput): Set<string> {
  const slugs = new Set<string>();
  if (input.overview !== null) {
    for (const course of input.overview.courses) {
      if (course.role === "main") slugs.add(course.slug);
    }
    return slugs;
  }
  for (const month of input.cycleMonths) {
    for (const [slug, role] of Object.entries(month.roles)) {
      if (role === "main") slugs.add(slug);
    }
  }
  return slugs;
}

/** 周核实 tasks of the main courses — the 「本周目标」 rows, each with its short name. */
function weekGoals(input: PlanbookInput): PlanWeek["goals"] {
  const mains = mainCourseSlugs(input);
  const names = new Map<string, string>();
  for (const month of input.cycleMonths) {
    for (const [slug, name] of Object.entries(month.names)) names.set(slug, name);
  }
  return input.courses.flatMap((course) =>
    course.week.tasks
      .filter((task) => mains.has(course.slug) && task.label.includes("周核实"))
      .map((task) => ({
        course: course.slug,
        // Same short name the week grid uses: 离散 / CTM (falls back to the title).
        name: names.get(course.slug) ?? course.title,
        label: task.label,
        done: task.done,
      })),
  );
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

/** Earlier unfinished new lessons, merged per course, earliest-missed first. */
function missedLessons(input: PlanbookInput): PlanWeek["overdue"] {
  const overdue: { course: string; id: string; date: string }[] = [];
  const names = new Map<string, string>();
  for (const month of input.cycleMonths) {
    for (const [slug, name] of Object.entries(month.names)) names.set(slug, name);
    for (const date of Object.keys(month.lessons)) {
      if (date >= input.today) continue;
      for (const lesson of month.lessons[date] ?? []) {
        if (lesson.done === true) continue;
        overdue.push({ course: lesson.course, id: lesson.id, date });
      }
    }
  }
  // The week model drops `first`: the merged row's label keeps the count only.
  return mergeOverdue(overdue, Object.fromEntries(names)).map(({ course, name, count }) => ({
    course,
    name,
    count,
  }));
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
