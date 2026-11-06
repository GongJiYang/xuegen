/**
 * 总进度 top and 日历 cell labels (design `?d=plan`).
 *
 * `cycle.mjs overview` gives the two-year route, the current cycle and its
 * courses' lesson counts; `cycle.mjs month` gives each day's lessons. These
 * pure functions turn them into the lines the panels show. Today is an
 * argument; no clock.
 */

import type { CourseRole, CycleMonth, CycleOverview } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** 「11-06 周五」. */
export function shortDay(date: string): string {
  return `${date.slice(5)} 周${WEEKDAYS[new Date(dayNumber(date) * 86_400_000).getUTCDay()] ?? ""}`;
}

export type SegmentState = "done" | "now" | "plan";

/** One week cell of a cycle segment: passed, this week, still ahead in this cycle, or a later cycle. */
export type WeekState = "done" | "now" | "left" | "plan";

export interface RouteView {
  /** 「2028 年 7 月 20 日」. */
  end: string;
  /** 「2026-11-06 开始 · 还有 89 周 · 另留约 12 周缓冲」. */
  sub: string;
  /** One per cycle, labelled 「C1」; `weeks` has 7 cells; `restAfter` when a recovery week follows it. */
  segments: { id: string; label: string; state: SegmentState; restAfter: boolean; weeks: WeekState[] }[];
  /** The expanded list: 「C1  离散数学 + 编程语言与编程范式  26.11.06 – 12.24」. */
  cycles: { id: string; subjects: string; range: string; now: boolean }[];
}

export interface CycleView {
  /** 「C1」. */
  id: string;
  /** The title without 「C1 · 」, or the id when there is no title. */
  name: string;
  /** 「11-06 → 12-24（周四）· 还剩 48 天」. */
  range: string;
  /** 「C1 · 离散数学 + 编程语言与编程范式」. */
  title: string;
  /** 「第 1 / 7 周」. */
  week: string;
  /** 「11-06 周五」. */
  start: string;
  /** 「12-24 周四 结束」. */
  end: string;
  /** Share of the cycle's days reached by today, 0–100 (today counts). */
  percent: number;
  /** 「还剩 48 天 · 下个周期 C2 从 12-25 开始」. */
  sub: string;
  /** 「原定 数据结构与算法、C 与系统编程」 from the route row, or null. */
  aux: string | null;
}

export interface CourseCard {
  slug: string;
  role: CourseRole;
  subject: string;
  name: string;
  done: number;
  total: number;
  percent: number;
  /** ✓ all done, ! the next lesson is in the past, else ●. */
  mark: "now" | "warn" | "done";
  /** 「结课 12-23」, or null without a schedule. */
  end: string | null;
  /** `when` is 「今天」 / 「11-10 周二」 / 「11-03 没学」; `text` is 「D1 Ch1 …」. */
  next: { when: string; text: string } | null;
  /** Every lesson: id, 「11-06」, content, done. */
  lessons: { id: string; date: string; content: string; done: boolean }[];
}

function isNow(start: string, end: string, today: string): boolean {
  return start <= today && today <= end;
}

function weekStates(state: SegmentState, start: string, today: string): WeekState[] {
  if (state === "done") return Array.from({ length: 7 }, () => "done");
  if (state === "plan") return Array.from({ length: 7 }, () => "plan");
  const current = Math.min(7, Math.floor(daysBetween(start, today) / 7) + 1);
  return Array.from({ length: 7 }, (_, index) => (index + 1 < current ? "done" : index + 1 === current ? "now" : "left"));
}

export function routeView(overview: CycleOverview, today: string): RouteView | null {
  const route = overview.route;
  if (!route) return null;
  const [year, month, day] = route.end.split("-").map(Number);
  return {
    end: strings.plan.routeEnd(year ?? 0, month ?? 0, day ?? 0),
    sub: strings.plan.routeSub(route.start, route.weeksLeft, route.bufferWeeks),
    segments: route.cycles.map((cycle) => {
      const state: SegmentState =
        cycle.status === "完成" || cycle.end < today ? "done" : isNow(cycle.start, cycle.end, today) ? "now" : "plan";
      return {
        id: cycle.id,
        label: cycle.id,
        state,
        restAfter: route.recovery.some((rest) => daysBetween(cycle.end, rest.start) === 1),
        weeks: weekStates(state, cycle.start, today),
      };
    }),
    cycles: route.cycles.map((cycle) => ({
      id: cycle.id,
      subjects: cycle.main.join(" + "),
      range: `${cycle.start.slice(2).split("-").join(".")} – ${cycle.end.slice(5).split("-").join(".")}`,
      now: isNow(cycle.start, cycle.end, today),
    })),
  };
}

export function cycleView(overview: CycleOverview, today: string): CycleView | null {
  const cycle = overview.cycle;
  if (!cycle) return null;
  const span = daysBetween(cycle.start, cycle.end) + 1;
  const reached = Math.round(((daysBetween(cycle.start, today) + 1) / span) * 100);
  const row = overview.route?.cycles.find((item) => item.id === cycle.cycle);
  return {
    id: cycle.cycle,
    name: cycle.title || cycle.cycle,
    range: strings.plan.cycleRange(cycle.start.slice(5), cycle.end.slice(5), shortDay(cycle.end).split(" ")[1] ?? "", cycle.daysLeft),
    title: cycle.title ? `${cycle.cycle} · ${cycle.title}` : cycle.cycle,
    week: strings.plan.week(cycle.week, cycle.weeks),
    start: shortDay(cycle.start),
    end: strings.plan.cycleEnd(shortDay(cycle.end)),
    percent: Math.min(100, Math.max(0, reached)),
    sub: strings.plan.cycleSub(cycle.daysLeft, cycle.next),
    aux: row && row.aux.length > 0 ? strings.plan.auxPlanned(row.aux.join("、")) : null,
  };
}

export function courseCards(overview: CycleOverview, today: string): CourseCard[] {
  return overview.courses.map((course) => {
    const next = course.next;
    const mark: CourseCard["mark"] =
      course.total > 0 && course.done === course.total ? "done" : next && next.date < today ? "warn" : "now";
    const when = !next
      ? ""
      : next.date === today
        ? strings.plan.today
        : next.date < today
          ? strings.plan.overdue(next.date.slice(5))
          : shortDay(next.date);
    return {
      slug: course.slug,
      role: course.role,
      subject: course.subject,
      name: course.name,
      done: course.done,
      total: course.total,
      percent: course.total > 0 ? Math.round((course.done / course.total) * 100) : 0,
      mark,
      end: course.end ? strings.plan.courseEnd(course.end.slice(5)) : null,
      next: next ? { when, text: `${next.id} ${next.content}` } : null,
      lessons: course.lessons.map((lesson) => ({ ...lesson, date: lesson.date.slice(5) })),
    };
  });
}

/** What a calendar cell says: the lesson's short course name, else 恢复 / 整合 / Anki / the 深度 day's subject short name, else "". */
export function cellTag(month: CycleMonth | null, date: string): string {
  if (!month) return "";
  const lesson = (month.lessons[date] ?? []).find((item) => month.roles[item.course] !== "aux");
  if (lesson) return month.names[lesson.course] ?? lesson.course;
  if (month.recovery.includes(date)) return strings.plan.tagRecovery;
  const slot = month.days[date];
  if (!slot) return "";
  if (slot.type === "深度") return slot.subject ? (month.subjects[slot.subject] ?? slot.subject) : "";
  return strings.plan.tag[slot.type];
}

/** The cell's second line: the aux lesson's short course name, else the day's aux subject short name, else "". */
export function cellAuxTag(month: CycleMonth | null, date: string): string {
  if (!month) return "";
  const lesson = (month.lessons[date] ?? []).find((item) => month.roles[item.course] === "aux");
  if (lesson) return month.names[lesson.course] ?? lesson.course;
  const slot = month.days[date];
  return slot?.aux ? (month.subjects[slot.aux] ?? slot.aux) : "";
}

/** 「C1 起」 on a cycle's first day, 「C1 完」 on its last, else null. */
export function cellFlag(month: CycleMonth | null, date: string): string | null {
  const cycle = month?.cycles.find((item) => item.start === date || item.end === date);
  if (!cycle) return null;
  return cycle.end === date ? strings.plan.flagEnd(cycle.cycle) : strings.plan.flagStart(cycle.cycle);
}

/** The line under the selected date: 「C1 第 1 周 · 整合日」 (+「 · C1 最后一天」), 「恢复周 · 不排新课」, or null. */
export function daySlotLine(month: CycleMonth | null, date: string): string | null {
  if (!month) return null;
  const slot = month.days[date];
  if (slot) {
    const last = month.cycles.some((item) => item.cycle === slot.cycle && item.end === date);
    return strings.plan.slotLine(slot.cycle, slot.week, slot.type, last);
  }
  return month.recovery.includes(date) ? strings.plan.recoveryLine : null;
}

/** The selected day's lessons with short course names. */
export function dayLessons(month: CycleMonth | null, date: string): { name: string; id: string; content: string; aux: boolean }[] {
  if (!month) return [];
  return (month.lessons[date] ?? []).map((lesson) => ({
    name: month.names[lesson.course] ?? lesson.course,
    id: lesson.id,
    content: lesson.content,
    aux: month.roles[lesson.course] === "aux",
  }));
}

/** The short names for the legend, in first-seen order. */
export function legendNames(month: CycleMonth | null): string[] {
  return month ? [...new Set(Object.values(month.names))] : [];
}

export interface AuxRow {
  subject: string;
  /** The subject's short name from the weekly template. */
  subjectName: string;
  /** Its course this cycle, or null when none is scheduled yet. */
  course: { slug: string; name: string; done: number; total: number } | null;
}

/** One row per auxiliary subject of the current cycle, with its course if any. */
export function auxRows(overview: CycleOverview): AuxRow[] {
  const cycle = overview.cycle;
  if (!cycle) return [];
  return cycle.auxSubjects.map((subject) => {
    const course = overview.courses.find((item) => item.role === "aux" && item.subject === subject) ?? null;
    return {
      subject,
      subjectName: cycle.subjects[subject] ?? subject,
      course: course ? { slug: course.slug, name: course.name, done: course.done, total: course.total } : null,
    };
  });
}

/** Whether the month has any auxiliary day (the legend then explains the second line). */
export function hasAux(month: CycleMonth | null): boolean {
  return month ? Object.values(month.days).some((slot) => slot.aux !== null) : false;
}

/** 「周一 · 周三」 for a subject of the current cycle, or "". */
export function subjectDaysLine(overview: CycleOverview, subject: string): string {
  return strings.plan.days(overview.cycle?.subjectDays[subject] ?? []);
}
