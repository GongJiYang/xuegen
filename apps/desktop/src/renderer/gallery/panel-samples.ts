/**
 * Fixed samples for the F2 panel samples in the gallery.
 *
 * Each sample is a ready-state value for one board resource, so the gallery can
 * render every panel (and the 今天 window) without a vault. The calendar cells
 * are the real November-2026 grid, so the calendar sample matches the design.
 */

import type { AnkiStatus, CalendarMonth, CardsStats, CourseSummary, CycleDay, CycleMonth, CycleOverview, ReadingItem, ReadingSource, ReadingStats, ShelfListItem, ShelfToday, SkillInfo, SkillReview, SubjectsOverview } from "@shared/data-protocol.js";
import { groupProgress } from "../core/board/progress-groups.js";
import { shelfPanel, type ShelfPanelView } from "../core/board/shelf-view.js";
import { monthGrid } from "../core/board/use-calendar.js";
import { controlCard, withExtractCount, withPendingRead, withPendingShelf, type ControlCardView } from "../core/board/control-card.js";
import type { SessionGroup, SessionRow } from "../core/board/session-list.js";
import type { SessionsView, ShellPanels } from "../skins/contract.js";

export const SAMPLE_READING: ReadingStats = {
  reading: { queued: 3, active: 2, paused: 0, done: 1 },
  dueToday: 2,
  overdue: 1,
  reviewsLast7: 5,
  cardsPending: 2,
};

export const SAMPLE_CARDS: CardsStats = {
  total: 469,
  unsynced: 277,
  broken: 0,
  decks: [
    { deck: "MME", total: 100, unsynced: 26, files: [] },
    { deck: "Link", total: 144, unsynced: 46, files: [] },
    { deck: "Mathematics", total: 211, unsynced: 6, files: [] },
  ],
  pendingExtracts: 2,
};

export const SAMPLE_ANKI: AnkiStatus = { running: true, version: 6, reviewedToday: 86, due: [] };

export const SAMPLE_COURSES: CourseSummary[] = [
  {
    slug: "ctm",
    title: "CTM 7 周",
    weekLabel: "W1 基础概念",
    week: {
      done: 1,
      total: 4,
      tasks: [
        { label: "能说出单赋值存储的含义", done: true },
        { label: "解释合一与赋值的区别", done: false },
        { label: "完成 1.3 习题 2 道", done: false },
      ],
    },
    overall: { done: 1, total: 5 },
    lastRecord: { date: "2026-10-16", seq: "01" },
    nextSession: "1.3 合一（unification），先复习单赋值。",
    styleHint: null,
  },
  {
    slug: "programming-paradigms",
    title: "编程范式",
    weekLabel: "W1 核心思想",
    week: { done: 3, total: 5, tasks: [{ label: "说清声明式 vs 命令式", done: true }] },
    overall: { done: 6, total: 6 },
    lastRecord: { date: "2026-11-03", seq: "01" },
    nextSession: "Erlang 进程模型",
    styleHint: null,
  },
];

export const SAMPLE_SOURCES: ReadingItem[] = [
  { slug: "ctm-ch2", title: "CTM 第 2 章 声明式计算模型", priority: "high", due: "2026-11-06", position: "第 3 页 / 共 26 页", status: "active" },
  { slug: "jepa", title: "LeCun — A Path Towards Autonomous Machine Intelligence", priority: "medium", due: "2026-11-06", position: "", status: "queued" },
];

/** A pending third-party skill as the review dialog shows it. */
export const SAMPLE_SKILL_REVIEW: SkillReview = {
  name: "pretty-mermaid",
  description: "把 Mermaid 渲染成终端字符图或 SVG。",
  url: "https://github.com/imxv/Pretty-mermaid-skills",
  commit: "3f2c1a9e8b7d6c5f4e3d2c1b0a998877665544aa",
  subdir: "skills/pretty-mermaid",
  skillMd: "---\nname: pretty-mermaid\ndescription: 把 Mermaid 渲染成终端字符图或 SVG。\n---\n\n# Pretty Mermaid\n\n运行 scripts/render.mjs …",
  files: [
    { path: "SKILL.md", size: 4096, executable: false },
    { path: "scripts/render.mjs", size: 2210, executable: true },
  ],
  lint: { errors: ["description 超过 1024 字符"], warnings: [] },
};

export const SAMPLE_SKILLS: SkillInfo[] = [
  { name: "teach", description: "按课程计划讲解、出检验题；遵守风格。", source: "builtin", enabled: true },
  { name: "reading", description: "渐进阅读队列：加入、今日、读完。", source: "builtin", enabled: true },
  { name: "article", description: "把学习成果整理成文章架构。", source: "builtin", enabled: false },
  { name: "my-skill", description: "个人技能。", source: "personal", enabled: true },
  { name: "remote-skill", description: "待审核技能。", source: "pending", enabled: false },
];

/** The candidate reading sources the add form offers. */
export const SAMPLE_SOURCE_FILES: ReadingSource[] = [
  { path: "raw/papers/jepa.pdf", name: "jepa", modifiedAt: 3 },
  { path: "clippings/MapReduce 论文导读.md", name: "MapReduce 论文导读", modifiedAt: 2 },
  { path: "raw/articles/ctm-ch3.md", name: "ctm-ch3", modifiedAt: 1 },
];

/** A day outside every cycle: the 今天 window keeps its plain layout. */
export const SAMPLE_CYCLE_OUTSIDE: CycleDay = {
  date: "2026-11-05",
  weekday: "周四",
  cycle: null,
  week: null,
  type: null,
  subject: null,
  course: null,
  aux: null,
  auxCourse: null,
  names: {},
  subjects: {},
  roles: {},
  lessons: [],
  overdue: [],
};

/** A 深度 day: today's lesson, one carried over from Monday, one missed in the other course. */
export const SAMPLE_CYCLE_DAY: CycleDay = {
  date: "2026-11-11",
  weekday: "周三",
  cycle: "C1",
  week: 1,
  type: "深度",
  subject: "discrete-math",
  course: "discrete-math-epp",
  aux: null,
  auxCourse: null,
  names: { "discrete-math-epp": "离散", ctm: "CTM" },
  subjects: { "discrete-math": "离散", "programming-paradigms": "范式" },
  roles: { "discrete-math-epp": "main", ctm: "main" },
  lessons: [{ course: "discrete-math-epp", id: "D3", content: "Ch2 §2.3：有效论证、推理规则、谬误" }],
  overdue: [
    { course: "discrete-math-epp", id: "D2", date: "2026-11-09", content: "Ch2 §2.1–2.2：真值表、逻辑等价、条件语句与逆否" },
    { course: "ctm", id: "D1", date: "2026-11-10", content: "Ch1 概念阶梯 + Ch2 §2.2–2.3" },
  ],
};

/** The first cycle week of November 2026, for the calendar's day-type labels. */
export const SAMPLE_CYCLE_MONTH: CycleMonth = {
  month: "2026-11",
  days: {
    "2026-11-06": { cycle: "C1", week: 1, type: "整合", subject: null, course: null, aux: null, auxCourse: null },
    "2026-11-07": { cycle: "C1", week: 1, type: "低强度", subject: null, course: null, aux: null, auxCourse: null },
    "2026-11-08": { cycle: "C1", week: 1, type: "休息", subject: null, course: null, aux: null, auxCourse: null },
    "2026-11-09": { cycle: "C1", week: 1, type: "深度", subject: "discrete-math", course: "discrete-math-epp", aux: "c-systems-programming", auxCourse: "effective-c" },
    "2026-11-10": { cycle: "C1", week: 1, type: "深度", subject: "programming-paradigms", course: "ctm", aux: "data-structures", auxCourse: null },
    "2026-11-11": { cycle: "C1", week: 1, type: "深度", subject: "discrete-math", course: "discrete-math-epp", aux: "c-systems-programming", auxCourse: null },
    "2026-11-12": { cycle: "C1", week: 1, type: "深度", subject: "programming-paradigms", course: "ctm", aux: "data-structures", auxCourse: null },
  },
  lessons: {
    "2026-11-06": [{ course: "discrete-math-epp", id: "D1", content: "Ch1 全章：变量、三类陈述、集合、关系与函数" }],
    "2026-11-09": [
      { course: "discrete-math-epp", id: "D2", content: "Ch2 §2.1–2.2：真值表、逻辑等价" },
      { course: "effective-c", id: "D1", content: "Ch1 起步" },
    ],
    "2026-11-10": [{ course: "ctm", id: "D1", content: "Ch1 概念阶梯 + Ch2 §2.2–2.3" }],
  },
  names: { "discrete-math-epp": "离散", ctm: "CTM", "effective-c": "Effective C" },
  subjects: { "discrete-math": "离散", "programming-paradigms": "范式", "c-systems-programming": "C", "data-structures": "数据结构" },
  roles: { "discrete-math-epp": "main", ctm: "main", "effective-c": "aux" },
  cycles: [{ cycle: "C1", start: "2026-11-06", end: "2026-12-24" }],
  recovery: [],
};

/** 总进度 top: the route, C1 and its two courses. */
export const SAMPLE_OVERVIEW: CycleOverview = {
  date: "2026-11-06",
  route: {
    start: "2026-11-06",
    end: "2028-07-20",
    bufferWeeks: 12,
    weeksLeft: 89,
    cycles: [
      { id: "C1", start: "2026-11-06", end: "2026-12-24", main: ["离散数学", "编程语言与编程范式"], aux: ["数据结构与算法", "C 与系统编程"], status: "进行中" },
      { id: "C2", start: "2026-12-25", end: "2027-02-11", main: ["数据结构与算法", "C 与系统编程"], aux: ["计算机体系结构", "计算理论"], status: "未开始" },
      { id: "C3", start: "2027-02-19", end: "2027-04-08", main: ["计算机体系结构", "计算理论"], aux: ["操作系统", "并发编程"], status: "未开始" },
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
    daysLeft: 48,
    next: { cycle: "C2", start: "2026-12-25" },
    subjects: { "discrete-math": "离散", "programming-paradigms": "范式", "c-systems-programming": "C", "data-structures": "数据结构" },
    auxSubjects: ["c-systems-programming", "data-structures"],
    subjectDays: { "discrete-math": ["周一", "周三"], "programming-paradigms": ["周二", "周四"], "c-systems-programming": ["周一", "周三"], "data-structures": ["周二", "周四"] },
  },
  courses: [
    { slug: "discrete-math-epp", subject: "discrete-math", role: "main", name: "离散", total: 15, done: 0, end: "2026-12-23", next: { id: "D1", date: "2026-11-06", content: "Ch1 全章：变量、三类陈述、集合、关系与函数" }, lessons: [{ id: "D1", date: "2026-11-06", content: "Ch1 全章", done: false }, { id: "D2", date: "2026-11-09", content: "Ch2 真值表", done: false }, { id: "D3", date: "2026-11-11", content: "Ch2 有效论证", done: false }, { id: "D4", date: "2026-11-16", content: "Ch3 量词", done: false }] },
    { slug: "ctm", subject: "programming-paradigms", role: "main", name: "CTM", total: 14, done: 0, end: "2026-12-24", next: { id: "D1", date: "2026-11-10", content: "Ch1 概念阶梯 + Ch2 §2.2–2.3" }, lessons: [] },
    { slug: "effective-c", subject: "c-systems-programming", role: "aux", name: "Effective C", total: 7, done: 0, end: "2026-12-23", next: { id: "D1", date: "2026-11-09", content: "Ch1 起步" }, lessons: [] },
  ],
};

/** A small subject skeleton: one main subject with two courses, one subject only with ingested material. */
export const SAMPLE_SUBJECTS: SubjectsOverview = {
  date: "2026-11-06",
  cycle: { cycle: "C1", week: 1, weeks: 7, aux: "（空）；（空）——路线原定数据结构与算法、C 与系统编程" },
  subjects: [
    {
      slug: "discrete-math",
      title: "离散数学",
      layer: "A 数学与理论基础",
      route: "C1 主项",
      main: true,
      defaultStyle: "detailed",
      courses: ["discrete-math-epp"],
      materials: [
        { type: "书籍", mark: "now", status: "学习中", role: "主线", title: "Discrete Mathematics and Its Applications", course: "discrete-math-epp" },
        { type: "书籍", mark: "none", status: "未制定计划", role: "参考", title: "Concrete Mathematics", course: null },
      ],
    },
    {
      slug: "programming-paradigms",
      title: "编程语言与编程范式",
      layer: "A 数学与理论基础",
      route: "C1 主项",
      main: true,
      defaultStyle: null,
      courses: ["ctm", "programming-paradigms"],
      materials: [
        { type: "书籍", mark: "now", status: "学习中", role: "主线", title: "CTM", course: "ctm" },
        { type: "书籍", mark: "none", status: "未制定计划", role: "主线（进阶）", title: "SICP", course: null },
        { type: "在线书籍", mark: "none", status: "未制定计划", role: "练习", title: "Seven Languages in Seven Weeks", course: null },
      ],
    },
    {
      slug: "software-engineering",
      title: "软件工程",
      layer: "D 工程与职业能力",
      route: "C10 主项",
      main: false,
      defaultStyle: null,
      courses: [],
      materials: [{ type: "文章", mark: "done", status: "已摄取", role: "参考", title: "Command Pattern", course: null }],
    },
  ],
};

/** SAMPLE_SUBJECTS grouped as on 2026-11-06 (ctm last studied 10-16, so it is marked !). */
export const SAMPLE_GROUPS = groupProgress(SAMPLE_SUBJECTS, SAMPLE_COURSES, "2026-11-06");

/** The real November-2026 grid, so the calendar sample matches the design. */
export const SAMPLE_CALENDAR_CELLS = monthGrid("2026-11");

/** Two day-groups of session rows, for the title list and the calendar's 这天的会话. */
export const SAMPLE_SESSION_GROUPS: SessionGroup[] = [
  {
    date: "2026-11-05",
    label: "今天 · 11-05 周四",
    rows: [
      { file: "/s/a.jsonl", time: "09:12", kind: "course", slug: "ctm", tag: "CTM", title: "D2 Ch2 §2.1–2.2：合一", count: 9, current: true },
      { file: "/s/b.jsonl", time: "08:30", kind: "control", slug: null, tag: "总控", title: "今日简报", count: 3, current: false },
    ],
  },
  {
    date: "2026-11-04",
    label: "昨天 · 11-04 周三",
    rows: [
      { file: "/s/c.jsonl", time: "21:02", kind: "course", slug: "discrete-math-epp", tag: "离散", title: "D1 Ch1 全章", count: 14, current: false },
      { file: "/s/d.jsonl", time: "16:40", kind: "free", slug: null, tag: "自由", title: "帮我理解递归", count: 4, current: false },
    ],
  },
];

/** The 讲后读 rows the 总控 今日卡 reads out of the calendar month. */
const CONTROL_CALENDAR: CalendarMonth = {
  month: "2026-11",
  days: {
    "2026-11-10": {
      records: [],
      plans: [],
      readingDue: [{ slug: "ctm#讲后读-1", title: "讲后读 · Ch2 §2.2 · CTM" }],
      log: [],
      note: null,
    },
    "2026-11-11": {
      records: [],
      plans: [],
      readingDue: [{ slug: "discrete-math-epp#讲后读-2", title: "讲后读 · §1.1–1.4 · 离散数学（Epp, 5th ed）" }],
      log: [],
      note: null,
    },
  },
};

/** The samples below sit inside C1, so the card never comes back null. */
function must(view: ControlCardView | null): ControlCardView {
  if (view === null) throw new Error("controlCard sample is outside a cycle");
  return view;
}

/** 今日卡 · 深度日：主项 + 辅助 + 没学 + 讲后读（逾期与今天）+ Anki。 */
export const SAMPLE_CONTROL_CARD = must(controlCard({
  today: "2026-11-11",
  day: {
    ...SAMPLE_CYCLE_DAY,
    lessons: [
      { course: "discrete-math-epp", id: "D3", content: "Ch2 §2.3：有效论证、推理规则、谬误" },
      { course: "effective-c", id: "D1", content: "Ch1 起步" },
    ],
    roles: { "discrete-math-epp": "main", ctm: "main", "effective-c": "aux" },
    names: { "discrete-math-epp": "离散", ctm: "CTM", "effective-c": "Effective C" },
  },
  calendar: CONTROL_CALENDAR,
  queue: [],
}));

/** 今日卡 · 低强度日：读书 + Anki。 */
export const SAMPLE_CONTROL_CARD_LIGHT = must(controlCard({
  today: "2026-11-11",
  day: { ...SAMPLE_CYCLE_DAY, type: "低强度", subject: null, course: null, lessons: [], overdue: [] },
  calendar: CONTROL_CALENDAR,
  queue: SAMPLE_SOURCES,
}));

/** 今日卡 · 「读完了」等撤销：该行变 ✓ + 「撤销 · N」。 */
export const SAMPLE_CONTROL_CARD_PENDING = withPendingRead(SAMPLE_CONTROL_CARD, {
  slug: "discrete-math-epp",
  labels: ["§1.1–1.4"],
  left: 7,
});

/** 书房在读：Epp 第 2 段（晚了 1 天、含讲后读重叠页）；计划外空着。 */
export const SAMPLE_SHELF_TODAY: ShelfToday = {
  planned: {
    slug: "epp",
    title: "Discrete Mathematics and Its Applications",
    short: "Epp",
    slot: "planned",
    total: 81,
    position: 1,
    chunk: { index: 2, title: "Ch1 §1.1–1.4", from: 10, to: 18 },
    coreOverlap: "pp.12–15",
    doneToday: false,
    doneChunk: null,
    resumedToday: false,
    plannedEnd: "2027-01-28",
    end: "2027-01-29",
    late: 1,
  },
  free: null,
};

/** 今日卡 · 深度日 + 书房行：Epp 待读（计划外空着，今日卡不提示）。 */
export const SAMPLE_CONTROL_CARD_SHELF = must(controlCard({
  today: "2026-11-11",
  day: {
    ...SAMPLE_CYCLE_DAY,
    lessons: [
      { course: "discrete-math-epp", id: "D3", content: "Ch2 §2.3：有效论证、推理规则、谬误" },
      { course: "effective-c", id: "D1", content: "Ch1 起步" },
    ],
    roles: { "discrete-math-epp": "main", ctm: "main", "effective-c": "aux" },
    names: { "discrete-math-epp": "离散", ctm: "CTM", "effective-c": "Effective C" },
  },
  calendar: CONTROL_CALENDAR,
  queue: [],
  shelf: SAMPLE_SHELF_TODAY,
}));

/** 今日卡 · 书房行今天已记：✓ + 「摘几句」，本次运行已摘 1 句。 */
export const SAMPLE_CONTROL_CARD_SHELF_DONE = withExtractCount(
  must(controlCard({
    today: "2026-11-11",
    day: SAMPLE_CYCLE_DAY,
    calendar: CONTROL_CALENDAR,
    queue: [],
    shelf: {
      planned: SAMPLE_SHELF_TODAY.planned === null ? null : {
        ...SAMPLE_SHELF_TODAY.planned,
        position: 2,
        chunk: { index: 3, title: "Ch1 §1.5–1.8", from: 19, to: 27 },
        doneToday: true,
        doneChunk: { index: 2, title: "Ch1 §1.1–1.4", from: 10, to: 18 },
      },
      free: null,
    },
  })),
  { epp: 1 },
);

/** 今日卡 · 「读完这段」等撤销：该行变 ✓ + 「已记下」+「撤销 · N」。 */
export const SAMPLE_CONTROL_CARD_SHELF_PENDING = withPendingShelf(SAMPLE_CONTROL_CARD_SHELF, {
  slug: "epp",
  left: 7,
});

/** 书房 list 样例（batch-shelf-2c）：Epp 在读 + CTM 排队，日期对齐 2026-11-11。 */
export const SAMPLE_SHELF_LIST: ShelfListItem[] = [
  {
    slug: "epp",
    title: "Discrete Mathematics and Its Applications",
    short: "Epp",
    slot: "planned",
    order: 1,
    status: "reading",
    total: 81,
    position: 1,
    started: "2026-11-10",
    end: "2027-01-28",
    target: null,
    targetLate: null,
    extracts: [
      { index: 1, page: 14, text: "A universal statement says that a certain property is true for all elements of a set.", carded: "2026-11-09" },
      { index: 2, page: 16, text: "An existential statement says that there is at least one thing for which the property is true.", carded: null },
      { index: 3, page: 17, text: "The most common way to prove a universal statement is by generalizing from the generic particular.", carded: null },
    ],
    coreRead: [
      { pages: "12–15", course: "discrete-math-epp", label: "§1.3 变量与量化", date: "2026-11-09" },
      { pages: "3–5", course: "discrete-math-epp", label: "§1.1 命题形式", date: "2026-11-06" },
    ],
    upcoming: [
      { index: 2, date: "2026-11-11", title: "Ch1 §1.1–1.4", from: 10, to: 18 },
      { index: 3, date: "2026-11-12", title: "Ch1 §1.5–1.8", from: 19, to: 27 },
      { index: 4, date: "2026-11-13", title: "Ch2 §2.1–2.2", from: 28, to: 36 },
      { index: 5, date: "2026-11-14", title: "Ch2 §2.3–2.4", from: 37, to: 45 },
      { index: 6, date: "2026-11-15", title: "Ch2 §2.5", from: 46, to: 52 },
    ],
  },
  {
    slug: "ctm",
    title: "Concepts, Techniques, and Models of Computer Programming",
    short: "CTM",
    slot: "planned",
    order: 2,
    status: "queued",
    total: 79,
    position: 0,
    started: "",
    end: "2027-01-28",
    target: null,
    targetLate: null,
    extracts: [],
    coreRead: [],
    upcoming: [
      { index: 1, date: "2026-11-11", title: "Ch1 §1.1–1.5", from: 1, to: 9 },
      { index: 2, date: "2026-11-12", title: "Ch1 §1.6–1.10", from: 10, to: 18 },
      { index: 3, date: "2026-11-13", title: "Ch1 §1.11–1.15", from: 19, to: 27 },
      { index: 4, date: "2026-11-14", title: "Ch1 §1.16–1.18", from: 28, to: 34 },
      { index: 5, date: "2026-11-15", title: "Ch2 §2.1", from: 35, to: 43 },
    ],
  },
];

/** 书房全空时的面板值（list 为空 → planned/free 都没有、queue 空）。 */
export const SAMPLE_SHELF_EMPTY: ShelfPanelView = shelfPanel([], "2026-11-11");

const noop = (): void => undefined;
const noopAsync = (): Promise<null> => Promise.resolve(null);

/** The SessionsView the Shell's title list and ⋯ menu open. */
export const SAMPLE_SESSIONS: SessionsView = {
  open: true,
  onOpenChange: noop,
  status: "ready",
  groups: SAMPLE_SESSION_GROUPS,
  onPick: noop,
  onNew: noop,
};

/** The rows a sampled day shows in the calendar's 这天的会话. */
const DAY_SESSIONS: Record<string, SessionRow[]> = {
  "2026-11-05": SAMPLE_SESSION_GROUPS[0]?.rows ?? [],
};

/** The sample panel view models the Shell's side windows draw. */
export const SAMPLE_PANELS: ShellPanels = {
  today: {
    todayPlan: [
      { kind: "plan", label: "CTM 7 周", detail: "W1 计划 · 读 1.3" },
      { kind: "record", label: "编程范式", detail: "2026-11-03-01" },
      { kind: "reading", label: "CTM 第 2 章", detail: "CTM 第 2 章" },
    ],
    tomorrowPlan: [
      { kind: "plan", label: "Python 装饰器入门", detail: "`@` 只是缩写" },
      { kind: "plan", label: "Python 装饰器入门", detail: "复习：函数是「东西」" },
    ],
    readingDue: { status: "ready", value: SAMPLE_READING },
    cards: { status: "ready", value: SAMPLE_CARDS },
    resume: null,
    startedToday: { ctm: true },
    cycleToday: { status: "ready", value: SAMPLE_CYCLE_OUTSIDE },
    cycleTomorrow: { status: "ready", value: SAMPLE_CYCLE_OUTSIDE },
    courses: { status: "ready", value: SAMPLE_COURSES },
    anki: { status: "ready", value: SAMPLE_ANKI },
    onStudyCourse: noop,
    onVerifyCourse: noop,
    onOpenControl: null,
    onResume: noop,
    agentReady: true,
  },
  progress: {
    courses: { status: "ready", value: SAMPLE_COURSES },
    courseStyles: { ctm: "plain" },
    startedToday: { ctm: true },
    onCourseStyle: noop,
    onStudy: noop,
    onNewCourse: noop,
    onEditPlan: noop,
    sources: { status: "ready", value: SAMPLE_SOURCE_FILES },
    groups: null,
    overview: { status: "ready", value: SAMPLE_OVERVIEW },
  },
  reading: {
    shelf: { status: "ready", value: shelfPanel(SAMPLE_SHELF_LIST, "2026-11-11") },
    queue: { status: "ready", value: SAMPLE_SOURCES },
    sources: { status: "ready", value: SAMPLE_SOURCE_FILES },
    onAdd: noopAsync,
    onClip: noop,
    onReview: noop,
    onShelfCards: noop,
  },
  cards: {
    cards: { status: "ready", value: SAMPLE_CARDS },
    anki: { status: "ready", value: SAMPLE_ANKI },
    onAdd: noop,
    onRetryAnki: noop,
    onDraft: noop,
  },
  calendar: {
    month: {
      status: "ready",
      value: {
        month: "2026-11",
        days: {
          "2026-11-05": {
            records: [{ course: "ctm", heading: "2026-11-05-01" }],
            plans: [],
            readingDue: [],
            log: [],
            note: "- [ ] 读 CTM 第 2 章前半\n- [ ] 复习 Anki",
          },
          "2026-11-03": {
            records: [{ course: "programming-paradigms", heading: "2026-11-03-01" }],
            plans: [{ course: "ctm", label: "W1 计划" }],
            readingDue: [],
            log: [],
            note: null,
          },
        },
      },
    },
    monthKey: "2026-11",
    onPrevMonth: noop,
    onNextMonth: noop,
    cells: SAMPLE_CALENDAR_CELLS,
    selected: "2026-11-05",
    onSelectDay: noop,
    onEditDay: noop,
    courseTitles: { ctm: "CTM 7 周", "programming-paradigms": "编程范式" },
    cycleMonth: { status: "ready", value: SAMPLE_CYCLE_MONTH },
    daySessions: (date) => DAY_SESSIONS[date] ?? [],
    onOpenSession: noop,
  },
  skills: {
    skills: { status: "ready", value: SAMPLE_SKILLS },
    onToggle: noop,
    onFetch: noop,
    fetchNotice: "已下载到待审核区：pretty-mermaid。点「审核」查看后再决定是否启用。",
    review: { status: "ready", value: SAMPLE_SKILL_REVIEW },
    onReview: noop,
    onCloseReview: noop,
    onEnableReviewed: noop,
    onDiscardReviewed: noop,
  },
};
