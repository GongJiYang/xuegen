/**
 * The planbook's per-date grid items: the cycle's lessons, the calendar's 讲后读
 * rows, the shelf's self-reading and 导读 blocks, and a 整合日's 周核实.
 *
 * Pure helpers of `planbook.ts` — every input is an argument and `today` comes
 * from `PlanbookInput`; `planbook.ts` re-exports the names callers import.
 */

import type { CourseSummary } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import { afterReadEntry } from "./control-card-rows.js";
import { mergeOverdue } from "./cycle-today.js";
import { slotOf } from "./planbook-range.js";
import type { PlanItem, PlanLane, PlanMark, PlanbookInput, PlanWeek } from "./planbook.js";

/**
 * done → `done`; else by date: past `warn`, future `plan`, today `now` for a
 * main lesson and `plan` for every reading lane.
 *
 * The design marks only today's main lesson ●: 讲后读 / 导读 / 自读 stay ○ even on
 * the current day (`plan2.jsx` `WEEK`, 11-11), so the today column is not bolded
 * from top to bottom.
 */
export function markOf(date: string, today: string, done: boolean, lane: PlanLane): PlanMark {
  if (done) return "done";
  if (date < today) return "warn";
  if (date !== today) return "plan";
  return lane === "main" ? "now" : "plan";
}

/**
 * Main-lane items of one date, from `lessons[date]` across the months. 导读课改
 * 书房导读后 aux 课次不再出现; old `roles: aux` rows produce no item either.
 */
export function lessonItems(input: PlanbookInput, date: string): PlanItem[] {
  const items: PlanItem[] = [];
  for (const month of input.cycleMonths) {
    for (const lesson of month.lessons[date] ?? []) {
      if (month.roles[lesson.course] === "aux") continue;
      items.push({
        lane: "main",
        text: `${month.names[lesson.course] ?? lesson.course} ${lesson.id} · ${lesson.content}`,
        short: `${month.names[lesson.course] ?? lesson.course} ${lesson.id}`,
        mark: markOf(date, input.today, lesson.done === true, "main"),
        slug: lesson.course,
        id: lesson.id,
      });
    }
  }
  return items;
}

/** One calendar 讲后读 row as a grid item, before the per-course merge. */
function afterReadItem(
  input: PlanbookInput,
  due: { slug: string; title: string; book?: string; index?: number },
  date: string,
): PlanItem | null {
  const entry = afterReadEntry(due);
  if (entry === null) return null;
  // The lane already says 讲后读; drop the title's 「讲后读 · 」/「讲后读 」 lead.
  const text = due.title.startsWith("讲后读 · ")
    ? due.title.slice("讲后读 · ".length)
    : due.title.startsWith("讲后读 ")
      ? due.title.slice("讲后读 ".length)
      : due.title;
  const name =
    input.cycleMonths
      .map((month) => month.names[entry.slug])
      .find((value) => value !== undefined) ?? entry.slug;
  const late = date < input.today;
  return {
    lane: "after",
    text,
    // 「离散 §2.1–2.2」: the course short name plus the range before the first 「 · 」.
    short: `${name} ${text.split(" · ")[0]}`,
    mark: markOf(date, input.today, false, "after"),
    slug: entry.slug,
    id: null,
    ...(late ? { from: date } : {}),
  };
}

/** One item per course: ranges joined with 「、」, the earliest `from`, ⚠ if any is late. */
function mergeByCourse(items: PlanItem[]): PlanItem[] {
  const merged = new Map<string | null, PlanItem>();
  for (const item of items) {
    const seen = merged.get(item.slug);
    if (seen === undefined) {
      merged.set(item.slug, item);
      continue;
    }
    const range = item.short.slice(item.short.indexOf(" ") + 1);
    const from = seen.from ?? item.from;
    merged.set(item.slug, {
      ...seen,
      text: `${seen.text}；${item.text}`,
      short: `${seen.short}、${range}`,
      mark: seen.mark === "warn" || item.mark === "warn" ? "warn" : seen.mark,
      ...(from === undefined ? {} : { from }),
    });
  }
  return [...merged.values()];
}

/**
 * 讲后读 items of one date (the `readingDue` rows whose slug marks them). The
 * calendar lists only unread ones, so a past one is still owed: it leaves its
 * own day and shows on today, with `from` (user 11-11: no 「!」 left hanging).
 */
export function afterReadItems(input: PlanbookInput, date: string): PlanItem[] {
  if (date < input.today) return [];
  const items: PlanItem[] = [];
  for (const month of input.calendarMonths) {
    const dates = Object.keys(month.days)
      .filter((day) => (date === input.today ? day <= date : day === date))
      .sort();
    for (const day of dates) {
      for (const due of month.days[day]?.readingDue ?? []) {
        const item = afterReadItem(input, due, day);
        if (item !== null) items.push(item);
      }
    }
  }
  return mergeByCourse(items);
}

/** date → self-reading items, indexed once for the whole range (导读书走 guide 行). */
export function selfItemsByDate(input: PlanbookInput): Map<string, PlanItem[]> {
  const byDate = new Map<string, PlanItem[]>();
  for (const book of input.shelf) {
    if (book.slot === "guided") continue;
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

/** date → 导读 items of the guided books' schedule, indexed once for the range. */
export function guidedItemsByDate(input: PlanbookInput): Map<string, PlanItem[]> {
  const byDate = new Map<string, PlanItem[]>();
  for (const book of input.shelf) {
    if (book.slot !== "guided") continue;
    for (const row of book.schedule ?? []) {
      const item: PlanItem = {
        lane: "guide",
        text: `${book.short} ${row.title} pp.${row.from}–${row.to}`,
        short: `${book.short} ${row.title}`,
        mark: markOf(row.date, input.today, row.done, "guide"),
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

/** The course-page week task a 周核实 row answers to (label 含「周核实」). */
function isVerifyTask(task: { label: string }): boolean {
  return task.label.includes("周核实");
}

/**
 * Whether the course's 周核实 is done — only its checked week task counts, so
 * today card and week grid share one verdict (converge 11-15).
 */
export function verifyDone(courses: CourseSummary[], slug: string): boolean {
  const course = courses.find((item) => item.slug === slug);
  return course?.week.tasks.some((task) => isVerifyTask(task) && task.done) === true;
}

/**
 * A 整合日's 周核实, one main-lane item per main course (panel v2: the day's 主课
 * cells read 「● 离散 周核实」). Done once the course's week task says so;
 * started that day but not checked off reads ●; a past 整合日 not known to be
 * done stays plain ○ — it is not a missed lesson.
 */
export function verifyItems(input: PlanbookInput, date: string): PlanItem[] {
  if (slotOf(input.cycleMonths, date)?.type !== "整合") return [];
  return [...mainCourseSlugs(input)].map((slug) => {
    const name =
      input.cycleMonths.map((month) => month.names[slug]).find((value) => value !== undefined) ?? slug;
    const done = date <= input.today && verifyDone(input.courses, slug);
    const started = input.verifiedOn?.[slug] === date;
    return {
      lane: "main",
      text: strings.control.card.verifyRow(name),
      short: `${name} ${strings.actions.verify}`,
      mark: done ? "done" : started || date === input.today ? "now" : "plan",
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
      .filter((task) => mains.has(course.slug) && isVerifyTask(task))
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
