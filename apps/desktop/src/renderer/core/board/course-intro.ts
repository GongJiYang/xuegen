/**
 * The local 「开课」 card: what the course board already knows, shown the instant
 * the learner clicks 开始学习 / 继续学习.
 *
 * Building the card from `CourseSummary` means the conversation shows something
 * before the agent has read a single file or produced a token. Pure so the copy
 * logic (which fallback wins) is unit-tested without the UI.
 */

import type { CourseSummary } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

export interface CourseIntro {
  title: string;
  /** 上次学习日期 `YYYY-MM-DD`（来自 lastRecord.date），没有则 null。 */
  lastDate: string | null;
  /** 本周最后一个已勾选任务的标签，没有则 null。 */
  lastDone: string | null;
  /** 这次从这里开始（nextSession），没有则 null。 */
  next: string | null;
  /** 本周进度。 */
  week: { done: number; total: number };
}

/** The opening card plus where it belongs in the current transcript. */
export interface CourseIntroState {
  card: CourseIntro;
  beforeIndex: number;
}

/** The three copy lines both skins render, so the fallbacks live in one place. */
export interface CourseIntroLines {
  last: string;
  next: string;
  week: string;
}

/** Turn a card into its display lines (copy stays in `core/strings.ts`). */
export function courseIntroLines(card: CourseIntro): CourseIntroLines {
  const last = card.lastDone
    ? card.lastDate
      ? strings.intro.lastDone(card.lastDone, card.lastDate)
      : strings.intro.lastDoneOnly(card.lastDone)
    : card.lastDate
      ? strings.intro.lastDate(card.lastDate)
      : strings.intro.firstTime;
  return {
    last,
    next: card.next ? strings.intro.next(card.next) : strings.intro.nextUnset,
    week: strings.intro.week(card.week.done, card.week.total),
  };
}

/** Summarise a course for the opening card. */
export function courseIntro(course: CourseSummary): CourseIntro {
  let lastDone: string | null = null;
  for (const task of course.week.tasks) {
    if (task.done) lastDone = task.label;
  }
  return {
    title: course.title,
    lastDate: course.lastRecord?.date ?? null,
    lastDone,
    next: course.nextSession,
    week: { done: course.week.done, total: course.week.total },
  };
}
