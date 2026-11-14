/**
 * The planbook's per-date grid items: the cycle's lessons, the calendar's 讲后读
 * rows, the shelf's self-reading blocks and a 整合日's 周核实.
 *
 * Pure helpers of `planbook.ts` — every input is an argument and `today` comes
 * from `PlanbookInput`; `planbook.ts` re-exports the names callers import.
 */

import { strings } from "../strings.js";
import { mergeOverdue } from "./cycle-today.js";
import { slotOf } from "./planbook-range.js";
import type { PlanItem, PlanLane, PlanMark, PlanbookInput, PlanWeek } from "./planbook.js";

const AFTER_READ_MARK = "#讲后读-";

/**
 * done → `done`; else by date: past `warn`, future `plan`, today `now` for a
 * main lesson and `plan` for every reading lane.
 *
 * The design marks only today's main lesson ●: 讲后读 / 带读 / 自读 stay ○ even on
 * the current day (`plan2.jsx` `WEEK`, 11-11), so the today column is not bolded
 * from top to bottom.
 */
export function markOf(date: string, today: string, done: boolean, lane: PlanLane): PlanMark {
  if (done) return "done";
  if (date < today) return "warn";
  if (date !== today) return "plan";
  return lane === "main" ? "now" : "plan";
}

/** Main and guide items of one date, from `lessons[date]` across the months. */
export function lessonItems(input: PlanbookInput, date: string): PlanItem[] {
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
export function afterReadItems(input: PlanbookInput, date: string): PlanItem[] {
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
      const name =
        input.cycleMonths.map((month) => month.names[slug]).find((value) => value !== undefined) ?? slug;
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
export function selfItemsByDate(input: PlanbookInput): Map<string, PlanItem[]> {
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

/**
 * A 整合日's 周核实, one main-lane item per main course (panel v2: the day's 主课
 * cells read 「● 离散 周核实」). Done once the course's week task says so; a
 * past 整合日 not known to be done stays plain ○ — it is not a missed lesson.
 */
export function verifyItems(input: PlanbookInput, date: string): PlanItem[] {
  if (slotOf(input.cycleMonths, date)?.type !== "整合") return [];
  const goals = weekGoals(input);
  return [...mainCourseSlugs(input)].map((slug) => {
    const name =
      input.cycleMonths.map((month) => month.names[slug]).find((value) => value !== undefined) ?? slug;
    // Started that day counts as done, the same rule as today's card.
    const started = input.verifiedOn?.[slug] === date;
    const done = started || (date <= input.today && goals.some((goal) => goal.course === slug && goal.done));
    return {
      lane: "main",
      text: strings.control.card.verifyRow(name),
      short: `${name} ${strings.actions.verify}`,
      mark: done ? "done" : date === input.today ? "now" : "plan",
      slug,
      id: null,
    };
  });
}

/** The slugs of the current cycle's main courses (overview first, roles as fallback). */
export function mainCourseSlugs(input: PlanbookInput): Set<string> {
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
export function weekGoals(input: PlanbookInput): PlanWeek["goals"] {
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

/** Earlier unfinished new lessons, merged per course, earliest-missed first. */
export function missedLessons(input: PlanbookInput): PlanWeek["overdue"] {
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
