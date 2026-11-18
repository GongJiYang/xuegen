/**
 * 「库检查」的视图模型（logic-ui-1116.html A ③）：上次结果、两组的问题行，
 * 以及「交给总控」的 prompt。纯函数，不碰 DOM。
 */

import type { CheckProblem, CheckResult } from "@shared/data-protocol.js";
import type { SkillsPanelProps } from "../../skins/contract.js";
import { strings } from "../strings.js";
import { withActionMarker } from "../chat/action-marker.js";
import { checkStrings } from "./strings.js";

export interface CheckGroup {
  title: string;
  hint: string;
  count: number;
  lines: string[];
}

export interface CheckView {
  last: string;
  button: string;
  running: boolean;
  status: string | null;
  groups: CheckGroup[];
  hasProblems: boolean;
}

/** One problem's line: 「ctm · 课程页不是只读」; paths never appear. */
export function problemLine(problem: CheckProblem): string {
  const text = checkStrings.kinds[problem.kind] ?? checkStrings.unknown;
  return problem.where === null ? text : `${problem.where} · ${text}`;
}

/** The local `MM-DD HH:mm` the result was checked at. */
function stamp(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function group(title: string, hint: string, problems: CheckProblem[]): CheckGroup {
  return { title, hint, count: problems.length, lines: problems.map(problemLine) };
}

/** What the block shows: last check line, button, status, and the two groups. */
export function checkView(result: CheckResult | null, running: boolean, error: string | null): CheckView {
  const status = running ? checkStrings.running : error !== null ? checkStrings.failed(error) : null;
  const groups =
    result === null
      ? []
      : [
          group(checkStrings.vault, checkStrings.vaultHint, result.vault),
          group(checkStrings.courses, checkStrings.coursesHint, result.courses),
        ];
  return {
    last: result === null ? checkStrings.never : checkStrings.last(stamp(result.checkedAt)),
    button: result === null ? checkStrings.run : checkStrings.rerun,
    running,
    status,
    groups,
    hasProblems: groups.some((item) => item.count > 0),
  };
}

/** Where a problem sits in the prompt: its page, else the 看板 / 课程目录 / 库 it is about. */
function whereOf(problem: CheckProblem): string {
  if (problem.where !== null) return problem.where;
  if (problem.area === "vault") return checkStrings.vaultWhere;
  return problem.kind.startsWith("board-") ? checkStrings.boardWhere : checkStrings.coursesWhere;
}

/** 「交给总控」发进聊天的话：逐条问题（库在前），最后是照做的确认行。 */
export function checkAskPrompt(result: CheckResult): string {
  const problems = [...result.vault, ...result.courses].map(
    (problem) => `- ${whereOf(problem)}：${problem.kind}，${problem.detail}`,
  );
  const text = [checkStrings.askIntro, ...problems, "", strings.panel.askConfirm].join("\n");
  return withActionMarker(text, "ask", { slug: "check", title: checkStrings.askTitle });
}

/** 总控里给「库检查」接上「交给总控」：有问题且在总控时才有按钮。 */
export function withCheckAsk<P extends { check?: SkillsPanelProps["check"] }>(
  panel: P,
  result: CheckResult | null,
  send: ((text: string) => void) | null,
): P {
  if (send === null || result === null || panel.check?.hasProblems !== true) return panel;
  return { ...panel, check: { ...panel.check, onAsk: () => send(checkAskPrompt(result)) } };
}
