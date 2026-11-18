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

import type { HistoryEntry, HistoryUndoResult } from "./history.js";
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
  /** 停用课（Key Facts 有「状态：停用」行）不出现在周期与当天课表里。 */
  archived: boolean;
  /** 停用日期（`YYYY-MM-DD`），没停用为 null。 */
  archivedOn: string | null;
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

/** One subject row of `domain.mjs subjects --json`. */
export interface DomainSubject {
  id: string;
  title: string;
  pages: number;
  terms: number;
  hasSummary: boolean;
}

/**
 * One glossary entry of `domain.mjs glossary --json`: the concept page itself
 * (`kind: "page"`) or a term coined inside it (`kind: "term"`). `page` is the
 * page's full H1, `path` the absolute Markdown path (what `wiki.read` takes).
 */
export interface DomainTerm {
  term: string;
  en: string | null;
  path: string;
  page: string;
  kind: "page" | "term";
  definition: string | null;
}

/** One lesson's share of a subject's glossary; `label` is 「课程短名 课次」. */
export interface DomainGroup {
  label: string;
  course: string;
  lesson: string | null;
  date: string;
  terms: DomainTerm[];
}

/** A subject's glossary plus its 领域小结, from `domain.mjs glossary --json`. */
export interface DomainGlossary {
  subject: string;
  title: string;
  summary: string | null;
  groups: DomainGroup[];
  other: DomainTerm[];
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
  slot: "planned" | "free" | "guided";
  /** The subject a 导读书 covers (frontmatter `subject:`; null for other books). */
  subject: string | null;
  /** The weekday pattern a 导读书 reads on (frontmatter `days:`; null for other books). */
  days: string | null;
  /** Minutes per 导读 segment (frontmatter `limit:`; null when unset or unreadable). */
  limit: number | null;
  /** The 导读书's next scheduled reading day (null for other books). */
  nextDay: string | null;
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
  /** The book's `## 课后读` rows (checked and unchecked). */
  afterReads: ShelfAfterRead[];
}

/** The currently-reading planned and free books, from `bookshelf.mjs today --json`. */
export interface ShelfToday {
  planned: ShelfBook | null;
  /** 导读 books due today (slot `guided`), shown before 课后读 in the 阅读 group. */
  guided: ShelfBook[];
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

/** One `## 课后读` line of a book page, as `shelf-after.mjs` parses it. */
export interface ShelfAfterRead {
  index: number;
  label: string;
  pages: string;
  course: string;
  date: string;
  done: boolean;
  readOn: string | null;
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
  slot: "planned" | "free" | "guided";
  /** 导读 books only: frontmatter subject / weekday pattern / minute limit / next day. */
  subject?: string | null;
  days?: string | null;
  limit?: number | null;
  nextDay?: string | null;
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
  /** The book's `## 课后读` rows (checked and unchecked). */
  afterReads: ShelfAfterRead[];
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
  /** Due self-read blocks, plus unchecked `## 课后读` rows of book pages: those
   *  carry the `#讲后读-` mark in `slug` and the `book` + `index` of their row. */
  readingDue: { slug: string; title: string; book?: string; index?: number }[];
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
  /** The 导读书 slug covering `aux` (导读课改书房导读后的来源), or null. */
  auxBook: string | null;
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
  /** The 导读书 slug covering `aux`, or null. */
  auxBook: string | null;
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

/** One course's study span on a day, from its session transcripts (`sessions.studied`). */
export interface StudiedSpan {
  slug: string;
  /** lesson: an open/resume marker that day; verify: only a verify marker; other: neither. */
  action: "lesson" | "verify" | "other";
  /** The 「今日要点 · X」 title announced that day (「离散 D3」), or null. */
  pin: string | null;
  /** Epoch ms of the first user message that day. */
  from: number;
  /** Epoch ms of the last assistant message that day (the last user message when no answer). */
  to: number;
}

/**
 * One problem from `vault-lint.mjs --json` (`area: "vault"`) or
 * `course-state.mjs verify --json` (`area: "courses"`), for the settings
 * dialog's 库检查 section. `detail` never contains a path.
 */
export interface CheckProblem {
  /** Which check produced it. */
  area: "vault" | "courses";
  /** Course slug (courses problems), or the linted entry's file name without
   * directory/extension; null for directory/board problems. */
  where: string | null;
  kind: string;
  detail: string;
}

/** The outcome of one `check.run`, persisted to `<home>/check-last.json`. */
export interface CheckResult {
  checkedAt: string;
  vault: CheckProblem[];
  courses: CheckProblem[];
}

/** What `course.stop` / `course.resume` did (`course-stop.mjs --json`). */
export interface CourseStopResult {
  slug: string;
  action: "stop" | "resume";
  date: string;
  /** The first undone new lesson's date after a resume (null on stop or none left). */
  firstLesson: string | null;
}

/**
 * One subject's 「## 讲解偏好」 lines (`subject-prefs.mjs list --json`).
 * `style` marks the 「默认风格：…」 line the renderer renders as a badge.
 */
export interface SubjectPrefs {
  subject: string;
  title: string;
  lines: { text: string; style: boolean }[];
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
 * One 「计划」/「顺延」/「开周期」/「自报」 jj commit made in the current turn,
 * as `plan-undo.mjs list` reports it (oldest first). For 开周期 commits `slug`
 * holds the cycle id (`C2`), not a course slug.
 */
export interface PlanCommit {
  id: string;
  kind: "计划" | "顺延" | "开周期" | "自报";
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
  | { kind: "terms.list"; since?: string }
  | { kind: "domain.subjects" }
  | { kind: "domain.glossary"; subject: string }
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
  | { kind: "shelf.afterDone"; book: string; index: number; today: string }
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
  | { kind: "history.list"; days: number } | { kind: "history.undo"; ids: string[] }
  | { kind: "sessions.list"; current: string }
  | { kind: "sessions.studied"; date: string }
  | { kind: "check.run" }
  | { kind: "check.last" }
  | { kind: "sessions.others"; current: string }
  | { kind: "course.stop"; slug: string }
  | { kind: "course.resume"; slug: string }
  | { kind: "prefs.list" }
  | { kind: "prefs.remove"; subject: string; text: string }
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
  "terms.list": TermGroup[];
  "domain.subjects": DomainSubject[];
  "domain.glossary": DomainGlossary;
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
  "shelf.afterDone": {
    slug: string;
    index: number;
    label: string;
    pages: string;
    course: string;
    readOn: string;
  };
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
  "history.list": HistoryEntry[]; "history.undo": HistoryUndoResult;
  "sessions.list": SessionMeta[];
  "sessions.studied": StudiedSpan[];
  "check.run": CheckResult;
  "check.last": CheckResult | null;
  "sessions.others": { dir: string; label: string; sessions: SessionMeta[] }[];
  "course.stop": CourseStopResult;
  "course.resume": CourseStopResult;
  "prefs.list": SubjectPrefs[];
  "prefs.remove": { subject: string; removed: string };
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
export type DataResponse = { ok: true; data: unknown } | { ok: false; error: string; code: DataErrorCode };

/** The map a caller uses to type the result of a specific request. */
export type DataResultFor<K extends DataRequest["kind"]> =
  { ok: true; data: DataResponseMap[K] } | { ok: false; error: string; code: DataErrorCode };

/**
 * The runtime guard lives in `data-guards.ts` (split for the line cap); it is
 * re-exported here so `import { isDataRequest } from "./data-protocol.js"`
 * keeps working unchanged.
 */
export { isDataRequest } from "./data-guards.js";
