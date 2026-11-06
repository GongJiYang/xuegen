import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/protocol.js";
import { abstractBox, pinBoard } from "./pin-board.js";

function assistant(id: string, markdown: string): ChatMessage {
  return { id, role: "assistant", markdown, streaming: false, toolCalls: [] } as unknown as ChatMessage;
}
function user(id: string, markdown: string): ChatMessage {
  return { id, role: "user", markdown, streaming: false, toolCalls: [] } as unknown as ChatMessage;
}

const DEFS = [
  "> [!abstract] 今日要点 · 离散 D1",
  "> - **∈ 与 ⊆**：∈ 看整体是不是成员；⊆ 剥一层逐个找。",
  "> - **量词顺序**：写在前面的先定。",
  "> - 普通一行",
  "",
  "已存入概念页。",
].join("\n");

const QUESTIONS = [
  "讲解……",
  "",
  "> [!question] 检查理解",
  "> 把 `n|2` 修好后，k 取什么范围？",
  "",
  "> [!question] 检查理解",
  "> 判真假：$\\{3\\} \\subseteq \\{\\{2\\},\\{3\\}\\}$",
].join("\n");

describe("abstractBox", () => {
  it("reads the title and the term lines, keeping plain list lines", () => {
    expect(abstractBox(DEFS)).toEqual({
      title: "今日要点 · 离散 D1",
      items: [
        { term: "∈ 与 ⊆", body: "∈ 看整体是不是成员；⊆ 剥一层逐个找。" },
        { term: "量词顺序", body: "写在前面的先定。" },
        { term: "", body: "普通一行" },
      ],
    });
  });
  it("is null without a box or with an empty box", () => {
    expect(abstractBox("没有框")).toBeNull();
    expect(abstractBox("> [!abstract] 空\n\n正文")).toBeNull();
  });
});

describe("pinBoard", () => {
  it("pins the latest definitions box and the latest round of questions", () => {
    const board = pinBoard([
      user("u1", "开始"),
      assistant("a1", DEFS),
      user("u2", "答"),
      assistant("a2", QUESTIONS),
    ]);
    expect(board?.defs?.messageId).toBe("a1");
    expect(board?.defs?.items).toHaveLength(3);
    expect(board?.questions).toEqual({
      messageId: "a2",
      items: ["把 `n|2` 修好后，k 取什么范围？", "判真假：$\\{3\\} \\subseteq \\{\\{2\\},\\{3\\}\\}$"],
    });
  });
  it("a later round replaces the earlier questions; user messages are ignored", () => {
    const later = "> [!question] 检查理解\n> 新的一题";
    const board = pinBoard([assistant("a1", QUESTIONS), user("u1", DEFS), assistant("a2", later)]);
    expect(board?.questions).toEqual({ messageId: "a2", items: ["新的一题"] });
    expect(board?.defs).toBeNull();
  });
  it("is null when there is nothing to pin", () => {
    expect(pinBoard([user("u1", "你好"), assistant("a1", "普通回答")])).toBeNull();
  });
});
