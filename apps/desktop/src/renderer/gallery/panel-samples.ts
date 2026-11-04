/**
 * Fixed samples for the F2 panel samples in the gallery.
 *
 * Each sample is a ready-state value for one board resource, so the gallery can
 * render every panel (and the 今天 window) without a vault. The calendar cells
 * are the real November-2026 grid, so the calendar sample matches the design.
 */

import type { AnkiStatus, CardsStats, CourseSummary, ReadingItem, ReadingSource, ReadingStats, SkillInfo, SkillReview } from "@shared/data-protocol.js";
import { monthGrid } from "../core/board/use-calendar.js";
import type { ShellPanels } from "../skins/contract.js";

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
    overall: { done: 3, total: 6 },
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
  { path: "Clippings/MapReduce 论文导读.md", name: "MapReduce 论文导读", modifiedAt: 2 },
  { path: "raw/articles/ctm-ch3.md", name: "ctm-ch3", modifiedAt: 1 },
];

/** The real November-2026 grid, so the calendar sample matches the design. */
export const SAMPLE_CALENDAR_CELLS = monthGrid("2026-11");

const noop = (): void => undefined;
const noopAsync = (): Promise<null> => Promise.resolve(null);

/** The sample panel view models the Shell's side windows draw. */
export const SAMPLE_PANELS: ShellPanels = {
  today: {
    todayPlan: [
      { kind: "plan", label: "CTM 7 周", detail: "W1 计划 · 读 1.3" },
      { kind: "record", label: "编程范式", detail: "2026-11-03-01" },
      { kind: "reading", label: "CTM 第 2 章", detail: "CTM 第 2 章" },
    ],
    readingDue: { status: "ready", value: SAMPLE_READING },
    cards: { status: "ready", value: SAMPLE_CARDS },
    resume: null,
    onResume: noop,
    agentReady: true,
  },
  progress: {
    courses: { status: "ready", value: SAMPLE_COURSES },
    courseStyles: { ctm: "plain" },
    onCourseStyle: noop,
    onStudy: noop,
    onNewCourse: noop,
    onEditPlan: noop,
    sources: { status: "ready", value: SAMPLE_SOURCE_FILES },
  },
  reading: {
    queue: { status: "ready", value: SAMPLE_SOURCES },
    sources: { status: "ready", value: SAMPLE_SOURCE_FILES },
    onAdd: noopAsync,
    onClip: noop,
    onReview: noop,
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
