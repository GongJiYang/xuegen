/**
 * Data channel protocol: request/response types for the renderer's read/write
 * calls into the vault (courses, reading, cards, calendar, skills) and Anki.
 *
 * Unlike the agent stream, this is a request/response channel: the renderer
 * sends one `DataRequest` and gets back one `DataResponse` carrying the typed
 * payload for that request. The main process owns every effect (script calls,
 * file writes, AnkiConnect) and the renderer only sees these types.
 *
 * All inputs crossing this boundary are validated in the main process with the
 * hand-written guards below.
 */

import type { DesktopSettings } from "./protocol.js";
import type { UpdateStatus } from "./update.js";

/** Reading priority, mirroring `reading-queue.mjs`. */
export type ReadingPriority = "high" | "medium" | "low";

/**
 * When a newly added reading item becomes due.
 *
 * `today` schedules it for today (the add form's 「今天就读」 box, checked by
 * default); `scheduled` lets the script pick the default interval.
 */
export type ReadingDue = "today" | "scheduled";

/** Reading outcome for a session, mirroring `reading-queue.mjs`. */
export type ReadingOutcome = "next" | "postpone" | "done";

/** One course as returned by `course-state.mjs list --json`. */
export interface CourseSummary {
  slug: string;
  title: string;
  weekLabel: string | null;
  week: { done: number; total: number; tasks: { label: string; done: boolean }[] };
  overall: { done: number; total: number };
  lastRecord: { date: string; seq: string } | null;
  nextSession: string | null;
  styleHint: string | null;
  /** The course file's modification time (ms since epoch), from `course-state.mjs list`. */
  changedAt?: number;
  /** The course file's absolute path, from `course-state.mjs list`. */
  file?: string;
}

/** One due reading item as returned by `reading-queue.mjs today --json`. */
export interface ReadingItem {
  slug: string;
  title: string;
  priority: string;
  due: string;
  position: string;
  status: string;
}

/** The whole queue (excluding `done`), from `reading-queue.mjs list --json`. */
export type ReadingQueueItem = ReadingItem;

/** Queue statistics from `reading-queue.mjs stats --json`. */
export interface ReadingStats {
  reading: { queued: number; active: number; paused: number; done: number };
  dueToday: number;
  overdue: number;
  reviewsLast7: number;
  cardsPending: number;
}

/** Cache statistics from `flashcards.mjs stats --json`. */
export interface CardsStats {
  total: number;
  unsynced: number;
  decks: { deck: string; total: number; unsynced: number; files: string[] }[];
  pendingExtracts: number;
}

/** AnkiConnect status; `running` is false when the local Anki is unreachable. */
export interface AnkiStatus {
  running: boolean;
  version?: number;
  deckNames?: string[];
  reviewedToday?: number;
  due?: { deck: string; count: number }[];
}

/** One day in the calendar month view. */
export interface CalendarDay {
  records: { course: string; heading: string }[];
  plans: { course: string; label: string }[];
  readingDue: { slug: string; title: string }[];
  log: string[];
  note: string | null;
}

/** A month of aggregated calendar content, keyed by `YYYY-MM-DD`. */
export interface CalendarMonth {
  month: string;
  days: Record<string, CalendarDay>;
}

/** The four kinds of day in a study cycle's weekly template (`cycle.mjs`). */
export type CycleDayType = "深度" | "整合" | "低强度" | "休息";

/** A cycle course's role: a main subject's course, or an auxiliary (preview, not assessed) one. */
export type CourseRole = "main" | "aux";

/** One lesson row from a course schedule, as `cycle.mjs` reports it. */
export interface CycleLesson {
  course: string;
  id: string;
  content: string;
}

/** A day's place in its cycle, from `cycle.mjs day --json`. `cycle` is null outside every cycle. */
export interface CycleDay {
  date: string;
  /** 周一 … 周日. */
  weekday: string;
  cycle: string | null;
  week: number | null;
  type: CycleDayType | null;
  /** The subject a 深度 day belongs to; null for other day types. */
  subject: string | null;
  /** On a 深度 day: the subject's course with a lesson that day, else its earliest overdue one, else its first course this cycle; null on other days. */
  course: string | null;
  /** The auxiliary subject of a 深度 day, or null. */
  aux: string | null;
  /** The auxiliary subject's course for that day (same rule as `course`), or null. */
  auxCourse: string | null;
  /** Course slug → its short name (the alias of its link on the subject page). */
  names: Record<string, string>;
  /** Subject slug → the short name the weekly template links it with. */
  subjects: Record<string, string>;
  /** Course slug → main or aux. */
  roles: Record<string, CourseRole>;
  /** That day's lesson rows across the cycle's courses (new lessons and 机动, no reviews). */
  lessons: CycleLesson[];
  /** Earlier new lessons not yet listed in a course's 「完成：」 line. */
  overdue: (CycleLesson & { date: string })[];
}

/** One in-cycle day of a month, from `cycle.mjs month --json`. */
export interface CycleSlot {
  cycle: string;
  week: number;
  type: CycleDayType;
  subject: string | null;
  /** The subject's course with a lesson that day, or null. */
  course: string | null;
  aux: string | null;
  auxCourse: string | null;
}

/**
 * A month of study-cycle data, from `cycle.mjs month --json`.
 *
 * `days` holds only in-cycle days; `lessons` the lesson rows planned on a day;
 * `names` the courses' and `subjects` the subjects' short names; `cycles` every
 * cycle's bounds (for the 「C1 起 / C1 完」 flags); `recovery` the route's
 * recovery days in this month.
 */
export interface CycleMonth {
  month: string;
  days: Record<string, CycleSlot>;
  lessons: Record<string, CycleLesson[]>;
  names: Record<string, string>;
  subjects: Record<string, string>;
  roles: Record<string, CourseRole>;
  cycles: { cycle: string; start: string; end: string }[];
  recovery: string[];
}

/** One cycle row of the two-year route (`wiki/cycles/route.md`). */
export interface RouteCycle {
  id: string;
  start: string;
  end: string;
  main: string[];
  aux: string[];
  /** 进行中 / 未开始 / 完成. */
  status: string;
}

/** The two-year route; `end` is the last day of the last cycle. */
export interface RouteInfo {
  start: string;
  end: string;
  bufferWeeks: number;
  weeksLeft: number;
  cycles: RouteCycle[];
  recovery: { start: string; end: string }[];
}

/** One course of the current cycle: new lessons only. */
export interface CycleCourseProgress {
  slug: string;
  /** Its subject's slug. */
  subject: string;
  role: CourseRole;
  /** The short name the weekly template links it with. */
  name: string;
  total: number;
  done: number;
  /** Date of the last lesson, or null without a schedule. */
  end: string | null;
  /** The first lesson not yet done (may be in the past). */
  next: { id: string; date: string; content: string } | null;
  /** Every new lesson in schedule order, with whether it is done. */
  lessons: { id: string; date: string; content: string; done: boolean }[];
}

/** The top of 总进度, from `cycle.mjs overview --json`. */
export interface CycleOverview {
  date: string;
  route: RouteInfo | null;
  cycle: {
    cycle: string;
    /** The cycle page's title without 「C1 · 」. */
    title: string;
    start: string;
    end: string;
    week: number;
    weeks: number;
    daysLeft: number;
    next: { cycle: string; start: string } | null;
    /** Subject slug → short name (main and aux columns). */
    subjects: Record<string, string>;
    /** The auxiliary column's subjects, in template order. */
    auxSubjects: string[];
    /** Subject slug → its days in the template (main or aux column), Monday first: 「周一」… */
    subjectDays: Record<string, string[]>;
  } | null;
  courses: CycleCourseProgress[];
}

/** One material line on a subject page, from `subjects.mjs`. */
export interface SubjectMaterial {
  /** The `###` heading it sits under: 书籍 / 在线书籍 / 论文 / 公开课 / 视频 / 文章 / 代码与工具. */
  type: string;
  mark: "now" | "warn" | "done" | "plan" | "none";
  /** 学习中 / 已摄取 / 未制定计划 … as written on the page. */
  status: string;
  /** 主线 / 参考 / 练习 / 预习 / 拓展 … as written on the page. */
  role: string;
  title: string;
  /** The course that uses it, when the line links one. */
  course: string | null;
}

/** One subject page, from `subjects.mjs list --json`. */
export interface SubjectInfo {
  slug: string;
  title: string;
  layer: string;
  route: string;
  /** True when the route makes it a main subject of the current cycle. */
  main: boolean;
  courses: string[];
  materials: SubjectMaterial[];
}

/** Every subject plus the cycle the date falls in (null outside every cycle). */
export interface SubjectsOverview {
  date: string;
  cycle: { cycle: string; week: number; weeks: number; aux: string | null } | null;
  subjects: SubjectInfo[];
}

/** One skill the app can enable or disable. */
export interface SkillInfo {
  name: string;
  description: string;
  source: "builtin" | "personal" | "pending";
  enabled: boolean;
}

/** What the review dialog shows before a fetched skill may be enabled. */
export interface SkillReview {
  name: string;
  description: string;
  /** Repository the skill was fetched from, and the exact commit. */
  url: string;
  commit: string;
  /** Directory inside the repository that held the SKILL.md (`.` for the root). */
  subdir: string;
  /** Full SKILL.md text (truncated past 64 KB). */
  skillMd: string;
  /** Every file the skill ships; `executable` marks scripts the agent could run. */
  files: { path: string; size: number; executable: boolean }[];
  /** Xuegen authoring-rule findings, shown as hints only. */
  lint: { errors: string[]; warnings: string[] };
}

/** One source file that can still be added to the reading queue. */
export interface ReadingSource {
  /** Vault-relative path under `raw/` or `Clippings/`, e.g. `raw/papers/x.pdf`. */
  path: string;
  /** Display name (file name without its extension). */
  name: string;
  /** Modification time in epoch milliseconds, for newest-first ordering. */
  modifiedAt: number;
}

/** Requests the renderer sends on the data channel. */
export type DataRequest =
  | { kind: "courses.list" }
  | { kind: "reading.today"; limit: number }
  | { kind: "reading.stats" }
  | { kind: "reading.sources" }
  | { kind: "reading.queue" }
  | { kind: "reading.add"; source: string; priority: ReadingPriority; due: ReadingDue }
  | { kind: "reading.review"; slug: string; outcome: ReadingOutcome; position?: string }
  | { kind: "cards.stats" }
  | { kind: "cards.add"; deck: string; front: string; back: string }
  | { kind: "anki.status" }
  | { kind: "calendar.month"; month: string }
  | { kind: "calendar.write"; date: string; text: string }
  | { kind: "cycle.day"; date: string }
  | { kind: "cycle.month"; month: string }
  | { kind: "cycle.overview"; date: string }
  | { kind: "subjects.list"; date: string }
  | { kind: "skills.list" }
  | { kind: "skills.setEnabled"; name: string; enabled: boolean }
  | { kind: "skills.fetch"; url: string }
  | { kind: "skills.review"; name: string }
  | { kind: "skills.discard"; name: string }
  | { kind: "update.check" }
  | { kind: "update.download" }
  | { kind: "update.install" };

/** The typed payload each request kind resolves to. */
export interface DataResponseMap {
  "courses.list": CourseSummary[];
  "reading.today": ReadingItem[];
  "reading.stats": ReadingStats;
  "reading.sources": ReadingSource[];
  "reading.queue": ReadingQueueItem[];
  "reading.add": { slug: string; title: string; priority: string; due: string };
  "reading.review": { slug: string; outcome: string; status: string; due: string };
  "cards.stats": CardsStats;
  "cards.add": { file: string; deck: string };
  "anki.status": AnkiStatus;
  "calendar.month": CalendarMonth;
  "calendar.write": { date: string; file: string | null; wrote: boolean };
  "cycle.day": CycleDay;
  "cycle.month": CycleMonth;
  "cycle.overview": CycleOverview;
  "subjects.list": SubjectsOverview;
  "skills.list": SkillInfo[];
  "skills.setEnabled": DesktopSettings;
  "skills.fetch": { skills: { name: string; path: string }[] };
  "skills.review": SkillReview;
  "skills.discard": { name: string };
  "update.check": UpdateStatus;
  "update.download": UpdateStatus;
  "update.install": UpdateStatus;
}

/**
 * A stable reason code for a failed data request.
 *
 * The renderer maps these to `core/strings.ts` copy; the `error` string is the
 * dynamic detail (script stderr, git output) that the UI shows alongside it.
 */
export type DataErrorCode =
  | "vault-missing"
  | "script-failed"
  | "invalid-request"
  | "skill-exists"
  | "skill-invalid"
  | "skill-url"
  | "unknown";

/** The success or failure envelope the data channel returns. */
export type DataResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string; code: DataErrorCode };

/** The map a caller uses to type the result of a specific request. */
export type DataResultFor<K extends DataRequest["kind"]> =
  | { ok: true; data: DataResponseMap[K] }
  | { ok: false; error: string; code: DataErrorCode };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True for a real `YYYY-MM-DD` date (shape and calendar validity). */
function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text;
}

/** True for a `YYYY-MM` month with month 01-12. */
function isIsoMonth(text: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(text)) return false;
  const month = Number(text.slice(5));
  return month >= 1 && month <= 12;
}

function isPriority(value: unknown): value is ReadingPriority {
  return value === "high" || value === "medium" || value === "low";
}

function isOutcome(value: unknown): value is ReadingOutcome {
  return value === "next" || value === "postpone" || value === "done";
}

function isReadingDue(value: unknown): value is ReadingDue {
  return value === "today" || value === "scheduled";
}

/**
 * Runtime guard for renderer -> main data requests.
 *
 * The renderer is not fully trusted, so every request is validated here before
 * the main process touches the vault or the Anki socket.
 */
export function isDataRequest(value: unknown): value is DataRequest {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "courses.list":
    case "reading.stats":
    case "reading.sources":
    case "reading.queue":
    case "cards.stats":
    case "anki.status":
    case "skills.list":
      return true;
    case "reading.today":
      return typeof value.limit === "number" && Number.isInteger(value.limit) && value.limit >= 0;
    case "reading.add":
      return (
        typeof value.source === "string" &&
        isPriority(value.priority) &&
        (value.due === undefined || isReadingDue(value.due))
      );
    case "reading.review":
      return (
        typeof value.slug === "string" &&
        isOutcome(value.outcome) &&
        (value.position === undefined || typeof value.position === "string")
      );
    case "cards.add":
      return (
        typeof value.deck === "string" &&
        typeof value.front === "string" &&
        typeof value.back === "string"
      );
    case "calendar.month":
      return typeof value.month === "string" && isIsoMonth(value.month);
    case "calendar.write":
      return typeof value.date === "string" && isIsoDate(value.date) && typeof value.text === "string";
    case "cycle.day":
    case "cycle.overview":
      return typeof value.date === "string" && isIsoDate(value.date);
    case "cycle.month":
      return typeof value.month === "string" && isIsoMonth(value.month);
    case "subjects.list":
      return typeof value.date === "string" && isIsoDate(value.date);
    case "skills.setEnabled":
      return typeof value.name === "string" && typeof value.enabled === "boolean";
    case "skills.fetch":
      return typeof value.url === "string";
    case "skills.review":
    case "skills.discard":
      return typeof value.name === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.name);
    case "update.check":
    case "update.download":
    case "update.install":
      return true;
    default:
      return false;
  }
}
