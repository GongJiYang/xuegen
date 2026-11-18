import { describe, expect, test } from "vitest";
import type { ToolCallView } from "@shared/protocol.js";
import { flowOf, foldLabel, groupCalls, progressLine } from "./flow-progress.js";

const names = { ctm: "CTM" };

function call(toolName: string, argsSummary: string, status: ToolCallView["status"] = "success"): ToolCallView {
  return { toolCallId: "t", toolName, argsSummary, status };
}

const COURSE_PAGE = call("read", '{"path":"/v/wiki/courses/ctm.md","offset":0}');
const PREFS = call("bash", '{"command":"cd /v && cat wiki/profile.md"}');
const SHIFT = call("course_close", '{"action":"shift","slug":"ctm"}');
const CYCLE = call(
  "bash",
  '{"command":"cd /v && node /a/skills/cycle-plan/cycle.mjs day /v --date 2026-11-17 --json"}',
);
const book = (from: number, to: number, status: ToolCallView["status"] = "success") =>
  call("bash", `{"command":"cd /v && pdftotext -f ${from} -l ${to} raw/books/ctm.pdf - | head"}`, status);
const CODE = call("bash", '{"command":"cd /tmp && python3 -c \\"print(1)\\""}');
const SKILL = call("read", '{"path":"/a/skills/course/SKILL.md","offset":0}');
const STAGE = call("course_close", '{"action":"stage","slug":"ctm"}');
const SNAPSHOT = call("course_close", '{"action":"snapshot","slug":"ctm"}');
const COMMIT = call("course_close", '{"action":"commit","slug":"ctm"}');

function reps(n: number, c: ToolCallView): ToolCallView[] {
  return Array.from({ length: n }, () => c);
}

function shape(groups: ReturnType<typeof groupCalls>) {
  return groups.map((g) => ({
    title: g.title,
    internal: g.internal,
    lines: g.lines.map((l) => ({ text: l.text, count: l.count, calls: l.calls.length })),
  }));
}

describe("flowOf", () => {
  test("映射动作到流程", () => {
    expect(flowOf("open")).toBe("course.open");
    expect(flowOf("close")).toBe("course.close");
    expect(flowOf("plan")).toBeNull();
    expect(flowOf(null)).toBeNull();
  });
});

describe("progressLine", () => {
  test("开课按已见到的最大步数，最后一行取最后一个 call", () => {
    expect(progressLine("course.open", [COURSE_PAGE, SHIFT, book(145, 154, "running")], names, false)).toBe(
      "开课 · 第 6/8 步 · 读原书 pp.145–154",
    );
  });

  test("回答里出现今日要点后不再显示步数", () => {
    expect(progressLine("course.open", [COURSE_PAGE, SHIFT, book(145, 154, "running")], names, true)).toBeNull();
  });

  test("收课动态行", () => {
    expect(progressLine("course.close", [COURSE_PAGE, STAGE, SNAPSHOT], names, false)).toBe(
      "收课 · 第 7/10 步 · 收课：生成截图",
    );
  });

  test("无流程时只报正在做什么", () => {
    expect(progressLine(null, [book(168, 176)], names, false)).toBe("正在读原书 pp.168–176");
    expect(progressLine(null, [CODE], names, false)).toBe("正在跑例子代码");
    expect(progressLine(null, [SKILL], names, false)).toBeNull();
    expect(progressLine(null, [], names, false)).toBeNull();
  });
});

describe("foldLabel", () => {
  test("开课走完取 8 步与操作数", () => {
    const calls = reps(20, book(145, 154));
    expect(foldLabel("course.open", [...calls, CYCLE], true, true)).toBe("开课 · 8 步走完 · 21 个操作");
  });

  test("开课未到讲课", () => {
    const calls = [COURSE_PAGE, PREFS, SHIFT, COURSE_PAGE, PREFS];
    expect(foldLabel("course.open", calls, false, true)).toBe("开课 · 走到第 3 步 · 5 个操作");
  });

  test("收课见到提交且结束", () => {
    expect(foldLabel("course.close", [COURSE_PAGE, SNAPSHOT, COMMIT, ...reps(6, STAGE)], false, true)).toBe(
      "收课 · 10 步走完 · 9 个操作",
    );
  });

  test("收课没提交就只报到第几步", () => {
    expect(foldLabel("course.close", [COURSE_PAGE, SNAPSHOT, ...reps(7, STAGE)], false, true)).toBe(
      "收课 · 走到第 7 步 · 9 个操作",
    );
  });

  test("无流程只报操作数", () => {
    expect(foldLabel(null, reps(12, CODE), false, true)).toBe("12 个操作");
  });
});

describe("groupCalls", () => {
  test("开课按步骤分组，讲课与内部分开", () => {
    const calls = [
      SKILL,
      COURSE_PAGE,
      PREFS,
      SHIFT,
      CYCLE,
      book(145, 154),
      book(149, 158),
      CODE,
      CODE,
      book(168, 176),
    ];
    expect(shape(groupCalls("course.open", calls, names))).toEqual([
      {
        title: "2 · 读课程页和偏好",
        internal: false,
        lines: [
          { text: "读课程页 CTM", count: 1, calls: 1 },
          { text: "读讲解偏好", count: 1, calls: 1 },
        ],
      },
      { title: "3 · 顺延排期", internal: false, lines: [{ text: "顺延排期", count: 1, calls: 1 }] },
      {
        title: "4 · 查主项或辅助",
        internal: false,
        lines: [{ text: "查今天的周期", count: 1, calls: 1 }],
      },
      {
        title: "6 · 定核心页",
        internal: false,
        lines: [
          { text: "读原书 pp.145–154", count: 1, calls: 1 },
          { text: "读原书 pp.149–158", count: 1, calls: 1 },
        ],
      },
      {
        title: "讲课中",
        internal: false,
        lines: [
          { text: "跑例子代码", count: 2, calls: 2 },
          { text: "读原书", count: 1, calls: 1 },
        ],
      },
      { title: "其他", internal: true, lines: [{ text: "读技能说明", count: 1, calls: 1 }] },
    ]);
  });

  test("收课用收课步骤标题，代码进其他", () => {
    expect(shape(groupCalls("course.close", [COURSE_PAGE, COMMIT, CODE], names))).toEqual([
      { title: "1 · 重读课程页", internal: false, lines: [{ text: "读课程页 CTM", count: 1, calls: 1 }] },
      {
        title: "8 · 写概念页并提交",
        internal: false,
        lines: [{ text: "收课：提交", count: 1, calls: 1 }],
      },
      { title: "其他", internal: true, lines: [{ text: "跑例子代码", count: 1, calls: 1 }] },
    ]);
  });

  test("无流程时合并人话，内部动作进其他", () => {
    expect(shape(groupCalls(null, [book(168, 176), book(168, 176), CODE, SKILL], names))).toEqual([
      {
        title: "",
        internal: false,
        lines: [
          { text: "读原书 pp.168–176", count: 2, calls: 2 },
          { text: "跑例子代码", count: 1, calls: 1 },
        ],
      },
      { title: "其他", internal: true, lines: [{ text: "读技能说明", count: 1, calls: 1 }] },
    ]);
  });
});
