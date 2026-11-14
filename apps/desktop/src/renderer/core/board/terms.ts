/**
 * The 总控 「术语」 block (user 11-14): the concept pages each recent lesson
 * saved to the wiki, one line per lesson, every term opening its page in the
 * reader. Only the pages — the user learns the terms there before Anki.
 */

import type { TermGroup } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

export interface TermChip {
  key: string;
  title: string;
  /** The page's absolute path (opened in the reader through `wiki.read`). */
  path: string;
  /** The definition's first sentence, shown on hover; null when the page has none. */
  hint: string | null;
  /** The page file is gone (the record still links it). */
  missing: boolean;
}

export interface TermLessonView {
  key: string;
  course: string;
  /** The course's short name (「离散」), for the block's course filter. */
  courseName: string;
  /** 「离散 D3 · 11-12」. */
  label: string;
  terms: TermChip[];
}

/** One openable term in reading order, for 上一个 / 下一个 in the reader. */
export interface TermStop {
  course: string;
  path: string;
  title: string;
  /** The lesson row's label (「离散 D3 · 11-12」). */
  label: string;
}

/** How far back the block looks: the last two weeks, today included. */
export const TERMS_DAYS = 14;

/** The first day of the window ending `today` (`YYYY-MM-DD`). */
export function termsSince(today: string, days = TERMS_DAYS): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

export function obsidianUrl(path: string): string {
  return `obsidian://open?path=${encodeURIComponent(path)}`;
}

/**
 * One row per lesson, newest first (the data channel already sorts), at most
 * `limit` rows. `names` maps a course slug to its short name (「离散」); without
 * one the course's full title is used.
 */
export function termsView(
  groups: readonly TermGroup[],
  names: Readonly<Record<string, string>>,
  limit = 40,
): TermLessonView[] {
  return groups.slice(0, limit).map((group) => {
    const name = names[group.course] ?? group.courseTitle;
    return {
      key: `${group.course}|${group.date}|${group.lesson ?? ""}`,
      course: group.course,
      courseName: name,
      label: strings.panel.termsLesson(name, group.lesson, group.date),
      terms: group.terms.map((term) => ({
        key: term.path,
        title: term.title,
        path: term.path,
        hint: term.definition,
        missing: !term.exists,
      })),
    };
  });
}

/** The courses in the block, first-seen order, with how many terms each has. */
export function termsCourses(
  lessons: readonly TermLessonView[],
): { course: string; name: string; count: number }[] {
  const out: { course: string; name: string; count: number }[] = [];
  for (const lesson of lessons) {
    const found = out.find((item) => item.course === lesson.course);
    if (found === undefined)
      out.push({ course: lesson.course, name: lesson.courseName, count: lesson.terms.length });
    else found.count += lesson.terms.length;
  }
  return out;
}

export function termTrail(lessons: readonly TermLessonView[]): TermStop[] {
  return lessons.flatMap((lesson) =>
    lesson.terms
      .filter((term) => !term.missing)
      .map((term) => ({ course: lesson.course, path: term.path, title: term.title, label: lesson.label })),
  );
}

/** A concept page without its leading `# 标题` line, which the reader's header already shows. */
export function stripTitle(markdown: string): string {
  const lines = markdown.split("\n");
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first === -1 || !/^#\s/.test(lines[first] ?? "")) return markdown;
  return lines
    .slice(first + 1)
    .join("\n")
    .replace(/^\s*\n/, "");
}
