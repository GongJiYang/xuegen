/**
 * One day of data, handed to every panel view that shows the same facts.
 *
 * The 11-11 batch found bugs of one shape: the same fact (a lesson's 完成, today's
 * Anki count, a 讲后读 line, a course's 带读 label) was computed separately in the
 * 今日卡, the 右侧今天面板, 总进度 and the 日历, so the places drifted apart. This
 * fixture is the single input for `consistency.test.ts`, which feeds it to each
 * view function and asserts the four places say the same thing. Every field is
 * copied from what the scripts emit (`cycle.mjs`, `calendar.mjs`,
 * `bookshelf.mjs`), so a fixture that stops matching them is itself a bug.
 *
 * The day: 2026-11-12, 周四, C1 第 1 周, 深度日.
 * - A `ctm` (主项) 今天一节，已收课；
 * - B `discrete-math-epp` (主项) 今天也有一节，未完成；
 * - C `effective-c` (带读) 今天一节，已收课；
 * - 11-10 的讲后读还没读（过期）；
 * - Anki 开着，两个牌组 20 + 22 张到期；
 * - 书房计划内一本晚 2 天。
 */

import type {
  AnkiStatus,
  CalendarMonth,
  CycleDay,
  CycleMonth,
  CycleOverview,
  ReadingQueueItem,
  ShelfListItem,
  ShelfToday,
} from "@shared/data-protocol.js";

/** The day every view is asked about. */
export const TODAY = "2026-11-12";
/** The day the unread 讲后读 was scheduled for. */
export const AFTER_READ_DATE = "2026-11-10";

/** 主项课 A：今天这节已收课。 */
export const COURSE_A = "ctm";
/** 主项课 B：今天这节还没上。 */
export const COURSE_B = "discrete-math-epp";
/** 带读课 C：今天这节已收课。 */
export const COURSE_C = "effective-c";

/** The 讲后读 title `calendar.mjs` writes today (no internal word 核心页, no nested parens). */
export const AFTER_READ_TITLE = "讲后读 · §1.1–1.4 · 离散数学（Epp, 5th ed）";
/** The section range inside that title, which every 讲后读 row must keep. */
export const AFTER_READ_RANGE = "§1.1–1.4";

export const CYCLE_DAY: CycleDay = {
  date: TODAY,
  weekday: "周四",
  cycle: "C1",
  week: 1,
  type: "深度",
  subject: "programming-paradigms",
  course: COURSE_A,
  aux: "data-structures",
  auxCourse: COURSE_C,
  names: { [COURSE_A]: "CTM", [COURSE_B]: "离散", [COURSE_C]: "Effective C" },
  subjects: { "programming-paradigms": "范式", "discrete-math": "离散", "c-systems-programming": "C" },
  roles: { [COURSE_A]: "main", [COURSE_B]: "main", [COURSE_C]: "aux" },
  lessons: [
    { course: COURSE_A, id: "D2", content: "Ch2 §2.1 递归与迭代", done: true },
    { course: COURSE_B, id: "D5", content: "Ch3 §3.1 谓词与量词" },
    { course: COURSE_C, id: "D3", content: "Ch3 资源管理", done: true },
  ],
  overdue: [],
};

const NAMES = { [COURSE_A]: "CTM", [COURSE_B]: "离散", [COURSE_C]: "Effective C" };
const SUBJECTS = {
  "programming-paradigms": "范式",
  "discrete-math": "离散",
  "c-systems-programming": "C",
  "data-structures": "数据结构",
};
const ROLES = { [COURSE_A]: "main", [COURSE_B]: "main", [COURSE_C]: "aux" } as const;

/** `calendar.mjs month`: today's lessons carry the same `done` flags as `cycle.mjs day`. */
export const CYCLE_MONTH: CycleMonth = {
  month: "2026-11",
  days: {
    [AFTER_READ_DATE]: {
      cycle: "C1",
      week: 1,
      type: "深度",
      subject: "discrete-math",
      course: COURSE_B,
      aux: null,
      auxCourse: null,
    },
    [TODAY]: {
      cycle: "C1",
      week: 1,
      type: "深度",
      subject: "programming-paradigms",
      course: COURSE_A,
      aux: "data-structures",
      auxCourse: COURSE_C,
    },
  },
  lessons: {
    [AFTER_READ_DATE]: [{ course: COURSE_B, id: "D4", content: "Ch2 §2.4 证明方法", done: true }],
    [TODAY]: CYCLE_DAY.lessons,
  },
  names: NAMES,
  subjects: SUBJECTS,
  roles: ROLES,
  cycles: [{ cycle: "C1", start: "2026-11-06", end: "2026-12-24" }],
  recovery: [],
};

/** `calendar.mjs month` content: the unread 讲后读 sits on the day it was scheduled. */
export const CALENDAR_MONTH: CalendarMonth = {
  month: "2026-11",
  days: {
    [AFTER_READ_DATE]: {
      records: [{ course: COURSE_B, heading: "Ch2 §2.4 证明方法" }],
      plans: [],
      readingDue: [{ slug: `${COURSE_B}#讲后读-1`, title: AFTER_READ_TITLE }],
      log: [],
      note: null,
    },
    [TODAY]: {
      records: [
        { course: COURSE_A, heading: "Ch2 §2.1 递归与迭代" },
        { course: COURSE_C, heading: "Ch3 资源管理" },
      ],
      plans: [{ course: COURSE_B, label: "D5 Ch3 §3.1 谓词与量词" }],
      readingDue: [],
      log: [],
      note: null,
    },
  },
};

/** `cycle.mjs overview`: A's 已完成数 already counts today's lesson. */
export const OVERVIEW: CycleOverview = {
  date: TODAY,
  route: {
    start: "2026-11-06",
    end: "2028-07-20",
    bufferWeeks: 12,
    weeksLeft: 88,
    cycles: [
      {
        id: "C1",
        start: "2026-11-06",
        end: "2026-12-24",
        main: ["离散数学", "编程语言与编程范式"],
        aux: ["数据结构与算法", "C 与系统编程"],
        status: "进行中",
      },
      {
        id: "C2",
        start: "2026-12-25",
        end: "2027-02-11",
        main: ["数据结构与算法", "C 与系统编程"],
        aux: [],
        status: "未开始",
      },
    ],
    recovery: [{ start: "2027-02-12", end: "2027-02-18" }],
  },
  cycle: {
    cycle: "C1",
    title: "离散数学 + 编程语言与编程范式",
    start: "2026-11-06",
    end: "2026-12-24",
    plannedEnd: "2026-12-24",
    delayDays: 0,
    week: 1,
    weeks: 7,
    daysLeft: 43,
    next: { cycle: "C2", start: "2026-12-25" },
    subjects: SUBJECTS,
    auxSubjects: ["c-systems-programming", "data-structures"],
    subjectDays: {
      "discrete-math": ["周一", "周三"],
      "programming-paradigms": ["周二", "周四"],
      "c-systems-programming": ["周一", "周三"],
      "data-structures": ["周二", "周四"],
    },
  },
  courses: [
    {
      slug: COURSE_A,
      subject: "programming-paradigms",
      role: "main",
      name: "CTM",
      total: 14,
      done: 2,
      end: "2026-12-24",
      next: { id: "D3", date: "2026-11-17", content: "Ch3 §3.1 状态与作用域" },
      lessons: [
        { id: "D1", date: "2026-11-10", content: "Ch2 §1.4 数据流", done: true },
        { id: "D2", date: TODAY, content: "Ch2 §2.1 递归与迭代", done: true },
        { id: "D3", date: "2026-11-17", content: "Ch3 §3.1 状态与作用域", done: false },
      ],
    },
    {
      slug: COURSE_B,
      subject: "discrete-math",
      role: "main",
      name: "离散",
      total: 15,
      done: 2,
      end: "2026-12-23",
      next: { id: "D5", date: TODAY, content: "Ch3 §3.1 谓词与量词" },
      lessons: [
        { id: "D4", date: AFTER_READ_DATE, content: "Ch2 §2.4 证明方法", done: true },
        { id: "D5", date: TODAY, content: "Ch3 §3.1 谓词与量词", done: false },
        { id: "D6", date: "2026-11-16", content: "Ch3 §3.2 嵌套量词", done: false },
      ],
    },
    {
      slug: COURSE_C,
      subject: "c-systems-programming",
      role: "aux",
      name: "Effective C",
      total: 7,
      done: 1,
      end: "2026-12-23",
      next: { id: "D4", date: "2026-11-16", content: "Ch4 构造与析构" },
      lessons: [
        { id: "D3", date: TODAY, content: "Ch3 资源管理", done: true },
        { id: "D4", date: "2026-11-16", content: "Ch4 构造与析构", done: false },
      ],
    },
  ],
};

/** Anki is running: two decks, 20 + 22 cards due today (42). */
export const ANKI: AnkiStatus = {
  running: true,
  version: 6,
  reviewedToday: 12,
  due: [
    { deck: "离散", count: 20 },
    { deck: "Effective C", count: 22 },
  ],
};

/** The 书房's planned book is 2 days late; nothing read today. */
export const SHELF: ShelfToday = {
  planned: {
    slug: "how-to-solve-it",
    title: "How to Solve It",
    short: "HTSP",
    slot: "planned",
    total: 12,
    position: 3,
    // Block 4 is today's block: 3 read, so the 4th is next — the same block the
    // shelf's `schedule` carries on today below.
    chunk: { index: 4, title: "第 4 段", from: 28, to: 36 },
    coreOverlap: null,
    doneToday: false,
    doneChunk: null,
    resumedToday: false,
    plannedEnd: "2026-11-10",
    end: TODAY,
    late: 2,
  },
  free: null,
};

/**
 * `bookshelf.mjs list` for the same book — the planbook's 自读 row reads this.
 *
 * 11-06…11-10 are the past planned days of blocks 8–12 (not read, `missed`); today
 * carries the block after the 3 read ones, i.e. block 4, pp.28–36 — the same chunk
 * `SHELF.planned.chunk` names.
 */
export const SHELF_LIST: ShelfListItem[] = [
  {
    slug: "how-to-solve-it",
    title: "How to Solve It",
    short: "HTSP",
    slot: "planned",
    order: 1,
    status: "reading",
    total: 12,
    position: 3,
    started: "2026-10-30",
    end: TODAY,
    target: null,
    targetLate: null,
    extracts: [],
    coreRead: [],
    upcoming: [{ index: 4, date: TODAY, title: "第 4 段", from: 28, to: 36 }],
    schedule: [
      { index: 8, date: "2026-11-06", title: "第 8 段", from: 64, to: 72, done: false, missed: true },
      { index: 9, date: "2026-11-07", title: "第 9 段", from: 73, to: 81, done: false, missed: true },
      { index: 10, date: "2026-11-08", title: "第 10 段", from: 82, to: 90, done: false, missed: true },
      { index: 11, date: "2026-11-09", title: "第 11 段", from: 91, to: 99, done: false, missed: true },
      { index: 12, date: "2026-11-10", title: "第 12 段", from: 100, to: 108, done: false, missed: true },
      { index: 4, date: TODAY, title: "第 4 段", from: 28, to: 36, done: false },
    ],
  },
];

/** The reading queue is empty: this fixture is about lessons, 讲后读 and Anki. */
export const QUEUE: ReadingQueueItem[] = [];
