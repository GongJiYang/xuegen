/**
 * What one 总控 answer changed in the schedule (user 11-14): the lessons'
 * placements before the answer against after, read from the same
 * `cycle.month` data the panel shows. The model's own account is not used.
 */

import type { CourseRole, CycleMonth } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

/** One lesson's day; `from` null is newly added, `to` null was removed. */
export interface PlanChange {
  course: string;
  id: string;
  from: string | null;
  to: string | null;
}

/** `course|id` → the day the lesson sits on (its first day if listed twice). */
export type Placements = Record<string, { course: string; id: string; date: string }>;

export function placements(months: readonly CycleMonth[]): Placements {
  const out: Placements = {};
  const dates = months.flatMap((month) => Object.keys(month.lessons)).sort();
  for (const date of dates) {
    for (const month of months) {
      for (const lesson of month.lessons[date] ?? []) {
        const key = `${lesson.course}|${lesson.id}`;
        if (out[key] === undefined) out[key] = { course: lesson.course, id: lesson.id, date };
      }
    }
  }
  return out;
}

/** Moved, added and removed lessons, ordered by the earlier of their two days. */
export function planDiff(before: Placements, after: Placements): PlanChange[] {
  const changes: PlanChange[] = [];
  for (const [key, was] of Object.entries(before)) {
    const now = after[key];
    if (now === undefined) changes.push({ course: was.course, id: was.id, from: was.date, to: null });
    else if (now.date !== was.date)
      changes.push({ course: was.course, id: was.id, from: was.date, to: now.date });
  }
  for (const [key, now] of Object.entries(after)) {
    if (before[key] === undefined) changes.push({ course: now.course, id: now.id, from: null, to: now.date });
  }
  const first = (change: PlanChange): string =>
    [change.from, change.to].filter((d) => d !== null).sort()[0] ?? "";
  return changes.sort(
    (a, b) =>
      first(a).localeCompare(first(b)) || a.course.localeCompare(b.course) || a.id.localeCompare(b.id),
  );
}

/** 「离散 D4 11-16 → 11-17」 / 「新加 离散 D9 · 11-20」 / 「删掉 离散 D9（原 11-20）」. */
export function changeLine(change: PlanChange, names: Readonly<Record<string, string>>): string {
  const name = `${names[change.course] ?? change.course} ${change.id}`;
  const day = (date: string): string => date.slice(5);
  if (change.from === null) return strings.planChanges.added(name, day(change.to ?? ""));
  if (change.to === null) return strings.planChanges.removed(name, day(change.from));
  return strings.planChanges.moved(name, day(change.from), day(change.to));
}

/** A struck-out copy on a lesson's old day: its lane row, short label and note. */
export interface PlanGhost {
  lane: "main" | "guide";
  label: string;
  note: string;
}

/**
 * Where the grid marks the changes: `at` the lessons' new places (keyed
 * `date|course|id`), `ghosts` the struck-out copies left on their old days.
 */
export interface PlanMarks {
  at: Record<string, string>;
  ghosts: Record<string, PlanGhost[]>;
}

export function planMarks(
  changes: readonly PlanChange[],
  names: Readonly<Record<string, string>>,
  roles: Readonly<Record<string, CourseRole>>,
): PlanMarks {
  const marks: PlanMarks = { at: {}, ghosts: {} };
  for (const change of changes) {
    if (change.to !== null) {
      marks.at[`${change.to}|${change.course}|${change.id}`] =
        change.from === null
          ? strings.planChanges.markAdded
          : strings.planChanges.markFrom(change.from.slice(5));
    }
    if (change.from !== null) {
      const note =
        change.to === null ? strings.planChanges.markRemoved : strings.planChanges.markTo(change.to.slice(5));
      const lane = roles[change.course] === "aux" ? "guide" : "main";
      const label = `${names[change.course] ?? change.course} ${change.id}`;
      (marks.ghosts[change.from] ??= []).push({ lane, label, note });
    }
  }
  return marks;
}
