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

/** One concept-page link of a 「存库」 line, as `course-terms.mjs list --json` reports it. */
export interface TermLink {
  title: string;
  path: string;
  definition: string | null;
  exists: boolean;
}

/** One lesson's stored concept pages, grouped by course + date + lesson. */
export interface TermGroup {
  course: string;
  courseTitle: string;
  date: string;
  lesson: string | null;
  terms: TermLink[];
}

/** One wiki page read for display: its H1 (or file name) and the Markdown without frontmatter. */
export interface WikiPage {
  path: string;
  title: string;
  markdown: string;
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

/** One ≤10-page daily block of a book, from `bookshelf.mjs` (`chunksOf`). */
export interface ShelfChunk {
  index: number;
  title: string;
  from: number;
  to: number;
}

/**
 * One bookshelf book as `bookshelf.mjs today --json` reports it.
 *
 * `chunk` is the next unread block (null once every block is done);
 * `plannedEnd` is the schedule's finish date (`started + total - 1`), `end`
 * the projected one (`next read day + remaining - 1`, or the last record's
 * date when finished); `late` is how many days `end` slips past `plannedEnd`;
 * `coreOverlap` lists the pages of today's chunk already read as 讲后读
 * (e.g. `"pp.12–15"`), or null.
 */
export interface ShelfBook {
  slug: string;
  title: string;
  short: string;
  slot: "planned" | "free";
  total: number;
  position: number;
  chunk: ShelfChunk | null;
  coreOverlap: string | null;
  /** True when today's record already holds 「第 position 段」: today's block is read. */
  doneToday: boolean;
  /** The block read today (`chunks[position - 1]`) when `doneToday`, else null. */
  doneChunk: ShelfChunk | null;
  /** True when the book was resumed today: `chunk` is tomorrow's block, not today's. */
  resumedToday: boolean;
  plannedEnd: string;
  end: string;
  late: number;
}

/** The currently-reading planned and free books, from `bookshelf.mjs today --json`. */
export interface ShelfToday {
  planned: ShelfBook | null;
  free: ShelfBook | null;
}

/** One `## 摘录` line of a book page; `carded` is the date it became a card, or null. */
export interface ShelfExtract {
  index: number;
  page: number;
  text: string;
  carded: string | null;
}

/** One `## 核心页已读` line: core pages read after a lesson. */
export interface ShelfCoreRead {
  pages: string;
  course: string;
  label: string;
  date: string;
}

/** One upcoming block of a book's schedule (`bookshelf.mjs list`): when to read which pages. */
export interface ShelfUpcoming {
  index: number;
  date: string;
  title: string;
  from: number;
  to: number;
}

/** One day of one book block (`bookshelf.mjs list --from/--to`): the block's planned day. */
export interface ShelfScheduleRow {
  index: number;
  title: string;
  from: number;
  to: number;
  /** The block's day: the record's date when read, else the planned day (past) or the carried date. */
  date: string;
  done: boolean;
  /**
   * A past planned day whose block was not read: the same block also shows up again
   * on its carried date, so one block can occupy two rows (design: `plan2.jsx`).
   */
  missed?: boolean;
}

/**
 * One book row of `bookshelf.mjs list --json` (`order` is null for free books
 * without one). A `paused` book keeps its position but is not scheduled:
 * `end` is "" (no projected finish, same as a queued book's `started`) and
 * `upcoming` is empty.
 */
export interface ShelfListItem {
  slug: string;
  title: string;
  short: string;
  slot: "planned" | "free";
  order: number | null;
  status: "queued" | "reading" | "paused" | "done";
  total: number;
  position: number;
  started: string;
  end: string;
  /** The frontmatter 目标日期, or null when unset / not a valid date. */
  target: string | null;
  /** Days `end` slips past `target` (0 when not late); null without a target or an `end`. */
  targetLate: number | null;
  extracts: ShelfExtract[];
  coreRead: ShelfCoreRead[];
  /** The next ≤5 unread blocks of the schedule (`[]` once the book is done). */
  upcoming: ShelfUpcoming[];
  /** Every block planned inside the requested `--from/--to` range (absent unless the request carried both). */
  schedule?: ShelfScheduleRow[];
}

/** Cache statistics from `flashcards.mjs stats --json`. */
export interface CardsStats {
  total: number;
  unsynced: number;
  /** Card blocks missing END: not counted in `total`/`unsynced`, never synced. */
  broken: number;
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
  /** Already recorded in the course's 「完成：」 line (absent in older data). */
  done?: boolean;
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
    /** The actual end, projected from how the main courses slipped. */
    end: string;
    /** The end written on the cycle page (the plan `end` is measured against). */
    plannedEnd: string;
    /** Days `end` slips past `plannedEnd` (≥ 0). */
    delayDays: number;
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
  /** 「## 讲解偏好」里的默认风格，没写为 null。 */
  defaultStyle: "plain" | "detailed" | "deep" | null;
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

/** One session transcript, summarized for the session list (from the transcript file itself). */
export interface SessionMeta {
  /** Absolute path of the `.jsonl` transcript. */
  file: string;
  /** Start time in epoch ms, from the file name's timestamp. */
  startedAt: number;
  /** The first user message's text (raw, may carry `[风格：…]` and an action marker), "" when none. */
  firstUser: string;
  /** The first 「今日要点 · X」 title in an assistant message (「离散 D2」), or null. */
  pin: string | null;
  /** User + assistant text messages. */
  count: number;
}

/**
 * One 「计划」/「顺延」/「开周期」 jj commit made in the current turn, as
 * `plan-undo.mjs list` reports it (oldest first). For 开周期 commits `slug`
 * holds the cycle id (`C2`), not a course slug.
 */
export interface PlanCommit {
  id: string;
  kind: "计划" | "顺延" | "开周期";
  slug: string;
  date: string;
}

/** One overall goal of a main course, from `cycle.mjs accept --json`. */
export interface CycleAcceptGoal {
  /** The word before the full-width colon ("" when the line has none). */
  level: string;
  text: string;
  done: boolean;
}

/** One main course of the cycle being accepted (auxiliary courses are excluded). */
export interface CycleAcceptCourse {
  slug: string;
  title: string;
  /** The subject this course belongs to. */
  subject: string;
  goals: CycleAcceptGoal[];
  lessons: { done: number; total: number; remaining: string[] };
}

/**
 * The previous cycle's acceptance material, from `cycle.mjs accept --json`;
 * the first step of the 「开下一周期」 wizard.
 */
export interface CycleAccept {
  cycle: string;
  start: string;
  end: string;
  courses: CycleAcceptCourse[];
  /** The route row right after this cycle (shifted to actual dates), or null. */
  next: { cycle: string; start: string; end: string; mains: string[]; status: string } | null;
}

/** One day of the new cycle's first week, from `cycle.mjs preview --json`. */
export interface CyclePreviewDay {
  date: string;
  /** 周一 … 周日. */
  weekday: string;
  type: CycleDayType;
  /** The main subject slug for a 深度 day (already swapped), else null. */
  subject: string | null;
  /** The subject's short name (the `subject` slug itself when unknown). */
  name: string | null;
  aux: string | null;
  auxName: string | null;
  /** Present when the old main subject stayed because fewer mains were chosen. */
  unchanged?: boolean;
}

/** The new cycle's first-week preview, reusing the source cycle's template. */
export interface CyclePreview {
  days: CyclePreviewDay[];
}

/**
 * What `plan-undo.mjs undo` did: the commits it reverted, the files it restored
 * to before the earliest plan commit, the pages that commit batch created
 * (kept, not deleted), and the board rebuild outcome.
 */
export interface PlanUndoResult {
  undone: string[];
  restoreFiles: string[];
  keptNew: string[];
  board: string;
}

/** One source file that can still be added to the reading queue. */
export interface ReadingSource {
  /** Vault-relative path under `raw/` or `clippings/`, e.g. `raw/papers/x.pdf`. */
  path: string;
  /** Display name (file name without its extension). */
  name: string;
  /** Modification time in epoch milliseconds, for newest-first ordering. */
  modifiedAt: number;
}

/** Requests the renderer sends on the data channel. */
export type DataRequest =
  | { kind: "courses.list" }
  | { kind: "course.afterRead"; slug: string; label: string; date: string }
  | { kind: "terms.list"; since?: string }
  | { kind: "wiki.read"; path: string }
  | { kind: "reading.today"; limit: number }
  | { kind: "reading.stats" }
  | { kind: "reading.sources" }
  | { kind: "reading.queue" }
  | { kind: "reading.add"; source: string; priority: ReadingPriority; due: ReadingDue }
  | { kind: "reading.review"; slug: string; outcome: ReadingOutcome; position?: string }
  | { kind: "shelf.today"; today: string }
  | { kind: "shelf.list"; from?: string; to?: string }
  | { kind: "shelf.done"; slug: string; today: string }
  | { kind: "shelf.extract"; slug: string; page: number; text: string; today: string }
  | { kind: "shelf.card"; slug: string; indexes: number[]; today: string }
  | { kind: "cards.stats" }
  | { kind: "cards.add"; deck: string; front: string; back: string }
  | { kind: "cards.sync"; dryRun: boolean }
  | { kind: "anki.status" }
  | { kind: "calendar.month"; month: string }
  | { kind: "calendar.write"; date: string; text: string }
  | { kind: "cycle.day"; date: string }
  | { kind: "cycle.month"; month: string }
  | { kind: "cycle.overview"; date: string }
  | { kind: "cycle.accept"; cycle: string }
  | { kind: "cycle.preview"; from: string; start: string; main: string[] }
  | { kind: "subjects.list"; date: string }
  | { kind: "plan.undoable"; since: string }
  | { kind: "plan.undo"; since: string }
  | { kind: "sessions.list"; current: string }
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
  "course.afterRead": { label: string; reading: string | null; book: string | null };
  "terms.list": TermGroup[];
  "wiki.read": WikiPage;
  "reading.today": ReadingItem[];
  "reading.stats": ReadingStats;
  "reading.sources": ReadingSource[];
  "reading.queue": ReadingQueueItem[];
  "reading.add": { slug: string; title: string; priority: string; due: string };
  "reading.review": { slug: string; outcome: string; status: string; due: string };
  "shelf.today": ShelfToday;
  "shelf.list": ShelfListItem[];
  "shelf.done": { slug: string; position: number; total: number; finished: boolean; next: string | null };
  "shelf.extract": { slug: string; index: number; page: number; text: string };
  "shelf.card": { slug: string; marked: number[]; skipped: number[] };
  "cards.stats": CardsStats;
  "cards.add": { file: string; deck: string };
  "cards.sync": {
    added: number;
    duplicates: unknown[];
    failed: unknown[];
    skipped: unknown[];
    decks: string[];
    presetMissing: boolean;
  };
  "anki.status": AnkiStatus;
  "calendar.month": CalendarMonth;
  "calendar.write": { date: string; file: string | null; wrote: boolean };
  "cycle.day": CycleDay;
  "cycle.month": CycleMonth;
  "cycle.overview": CycleOverview;
  "cycle.accept": CycleAccept;
  "cycle.preview": CyclePreview;
  "subjects.list": SubjectsOverview;
  "plan.undoable": PlanCommit[];
  "plan.undo": PlanUndoResult;
  "sessions.list": SessionMeta[];
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
    case "course.afterRead":
      return (
        typeof value.slug === "string" &&
        /^[a-z0-9-]+$/.test(value.slug) &&
        typeof value.label === "string" &&
        value.label.length > 0 &&
        value.label.length <= 200 &&
        !value.label.includes("\n") &&
        typeof value.date === "string" &&
        isIsoDate(value.date)
      );
    case "terms.list":
      return value.since === undefined || (typeof value.since === "string" && isIsoDate(value.since));
    case "wiki.read":
      // The path is re-checked against `<vault>/wiki/` in the main process; here
      // it only has to be a plausible absolute `.md` path.
      return (
        typeof value.path === "string" && value.path.startsWith("/") && value.path.endsWith(".md")
      );
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
    case "shelf.today":
      return typeof value.today === "string" && isIsoDate(value.today);
    case "shelf.list":
      // The range is optional but must be given as a pair of valid ISO dates with from ≤ to.
      return (
        (value.from === undefined) === (value.to === undefined) &&
        (value.from === undefined ||
          (typeof value.from === "string" &&
            typeof value.to === "string" &&
            isIsoDate(value.from) &&
            isIsoDate(value.to) &&
            value.from <= value.to))
      );
    case "shelf.done":
      return (
        typeof value.slug === "string" &&
        /^[a-z0-9-]+$/.test(value.slug) &&
        typeof value.today === "string" &&
        isIsoDate(value.today)
      );
    case "shelf.extract":
      return (
        typeof value.slug === "string" &&
        /^[a-z0-9-]+$/.test(value.slug) &&
        typeof value.page === "number" &&
        Number.isInteger(value.page) &&
        value.page >= 1 &&
        value.page <= 99999 &&
        typeof value.text === "string" &&
        value.text.trim().length > 0 &&
        value.text.trim().length <= 500 &&
        typeof value.today === "string" &&
        isIsoDate(value.today)
      );
    case "shelf.card":
      return (
        typeof value.slug === "string" &&
        /^[a-z0-9-]+$/.test(value.slug) &&
        Array.isArray(value.indexes) &&
        value.indexes.length > 0 &&
        value.indexes.length <= 200 &&
        value.indexes.every((index) => Number.isInteger(index) && index > 0) &&
        typeof value.today === "string" &&
        isIsoDate(value.today)
      );
    case "cards.add":
      return (
        typeof value.deck === "string" &&
        typeof value.front === "string" &&
        typeof value.back === "string"
      );
    case "cards.sync":
      return typeof value.dryRun === "boolean";
    case "calendar.month":
      return typeof value.month === "string" && isIsoMonth(value.month);
    case "calendar.write":
      return typeof value.date === "string" && isIsoDate(value.date) && typeof value.text === "string";
    case "cycle.day":
    case "cycle.overview":
      return typeof value.date === "string" && isIsoDate(value.date);
    case "cycle.month":
      return typeof value.month === "string" && isIsoMonth(value.month);
    case "cycle.accept":
      return typeof value.cycle === "string" && /^C\d+$/.test(value.cycle);
    case "cycle.preview":
      return (
        typeof value.from === "string" &&
        /^C\d+$/.test(value.from) &&
        typeof value.start === "string" &&
        isIsoDate(value.start) &&
        Array.isArray(value.main) &&
        value.main.length >= 1 &&
        value.main.length <= 2 &&
        value.main.every((slug) => typeof slug === "string" && /^[a-z0-9][a-z0-9-]*$/.test(slug))
      );
    case "subjects.list":
      return typeof value.date === "string" && isIsoDate(value.date);
    case "plan.undoable":
    case "plan.undo":
      // `since` is an ISO timestamp with timezone recorded when the answer
      // started; Date.parse both validates the shape and rejects garbage.
      return (
        typeof value.since === "string" &&
        value.since.length > 0 &&
        !Number.isNaN(Date.parse(value.since))
      );
    case "sessions.list":
      return typeof value.current === "string" && value.current.endsWith(".jsonl");
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
