/**
 * The messages that create a course or change its plan.
 *
 * Course files are read-only in the interface: creating and re-planning are
 * the `course` skill's job, so the panel only composes a clear request and
 * hands it to 学根 (in the course's own session). Pure, so it is tested.
 */

import type { TeachingStyle } from "@shared/protocol.js";

/** What the 「新课程」 form collects. */
export interface NewCourseRequest {
  title: string;
  /** Vault path(s) or URL(s) of the material; may be empty (学根 will ask). */
  material: string;
  minutesPerDay: number;
  /** First study day, `YYYY-MM-DD`. */
  startDate: string;
  style: TeachingStyle;
}

const STYLE_NAMES: Record<TeachingStyle, string> = { plain: "大白话", detailed: "细讲", deep: "深度" };

/** The request that binds material, creates the course file and the first week's plan. */
export function newCoursePrompt(request: NewCourseRequest): string {
  const material = request.material.trim()
    ? `资料：${request.material.trim()}。`
    : "资料还没定，先问我要用什么资料。";
  return [
    `/skill:course 新建课程「${request.title.trim()}」。`,
    material,
    `每天学 ${request.minutesPerDay} 分钟，从 ${request.startDate} 开始，讲解风格「${STYLE_NAMES[request.style]}」。`,
    "请绑定资料、建课程文件、按天排出第一周计划并刷新课程看板；建好后先用三五行告诉我第一周安排，再开始第一课。",
  ].join("");
}

/** The request that changes an existing course's plan. */
export function editPlanPrompt(courseTitle: string, change: string): string {
  return `/skill:course 修改「${courseTitle}」的学习计划：${change.trim()}。改完后告诉我新的本周安排，并刷新课程看板。`;
}
