import { describe, expect, it } from "vitest";
import { commandEffect } from "./run-command.js";
import { strings } from "../strings.js";
import { splitActionMarker } from "../chat/action-marker.js";

/** A prompt command's visible body and folded action. */
function promptParts(command: string): { body: string; action: string | null } {
  const effect = commandEffect(command);
  if (effect.kind !== "prompt") throw new Error(`${command} is not a prompt`);
  const marked = splitActionMarker(effect.text);
  return { body: marked.body, action: marked.action };
}

describe("commandEffect", () => {
  it("maps style commands", () => {
    expect(commandEffect("/默认")).toEqual({ kind: "style", style: "default" });
    expect(commandEffect("/大白话")).toEqual({ kind: "style", style: "plain" });
    expect(commandEffect("/细讲")).toEqual({ kind: "style", style: "detailed" });
    expect(commandEffect("/深度")).toEqual({ kind: "style", style: "deep" });
    expect(commandEffect("/总控")).toEqual({ kind: "control" });
  });

  it("maps tool commands", () => {
    expect(commandEffect("/进度")).toEqual({ kind: "tool", tool: "progress" });
    expect(commandEffect("/加入阅读")).toEqual({ kind: "tool", tool: "reading", focus: "reading-add" });
    expect(commandEffect("/阅读")).toEqual({ kind: "tool", tool: "reading", focus: "reading-add" });
    expect(commandEffect("/日历")).toEqual({ kind: "tool", tool: "calendar" });
    expect(commandEffect("/技能")).toEqual({ kind: "tool", tool: "skills" });
  });

  it("sends the cards draft prompt instead of only opening the window", () => {
    const parts = promptParts("/制卡");
    expect(parts.action).toBe("cards");
    expect(parts.body).toBe(strings.cards.draftPrompt);
  });

  it("sends the summary prompt in the pin board's formats", () => {
    const parts = promptParts("/总结");
    expect(parts.action).toBe("summary");
    expect(parts.body).toBe(strings.commands.summarizePrompt);
    expect(strings.commands.summarizePrompt).toContain("[!abstract]");
    expect(strings.commands.summarizePrompt).toContain("[!question]");
  });

  it("maps the session commands", () => {
    expect(commandEffect("/新会话")).toEqual({ kind: "new-session" });
    expect(commandEffect("/会话列表")).toEqual({ kind: "sessions" });
  });

  it("maps end-of-day to its prompt", () => {
    const parts = promptParts("/收课");
    expect(parts.action).toBe("close");
    expect(parts.body).toBe(strings.commands.endTodayPrompt);
  });

  it("inserts skill commands and ignores the rest", () => {
    expect(commandEffect("/skill:diagram")).toEqual({ kind: "insert", text: "/skill:diagram " });
    expect(commandEffect("/unknown")).toEqual({ kind: "none" });
  });
});
