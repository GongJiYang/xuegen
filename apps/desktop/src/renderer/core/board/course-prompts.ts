/**
 * The messages that create a course or change its plan.
 *
 * Course files are read-only in the interface: creating and re-planning are
 * the `course` skill's job, so the panel only composes a clear request and
 * hands it to 学根 (in the course's own session). Pure, so it is tested.
 */

import type { TeachingStyle } from "@shared/protocol.js";
import type { CourseSummary } from "@shared/data-protocol.js";
import { courseFileHint } from "../today.js";

/** Where a course sits in the current study cycle, when it is planned from the cycle view. */
export interface CyclePlacement {
  /** 「C1」. */
  cycle: string;
  /** Subject slug and display name. */
  subject: string;
  subjectName: string;
  role: "main" | "aux";
  /** The subject's days in the weekly template: 「周一」「周三」. */
  days: string[];
  /** The cycle's last day, `YYYY-MM-DD`. */
  end: string;
}

/** What the 「新课程」 form collects. */
export interface NewCourseRequest {
  title: string;
  /** Vault path(s) or URL(s) of the material; may be empty (学根 will ask). */
  material: string;
  /** First study day, `YYYY-MM-DD`. */
  startDate: string;
  /** Deadline: the last day new content may be scheduled, `YYYY-MM-DD`. */
  endDate: string;
  /** Rest days, in `course-schedule.mjs --rest` form. */
  rest: RestDays;
  /** How the original text is used: 带读 / 先读后讲 / 边读边讲. */
  reading: ReadingMode;
  style: TeachingStyle;
  /** Set when planned from the cycle view: dates come from the cycle, not the form. */
  cycle?: CyclePlacement;
}

/** The rest-day choices the form offers (values are `course-schedule.mjs --rest`). */
export const REST_DAYS = ["none", "sun", "sat,sun"] as const;
export type RestDays = (typeof REST_DAYS)[number];

/** How a course uses the original text (the `course` skill's 「原书」 line). */
export const READING_MODES = ["guided", "read-first", "read-along"] as const;
export type ReadingMode = (typeof READING_MODES)[number];

const READING_NAMES: Record<ReadingMode, string> = { guided: "带读", "read-first": "先读后讲", "read-along": "边读边讲" };

const REST_NAMES: Record<RestDays, string> = { none: "不休息", sun: "周日休息", "sat,sun": "周六日休息" };

/** The default deadline: four weeks after the start date (`YYYY-MM-DD`, local calendar). */
export function defaultEndDate(startDate: string): string {
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return startDate;
  const end = new Date(Date.UTC(y, m - 1, d + 28));
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
}

const STYLE_NAMES: Record<TeachingStyle, string> = { plain: "大白话", detailed: "细讲", deep: "深度" };

/** The request that binds material, creates the course file and a day-by-day plan to the deadline. */
export function newCoursePrompt(request: NewCourseRequest): string {
  const material = request.material.trim()
    ? `资料：${request.material.trim()}。`
    : "资料还没定，先问我要用什么资料。";
  if (request.cycle) {
    const placement = request.cycle;
    const role = placement.role === "aux" ? "辅助" : "主项";
    const length =
      placement.role === "aux"
        ? "每节不超过 45 分钟、只做了解、不出检查题"
        : "每节 90 分钟、按教材章节切课次、不估时长；讲后读原书核心页";
    return [
      `/skill:course 新建课程「${request.title.trim()}」。`,
      material,
      `这是 ${placement.cycle} ${role}课（科目：${placement.subjectName}），只排在${placement.days.join("、")}，${length}，从今天之后第一个上课日排到 ${placement.end}（${placement.cycle} 结束），排不下的留到下个周期；原书「${READING_NAMES[request.reading]}」，讲解风格「${STYLE_NAMES[request.style]}」。`,
      "按 course 技能「学习周期里的课」排期（--days 用这几天，--reviews anki），建好后在科目页资料行补短名链接，并跑 cycle.mjs check。",
      "建好后先用三五行告诉我本周期能学到哪里，再开始第一课。",
    ].join("");
  }
  return [
    `/skill:course 新建课程「${request.title.trim()}」。`,
    material,
    `从 ${request.startDate} 开始，${request.endDate} 前学完，${REST_NAMES[request.rest]}，原书「${READING_NAMES[request.reading]}」，讲解风格「${STYLE_NAMES[request.style]}」。`,
    "每节时长由你按资料难度和篇幅估，写在每个课次里；教材有目录就按目录切课次。",
    `请绑定资料、建课程文件，列出课次后用 course-schedule.mjs 排出到截止日期的逐日计划（--start ${request.startDate} --end ${request.endDate} --rest ${request.rest}，含间隔复习），并刷新课程看板；`,
    "建好后先用三五行告诉我第一周安排和截止日期，再开始第一课。",
  ].join("");
}

/** The request that changes an existing course's plan. */
export function editPlanPrompt(course: Pick<CourseSummary, "slug" | "title" | "file">, change: string): string {
  return `/skill:course 修改「${course.title}」的学习计划：${change.trim()}。改完后告诉我新的本周安排，并刷新课程看板。${courseFileHint(course)}`;
}
