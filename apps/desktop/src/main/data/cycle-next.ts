/**
 * `cycle.accept` / `cycle.preview` requests: the `cycle.mjs` script's JSON
 * output mapped onto the data-channel protocol types. The script is ours, but
 * the boundary still guards every field so a malformed response degrades to a
 * safe shape instead of leaking `unknown` into the renderer.
 */

import type {
  CycleAccept,
  CycleAcceptCourse,
  CycleDayType,
  CyclePreview,
  CyclePreviewDay,
} from "../../shared/data-protocol.js";

const DAY_TYPES: ReadonlySet<string> = new Set(["深度", "整合", "低强度", "休息"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function acceptCourseOf(value: unknown): CycleAcceptCourse {
  const record = isRecord(value) ? value : {};
  const lessons = isRecord(record.lessons) ? record.lessons : {};
  return {
    slug: stringOf(record.slug),
    title: stringOf(record.title),
    subject: stringOf(record.subject),
    goals: Array.isArray(record.goals)
      ? record.goals.filter(isRecord).map((goal) => ({
          level: stringOf(goal.level),
          text: stringOf(goal.text),
          done: goal.done === true,
        }))
      : [],
    lessons: {
      done: numberOf(lessons.done),
      total: numberOf(lessons.total),
      remaining: stringsOf(lessons.remaining),
    },
  };
}

/** The script's accept output → `CycleAccept` (`next` stays null when absent). */
export function cycleAcceptOf(data: unknown): CycleAccept {
  const record = isRecord(data) ? data : {};
  const next = isRecord(record.next)
    ? {
        cycle: stringOf(record.next.cycle),
        start: stringOf(record.next.start),
        end: stringOf(record.next.end),
        mains: stringsOf(record.next.mains),
        status: stringOf(record.next.status),
      }
    : null;
  return {
    cycle: stringOf(record.cycle),
    start: stringOf(record.start),
    end: stringOf(record.end),
    courses: Array.isArray(record.courses) ? record.courses.map(acceptCourseOf) : [],
    next,
  };
}

function previewDayOf(value: unknown): CyclePreviewDay {
  const record = isRecord(value) ? value : {};
  const type = typeof record.type === "string" && DAY_TYPES.has(record.type) ? record.type : "整合";
  return {
    date: stringOf(record.date),
    weekday: stringOf(record.weekday),
    type: type as CycleDayType,
    subject: stringOrNull(record.subject),
    name: stringOrNull(record.name),
    aux: stringOrNull(record.aux),
    auxName: stringOrNull(record.auxName),
    ...(record.unchanged === true ? { unchanged: true } : {}),
  };
}

/** The script's preview output → `CyclePreview` (malformed days degrade field-wise). */
export function cyclePreviewOf(data: unknown): CyclePreview {
  const record = isRecord(data) ? data : {};
  return { days: Array.isArray(record.days) ? record.days.map(previewDayOf) : [] };
}
