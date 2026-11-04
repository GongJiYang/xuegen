import { describe, expect, it } from "vitest";
import type { CommandInfo } from "@shared/protocol.js";
import {
  BUILTIN_COMMANDS,
  allCommands,
  filterCommands,
  groupCommands,
  isUnknownCommand,
  moveSelection,
  opensSlashMenu,
  rankCommands,
  slashToken,
  styleOfCommand,
} from "./commands.js";

const SKILLS: CommandInfo[] = [
  { name: "diagram", description: "用字符图讲解", source: "skill" },
  { name: "wiki-save", description: "把内容写进 wiki", source: "skill" },
];

describe("command table", () => {
  it("appends one /skill: entry per agent command", () => {
    const all = allCommands(SKILLS);
    expect(all).toHaveLength(BUILTIN_COMMANDS.length + 2);
    expect(all.some((entry) => entry.command === "/skill:diagram")).toBe(true);
    expect(all.filter((entry) => entry.group === "技能")).toHaveLength(2);
  });

  it("drops a disabled skill from the menu immediately", () => {
    const all = allCommands(SKILLS, ["diagram"]);
    expect(all.some((entry) => entry.command === "/skill:diagram")).toBe(false);
    expect(all.some((entry) => entry.command === "/skill:wiki-save")).toBe(true);
    expect(allCommands(SKILLS, ["diagram", "wiki-save"]).filter((entry) => entry.group === "技能")).toHaveLength(0);
  });

  it("maps style commands to their style id", () => {
    expect(styleOfCommand("/大白话")).toBe("plain");
    expect(styleOfCommand("/细讲")).toBe("detailed");
    expect(styleOfCommand("/深度")).toBe("deep");
    expect(styleOfCommand("/今天学到这里")).toBeNull();
  });

  it("filters by command, description, and group", () => {
    const all = allCommands(SKILLS);
    expect(filterCommands(all, "").length).toBe(all.length);
    expect(filterCommands(all, "深度").map((entry) => entry.command)).toEqual(["/深度"]);
    expect(filterCommands(all, "阅读").some((entry) => entry.group === "阅读")).toBe(true);
    expect(filterCommands(all, "字符图").map((entry) => entry.command)).toEqual(["/skill:diagram"]);
  });

  it("groups in the design's stable order and drops empty groups", () => {
    const groups = groupCommands(filterCommands(allCommands(SKILLS), "skill"));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.group).toBe("技能");
  });

  it("ranks an exact name match first so Enter runs the intended command", () => {
    const all = allCommands(SKILLS);
    expect(rankCommands(all, "进度")[0]?.command).toBe("/进度");
    expect(rankCommands(all, "今天学到这里")[0]?.command).toBe("/今天学到这里");
  });

  it("ranks a name prefix above a description hit", () => {
    const all = allCommands(SKILLS);
    // 「技能」 is an exact built-in name, so it leads over any group-based hit.
    expect(rankCommands(all, "技能")[0]?.command).toBe("/技能");
    // 「深」 is a name prefix of /深度, which must beat 细讲 (description mentions 讲).
    expect(rankCommands(all, "深")[0]?.command).toBe("/深度");
  });

  it("ranks a name substring above a description-only hit", () => {
    const all = allCommands(SKILLS);
    expect(rankCommands(all, "日历")[0]?.command).toBe("/日历");
    expect(rankCommands(all, "阅读")[0]?.command).toBe("/加入阅读");
  });

  it("keeps the table order for equal ranks and returns the list for an empty query", () => {
    const all = allCommands(SKILLS);
    expect(rankCommands(all, "")).toEqual(all);
    const ranked = rankCommands(all, "日");
    // 日历 (name prefix) and 今天学到这里 (description 「更新计划与进度」 does not
    // contain 日) — only the exact/name matches survive ahead of group hits.
    expect(ranked.length).toBeGreaterThan(0);
  });

  it("moves the selection with wraparound and handles an empty list", () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
    expect(moveSelection(0, 1, 0)).toBe(0);
  });

  it("opens the menu only when the text starts with a slash", () => {
    expect(opensSlashMenu("/")).toBe(true);
    expect(opensSlashMenu("/继续")).toBe(true);
    expect(opensSlashMenu(" 继续")).toBe(false);
  });

  it("lists the session commands and the skills tool", () => {
    const commands = BUILTIN_COMMANDS.map((entry) => entry.command);
    expect(commands).toContain("/新会话");
    expect(commands).toContain("/继续会话");
    expect(commands).toContain("/技能");
  });

  it("extracts only the leading slash token", () => {
    expect(slashToken("/skill:diagram 画一下")).toBe("/skill:diagram");
    expect(slashToken("  /进度 ")).toBe("/进度");
    expect(slashToken("你好")).toBeNull();
  });

  it("flags an unknown slash command but allows skills and plain text", () => {
    const all = allCommands(SKILLS);
    expect(isUnknownCommand("/新会话", all)).toBe(false);
    expect(isUnknownCommand("/skill:diagram", all)).toBe(false);
    expect(isUnknownCommand("/skill:article 帮我写", all)).toBe(false);
    expect(isUnknownCommand("普通消息", all)).toBe(false);
    expect(isUnknownCommand("/新会话节", all)).toBe(true);
    expect(isUnknownCommand("/没有这个", all)).toBe(true);
  });
});
