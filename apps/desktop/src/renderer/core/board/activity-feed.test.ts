import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/protocol.js";
import { withActionMarker } from "../chat/action-marker.js";
import { strings } from "../strings.js";
import { activityCards, firstSentence } from "./activity-feed.js";

const user = (id: string, markdown: string): ChatMessage => ({
  id,
  role: "user",
  markdown,
  streaming: false,
  toolCalls: [],
});
const answer = (id: string, markdown: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role: "assistant",
  markdown,
  streaming: false,
  toolCalls: [],
  ...extra,
});
const call = (argsSummary: string, status: "running" | "success" = "success") => ({
  toolCallId: argsSummary,
  toolName: "edit",
  argsSummary,
  status,
});

describe("activityCards", () => {
  it("makes one card per turn: the ask, the answer's first sentence and the step count", () => {
    const cards = activityCards({
      messages: [
        user("u1", "今天有什么要做的\n顺便看看 Anki"),
        answer("a1", "## 今天\n**主攻日**：离散 D4。读 Epp。", { toolCalls: [call("read 周期页")] }),
        answer("a2", "还有 Anki 42 张。", { toolCalls: [call("read 课程页")] }),
      ],
      changes: {},
      names: {},
      streaming: false,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "u1",
      ask: "今天有什么要做的",
      summary: "今天 主攻日：离散 D4。",
      changes: null,
      steps: 2,
      busy: false,
      doing: null,
    });
    expect(cards[0]?.messages.map((message) => message.id)).toEqual(["u1", "a1", "a2"]);
  });

  it("words a turn's schedule changes and folds a marked message into its label", () => {
    const [card] = activityCards({
      messages: [user("u1", withActionMarker("请把 C 语言停一周", "plan")), answer("a1", "好。")],
      changes: { u1: [{ course: "dm", id: "D4", from: "2026-11-16", to: "2026-11-17" }] },
      undo: { u1: { status: "available", error: null } },
      names: { dm: "离散" },
      streaming: false,
    });
    expect(card?.ask).toBe("改计划");
    expect(card?.changes).toEqual(["离散 D4 11-16 → 11-17"]);
    expect(card?.undo).toEqual({ status: "available", error: null });
  });

  it("drops the refresh note 学根 gets in front of a message", () => {
    const [card] = activityCards({
      messages: [user("u1", `${strings.chat.controlRefreshNote}\n用三句话说说抽屉原理`)],
      changes: {},
      names: {},
      streaming: false,
    });
    expect(card?.ask).toBe("用三句话说说抽屉原理");
  });

  it("marks only the last turn busy while streaming, with its latest step", () => {
    const cards = activityCards({
      messages: [
        user("u1", "早"),
        answer("a1", "早。"),
        user("u2", "周二有事"),
        answer("a2", "", {
          toolCalls: [call("read 周期页"), call('{"path":"wiki/courses/ctm.md"}', "running")],
        }),
      ],
      changes: {},
      names: {},
      streaming: true,
    });
    expect(cards.map((card) => card.busy)).toEqual([false, true]);
    expect(cards[1]).toMatchObject({
      doing: strings.chat.activityWorking("edit wiki/courses/ctm.md"),
      steps: 2,
      summary: null,
    });
  });

  it("flags a failed answer unless a retry recovered it; a turn may open with an answer", () => {
    const cards = activityCards({
      messages: [
        answer("a0", "欢迎。"),
        user("u1", "hi"),
        answer("a1", "", { errorMessage: "503" }),
        user("u2", "再试"),
        answer("a2", "好", { errorMessage: "503", retry: "recovered" }),
      ],
      changes: {},
      names: {},
      streaming: false,
    });
    expect(cards.map((card) => [card.ask, card.failed])).toEqual([
      ["", false],
      ["hi", true],
      ["再试", false],
    ]);
  });
});

describe("firstSentence", () => {
  it("drops headings, list marks, links and code fences, and clips long text", () => {
    expect(firstSentence("```\ncode\n```\n- 见 [[wiki/x|概念页]] 与 [文档](http://a)。后面")).toBe(
      "见 概念页 与 文档。",
    );
    expect(firstSentence("")).toBeNull();
    expect(firstSentence("字".repeat(100))).toBe(`${"字".repeat(80)}…`);
  });
});
