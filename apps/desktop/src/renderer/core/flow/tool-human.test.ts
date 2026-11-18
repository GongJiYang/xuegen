import { describe, expect, test } from "vitest";
import type { ToolCallView } from "@shared/protocol.js";
import { describeTool } from "./tool-human.js";

const names = { ctm: "CTM", "discrete-math-epp": "离散" };

function call(toolName: string, argsSummary: string): ToolCallView {
  return { toolCallId: "t", toolName, argsSummary, status: "success" };
}

interface Row {
  toolName: string;
  argsSummary: string;
  text: string;
  kind: string;
  step: { open?: number; close?: number };
}

const BOOK_ARGS = '{"command":"cd /v && pdftotext -f 145 -l 154 raw/books/ctm.pdf - | head"}';

const rows: Row[] = [
  {
    toolName: "read",
    argsSummary: '{"path":"/v/wiki/courses/ctm.md","offset":0}',
    text: "读课程页 CTM",
    kind: "course-page",
    step: { open: 2, close: 1 },
  },
  {
    toolName: "read",
    argsSummary: '{"path":"/v/wiki/courses/unknown-x.md"}',
    text: "读课程页 unknown-x",
    kind: "course-page",
    step: { open: 2, close: 1 },
  },
  {
    toolName: "bash",
    argsSummary: '{"command":"cd /v && cat wiki/profile.md 2>/dev/null"}',
    text: "读讲解偏好",
    kind: "prefs",
    step: { open: 2 },
  },
  {
    toolName: "bash",
    argsSummary: '{"command":"cd /v && grep -n -A 20 \\"讲解偏好\\" wiki/subjects/x.md"}',
    text: "读讲解偏好",
    kind: "prefs",
    step: { open: 2 },
  },
  {
    toolName: "course_close",
    argsSummary: '{"action":"shift","slug":"ctm","today":"2026-11-17"}',
    text: "顺延排期",
    kind: "shift",
    step: { open: 3 },
  },
  {
    toolName: "bash",
    argsSummary:
      '{"command":"cd /v && node /a/skills/cycle-plan/cycle.mjs day /v --date 2026-11-17 --json"}',
    text: "查今天的周期",
    kind: "cycle-day",
    step: { open: 4 },
  },
  {
    toolName: "bash",
    argsSummary: BOOK_ARGS,
    text: "读原书 pp.145–154",
    kind: "book",
    step: { open: 6 },
  },
  {
    toolName: "course_close",
    argsSummary: '{"action":"stage","slug":"ctm"}',
    text: "收课：建暂存",
    kind: "close",
    step: { close: 1 },
  },
  {
    toolName: "course_close",
    argsSummary: '{"action":"snapshot","slug":"ctm"}',
    text: "收课：生成截图",
    kind: "close",
    step: { close: 7 },
  },
  {
    toolName: "course_close",
    argsSummary: '{"action":"after-read","slug":"ctm"}',
    text: "收课：记课后读",
    kind: "close",
    step: { close: 8 },
  },
  {
    toolName: "course_close",
    argsSummary: '{"action":"archive","slug":"ctm"}',
    text: "收课：归档旧记录",
    kind: "close",
    step: { close: 8 },
  },
  {
    toolName: "course_close",
    argsSummary: '{"action":"check","slug":"ctm"}',
    text: "收课：校验",
    kind: "close",
    step: { close: 8 },
  },
  {
    toolName: "course_close",
    argsSummary: '{"action":"commit","slug":"ctm"}',
    text: "收课：提交",
    kind: "close",
    step: { close: 8 },
  },
  {
    toolName: "bash",
    argsSummary: '{"command":"cd /tmp && python3 -c \\"print(1)\\""}',
    text: "跑例子代码",
    kind: "code",
    step: {},
  },
  {
    toolName: "bash",
    argsSummary: '{"command":"cd /tmp && cat > demo.py <<\'EOF\'\\nimport sys"}',
    text: "跑例子代码",
    kind: "code",
    step: {},
  },
  {
    toolName: "read",
    argsSummary: '{"path":"/a/skills/course/SKILL.md","offset":0}',
    text: "读技能说明",
    kind: "skill",
    step: {},
  },
  {
    toolName: "read",
    argsSummary: '{"path":"/v/wiki/knowledge/concepts/x/tail-call.md"}',
    text: "读 tail-call",
    kind: "other",
    step: {},
  },
  {
    toolName: "bash",
    argsSummary: '{"command":"ls raw/books/"}',
    text: "运行命令",
    kind: "other",
    step: {},
  },
  {
    toolName: "write",
    argsSummary: '{"path":"/v/.close/x/wiki/courses/ctm.md"}',
    text: "写 ctm",
    kind: "other",
    step: {},
  },
];

describe("describeTool", () => {
  test.each(rows)("$toolName $argsSummary", (row) => {
    expect(describeTool(call(row.toolName, row.argsSummary), names)).toEqual({
      text: row.text,
      kind: row.kind,
      step: row.step,
    });
  });

  test("截断的 argsSummary 仍按字符串匹配", () => {
    const truncated = `${BOOK_ARGS}…`;
    expect(describeTool(call("bash", truncated), names)).toEqual({
      text: "读原书 pp.145–154",
      kind: "book",
      step: { open: 6 },
    });
  });
});
