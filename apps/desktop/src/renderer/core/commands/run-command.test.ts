import { describe, expect, it } from "vitest";
import { commandEffect } from "./run-command.js";
import { strings } from "../strings.js";

describe("commandEffect", () => {
  it("maps style commands", () => {
    expect(commandEffect("/大白话")).toEqual({ kind: "style", style: "plain" });
    expect(commandEffect("/细讲")).toEqual({ kind: "style", style: "detailed" });
    expect(commandEffect("/深度")).toEqual({ kind: "style", style: "deep" });
    expect(commandEffect("/总控")).toEqual({ kind: "control" });
  });

  it("maps tool commands", () => {
    expect(commandEffect("/进度")).toEqual({ kind: "tool", tool: "progress" });
    expect(commandEffect("/加入阅读")).toEqual({ kind: "tool", tool: "reading", focus: "reading-add" });
    expect(commandEffect("/阅读")).toEqual({ kind: "tool", tool: "reading", focus: "reading-add" });
    expect(commandEffect("/今天读什么")).toEqual({ kind: "tool", tool: "reading" });
    expect(commandEffect("/日历")).toEqual({ kind: "tool", tool: "calendar" });
    expect(commandEffect("/技能")).toEqual({ kind: "tool", tool: "skills" });
  });

  it("sends the cards draft prompt instead of only opening the window", () => {
    const effect = commandEffect("/制卡");
    expect(effect.kind).toBe("prompt");
    expect(effect.kind === "prompt" && effect.text).toContain("只在回复里列出");
  });

  it("sends the summary prompt in the pin board's formats", () => {
    expect(commandEffect("/总结")).toEqual({ kind: "prompt", text: strings.commands.summarizePrompt });
    expect(strings.commands.summarizePrompt).toContain("[!abstract]");
    expect(strings.commands.summarizePrompt).toContain("[!question]");
  });

  it("maps the session commands", () => {
    expect(commandEffect("/新会话")).toEqual({ kind: "new-session" });
    expect(commandEffect("/继续会话")).toEqual({ kind: "continue-session" });
  });

  it("maps resume and end-of-day", () => {
    expect(commandEffect("/继续")).toEqual({ kind: "resume" });
    expect(commandEffect("/今天学到这里").kind).toBe("prompt");
  });

  it("inserts skill commands and ignores the rest", () => {
    expect(commandEffect("/skill:diagram")).toEqual({ kind: "insert", text: "/skill:diagram " });
    expect(commandEffect("/unknown")).toEqual({ kind: "none" });
  });
});
