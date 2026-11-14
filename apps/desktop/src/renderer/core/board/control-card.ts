/**
 * The 总控 今日卡: what today holds, from local data only.
 *
 * Rows come from the cycle day (lessons, missed lessons), the calendar month
 * (讲后读 rows the course pages schedule), the bookshelf (书房在读的书), and
 * the reading queue — never from a model call, so the card is on screen the
 * instant the 总控 session opens. Pure: today and every input are arguments.
 *
 * The reading rows and the undo windows live in `control-card-rows.ts` and
 * `control-card-pending.ts`; their names are re-exported here so callers keep
 * one import.
 */

import type {
  AnkiStatus,
  CalendarMonth,
  CycleDay,
  ReadingQueueItem,
  ShelfToday,
} from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import { ankiDueCount, cycleHeadline, cycleName, mergeOverdue, tomorrowLine } from "./cycle-today.js";
import { afterReadEntry, afterReadTitle, readingDue, shelfRows } from "./control-card-rows.js";

export { afterReadTitle } from "./control-card-rows.js";
export {
  parsePageInput,
  withExtractCount,
  withPendingRead,
  withPendingShelf,
} from "./control-card-pending.js";

export type ControlCardMark = "now" | "warn" | "plan" | "faint" | "done";

export type ControlCardAction =
  | { kind: "study"; slug: string }
  | { kind: "verify"; slug: string }
  | { kind: "read" }
  | { kind: "anki" }
  /** Every label of the row: one course's 课后读 due by today are one row (user 11-11). */
  | { kind: "afterRead"; slug: string; labels: string[] }
  | { kind: "undoRead" }
  | { kind: "shelfDone"; slug: string }
  | { kind: "undoShelf" }
  | { kind: "extract"; slug: string; pages: string }
  /** 陪读: open a 自由 session that reads this block with the learner; records nothing. */
  | { kind: "accompany"; prompt: string };

/**
 * How a row gets done (panel v2, user 11-13), which the skin shows as three
 * groups: 上课 opens a session and is done at 收课; 阅读 is done the moment it
 * is ticked; 复习 only opens Anki. Absent on the rest day's single faint line.
 */
export type ControlCardGroup = "lesson" | "read" | "review";

export interface ControlCardRow {
  mark: ControlCardMark;
  text: string;
  /** Grey supplementary text at the row's tail (「第 2 / 81 天 · 晚了 1 天…」), or null/absent. */
  sub?: string | null;
  button: string | null;
  action: ControlCardAction | null;
  /** Hover text spelling out what the button changes, or null. */
  hint: string | null;
  /** Which of the three groups the row sits in; absent = above the groups. */
  group?: ControlCardGroup;
  /** A second, optional action on the row's right (「陪读 →」 on a 阅读 row). */
  side?: { label: string; action: ControlCardAction } | null;
}

export interface ControlCardView {
  headline: string;
  rows: ControlCardRow[];
}

/** `controlCard`'s arguments, named so the group builders can share them. */
interface ControlCardInput {
  /** `YYYY-MM-DD` of today. */
  today: string;
  /** Today's place in the cycle (`cycle.day`), or null while loading. */
  day: CycleDay | null;
  /** Tomorrow's place in the cycle, for the rest day's 「明天：…」 line. */
  tomorrow?: CycleDay | null;
  /** The calendar month containing today (`calendar.month`), or null. */
  calendar: CalendarMonth | null;
  /** The whole reading queue (`reading.queue`). */
  queue: ReadingQueueItem[];
  /** `shelf.today`: the books the 书房 is currently reading. */
  shelf?: ShelfToday | null;
  /** `anki.status`: adds today's due count to the Anki row when Anki is running. */
  anki?: AnkiStatus | null;
  /** slug → the day its 周核实 was last started (settings `verifiedOn`). */
  verifiedOn?: Record<string, string>;
}

/** One lesson row. `mark` is ignored once the lesson is written into its 「完成：」 line. */
function lessonRow(lesson: CycleDay["lessons"][number], mark: ControlCardMark, text: string): ControlCardRow {
  const card = strings.control.card;
  const done = lesson.done === true;
  return {
    group: "lesson",
    mark: done ? "done" : mark,
    text,
    button: done ? card.backToLesson : card.study,
    action: { kind: "study", slug: lesson.course },
    hint: card.studyHint,
  };
}

/** The morning's main lessons (● now), then the aux ones (○ plan). */
function lessonRows(day: CycleDay): ControlCardRow[] {
  const card = strings.control.card;
  const rows: ControlCardRow[] = [];
  for (const lesson of day.lessons) {
    if (day.roles[lesson.course] === "aux") continue;
    rows.push(lessonRow(lesson, "now", `${cycleName(day, lesson.course)} ${lesson.id} · ${lesson.content}`));
  }
  for (const lesson of day.lessons) {
    if (day.roles[lesson.course] !== "aux") continue;
    rows.push(
      lessonRow(
        lesson,
        "plan",
        `${card.auxPrefix}${cycleName(day, lesson.course)} ${lesson.id} · ${lesson.content}`,
      ),
    );
  }
  return rows;
}

/** A 整合日's 周核实 rows, one per main course (a click only switches back). */
function verifyRows(input: ControlCardInput, day: CycleDay): ControlCardRow[] {
  if (day.type !== "整合") return [];
  const card = strings.control.card;
  const rows: ControlCardRow[] = [];
  for (const [slug, role] of Object.entries(day.roles)) {
    if (role !== "main") continue;
    // Started today: done-looking, and the click only switches back (no resend).
    const verified = input.verifiedOn?.[slug] === input.today;
    rows.push({
      group: "lesson",
      mark: verified ? "done" : "now",
      text: card.verifyRow(cycleName(day, slug)),
      sub: verified ? card.verifyStarted : card.verifySub,
      button: verified ? card.verifyBack : card.verify,
      action: { kind: "verify", slug },
      hint: card.verifyHint,
    });
  }
  return rows;
}

/**
 * One 没学 row per course (the same merge the 今天 panel and planbook use):
 * a single missed lesson keeps its 「原定 …」 date; several collapse into one
 * 「N 节没学（最早 …）」 row instead of one line each.
 */
function missedRows(day: CycleDay): ControlCardRow[] {
  const card = strings.control.card;
  const rows: ControlCardRow[] = [];
  for (const missed of mergeOverdue(day.overdue, day.names)) {
    // Neutral (panel v2): a lesson not taken on its day is just the next one, with
    // a grey 「原排 …」 — no 「没学」, no warning mark.
    const lessons = day.overdue.filter((lesson) => lesson.course === missed.course);
    const first = lessons.reduce((a, b) => (b.date < a.date ? b : a), lessons[0]!);
    const prefix = day.roles[missed.course] === "aux" ? card.auxPrefix : "";
    rows.push({
      group: "lesson",
      mark: "plan",
      text:
        missed.count === 1
          ? `${prefix}${card.missedRow(missed.name, first.id, first.content)}`
          : `${prefix}${card.missedMany(missed.name, first.id, missed.count)}`,
      sub: missed.count === 1 ? card.missedSub(first.date) : card.missedManySub(first.date),
      button: card.study,
      action: { kind: "study", slug: missed.course },
      hint: card.studyHint,
    });
  }
  return rows;
}

/** The 上课 group: lessons, 周核实, then the lessons not taken on their day. */
function lessonGroup(input: ControlCardInput, day: CycleDay): ControlCardRow[] {
  return [...lessonRows(day), ...verifyRows(input, day), ...missedRows(day)];
}

/**
 * Due 讲后读 rows of the calendar month, up to today: one row per course, its
 * ranges joined, so two readings landing on one day never read as two chores.
 */
function afterReadRows(input: ControlCardInput, day: CycleDay): ControlCardRow[] {
  const card = strings.control.card;
  if (input.calendar === null) return [];
  const byCourse = new Map<string, { labels: string[]; titles: string[]; ranges: string[]; first: string }>();
  for (const date of Object.keys(input.calendar.days).sort()) {
    if (date > input.today) continue;
    for (const item of input.calendar.days[date]?.readingDue ?? []) {
      const entry = afterReadEntry(item);
      if (entry === null) continue;
      const group = byCourse.get(entry.slug) ?? { labels: [], titles: [], ranges: [], first: date };
      group.labels.push(entry.label);
      group.titles.push(afterReadTitle(item.title));
      // 核心页 is the skill's word, never shown.
      group.ranges.push(entry.label.replace(/\s*核心页$/, ""));
      byCourse.set(entry.slug, group);
    }
  }
  return [...byCourse].map(([slug, group]) => {
    const short = day.names[slug];
    const title = group.titles.join("、");
    const late = group.first < input.today;
    return {
      group: "read",
      side: {
        label: card.accompany,
        action: { kind: "accompany", prompt: card.accompanyAfterReadPrompt(title, slug) },
      },
      mark: "plan",
      // 「课后读 · 离散 §1.1–1.4、§2.1–2.2」 (panel v2): the course short name, then the ranges.
      text: short === undefined ? title : `${card.afterReadPrefix}${short} ${group.ranges.join("、")}`,
      sub: !late
        ? null
        : group.labels.length > 1
          ? card.afterReadManySub(group.first, group.labels.length)
          : card.missedSub(group.first),
      button: card.afterRead,
      action: { kind: "afterRead", slug, labels: group.labels },
      hint: card.afterReadHint,
    } satisfies ControlCardRow;
  });
}

/** The reading queue's rows due today — bold only on a 低强度 day. */
function queueRows(input: ControlCardInput, day: CycleDay): ControlCardRow[] {
  const card = strings.control.card;
  const rows: ControlCardRow[] = [];
  for (const item of input.queue) {
    if (!readingDue(item, input.today)) continue;
    rows.push({
      group: "read",
      mark: day.type === "低强度" ? "now" : "plan",
      text: card.readRow(item.title, item.position),
      button: card.read,
      action: { kind: "read" },
      hint: null,
    });
  }
  return rows;
}

/** The 阅读 group: 讲后读 rows, the 书房 rows, then the reading queue. */
function readGroup(input: ControlCardInput, day: CycleDay): ControlCardRow[] {
  return [
    ...afterReadRows(input, day),
    ...(input.shelf ? shelfRows(input.shelf) : []),
    ...queueRows(input, day),
  ];
}

/**
 * The 复习 group: one line, with today's count when Anki is open; a closed /
 * unknown Anki just says 「Anki」 (no 「未打开」 nudge — the count is not the
 * learner's task).
 */
function reviewRows(input: ControlCardInput, day: CycleDay): ControlCardRow[] {
  if (day.type === "休息") return [];
  const card = strings.control.card;
  const due = input.anki ? ankiDueCount(input.anki) : null;
  return [
    {
      group: "review",
      mark: "plan",
      text: due === null ? card.ankiRow : card.ankiRowDue(due),
      button: card.anki,
      action: { kind: "anki" },
      hint: null,
    },
  ];
}

/**
 * The card for one cycle day, or null outside every cycle.
 *
 * `tomorrow` feeds the rest day's single faint line (「明天：…」); pass null or
 * omit it and the line falls back to 「休息，不排任务」.
 */
export function controlCard(input: ControlCardInput): ControlCardView | null {
  const { day } = input;
  if (day === null || day.cycle === null) return null;
  const head = cycleHeadline(day);
  const headline = head === null ? day.cycle : `${day.cycle} · ${head}`;

  if (day.type === "休息" && day.lessons.length === 0) {
    const text = (input.tomorrow ? tomorrowLine(input.tomorrow) : null) ?? strings.plan.restItem;
    // Reading happens every day, rest days included (per the learner).
    const rest = { mark: "faint" as const, text, button: null, action: null, hint: null };
    return { headline, rows: [rest, ...(input.shelf ? shelfRows(input.shelf) : [])] };
  }

  return {
    headline,
    rows: [...lessonGroup(input, day), ...readGroup(input, day), ...reviewRows(input, day)],
  };
}
