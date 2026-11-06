/**
 * The composer's `/` menu: the built-in command table and the pure functions
 * that filter and drive it.
 *
 * Commands are grouped the way the design lists them (风格 / 学习 / 阅读 / 卡片 /
 * 日历 / 技能). Built-in commands are fixed; the 技能 group also carries one entry
 * per enabled agent skill (`/skill:<name>`). Filtering, selection movement, and
 * grouping are pure functions with tests; executing a command is left to the
 * caller, which owns the style store, the tool windows, and the composer.
 */

import type { CommandInfo } from "@shared/protocol.js";
import type { TeachingStyle } from "@shared/protocol.js";
import { strings } from "../strings.js";

/** The groups the menu shows, in order. */
export const COMMAND_GROUPS = ["风格", "学习", "阅读", "卡片", "日历", "技能"] as const;

export type CommandGroup = (typeof COMMAND_GROUPS)[number];

/** A single `/` menu entry. */
export interface SlashCommand {
  /** The literal command, e.g. `/大白话` or `/skill:diagram`. */
  command: string;
  group: CommandGroup;
  /** One-line description shown beside the command. */
  description: string;
}

/** The built-in commands, in display order. */
export const BUILTIN_COMMANDS: SlashCommand[] = [
  { command: "/大白话", group: "风格", description: strings.commands.stylePlain },
  { command: "/细讲", group: "风格", description: strings.commands.styleDetailed },
  { command: "/深度", group: "风格", description: strings.commands.styleDeep },
  { command: "/新会话", group: "学习", description: strings.commands.newSession },
  { command: "/继续会话", group: "学习", description: strings.commands.continueSession },
  { command: "/继续", group: "学习", description: strings.commands.resume },
  { command: "/总控", group: "学习", description: strings.commands.control },
  { command: "/今天学到这里", group: "学习", description: strings.commands.endToday },
  { command: "/进度", group: "学习", description: strings.commands.progress },
  { command: "/技能", group: "学习", description: strings.commands.skills },
  { command: "/加入阅读", group: "阅读", description: strings.commands.addReading },
  { command: "/今天读什么", group: "阅读", description: strings.commands.readingToday },
  { command: "/制卡", group: "卡片", description: strings.commands.makeCards },
  { command: "/日历", group: "日历", description: strings.commands.calendar },
];

/** The style a `/风格` command selects, or null for a non-style command. */
export function styleOfCommand(command: string): TeachingStyle | null {
  switch (command) {
    case "/大白话":
      return "plain";
    case "/细讲":
      return "detailed";
    case "/深度":
      return "deep";
    default:
      return null;
  }
}

/**
 * Build the full command list: built-ins plus one `/skill:<name>` per agent
 * command.
 *
 * `disabledSkills` filters the agent's list locally so turning a skill off
 * removes its `/skill:<name>` from the menu *immediately*, without waiting for
 * the agent to re-send its command list after the settings write.
 */
export function allCommands(agentCommands: CommandInfo[], disabledSkills: readonly string[] = []): SlashCommand[] {
  const disabled = new Set(disabledSkills);
  const skillCommands: SlashCommand[] = agentCommands
    .filter((entry) => !disabled.has(entry.name))
    .map((entry) => ({
      command: `/skill:${entry.name}`,
      group: "技能" as const,
      description: entry.description || strings.commands.skillFallback,
    }));
  return [...BUILTIN_COMMANDS, ...skillCommands];
}

/**
 * Filter commands by a query (the text typed after `/`).
 *
 * An empty query returns everything. A non-empty query matches when it appears
 * in the command, the description, or the group (case-insensitive), so typing
 * "阅读" surfaces the 阅读 group and typing "skill" surfaces every skill.
 */
export function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;
  return commands.filter(
    (entry) =>
      entry.command.toLowerCase().includes(needle) ||
      entry.description.toLowerCase().includes(needle) ||
      entry.group.toLowerCase().includes(needle),
  );
}

/** The needle a command's own name (without the leading `/`) is compared to. */
function commandName(entry: SlashCommand): string {
  return entry.command.replace(/^\//, "").toLowerCase();
}

/**
 * Rank one command against a query, or `null` when it does not match.
 *
 * Lower is better. The order matters because the highlighted item is what Enter
 * runs: an exact name beats a name prefix, which beats a name substring, which
 * beats a description/group hit. Without this, typing `/进度` would run
 * 「/今天学到这里」 (whose description contains 进度 and comes first in the table).
 */
function rankCommand(entry: SlashCommand, needle: string): number | null {
  const name = commandName(entry);
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  if (name.includes(needle)) return 2;
  if (
    entry.description.toLowerCase().includes(needle) ||
    entry.group.toLowerCase().includes(needle)
  ) {
    return 3;
  }
  return null;
}

/**
 * Filter and order commands for a query.
 *
 * Matches are ranked by how the query addresses the command: an exact name
 * match first, then a name prefix, then a name substring, then a description or
 * group hit. Ties keep the table order, so the result is stable. An empty query
 * returns the list unchanged.
 */
export function rankCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;
  const ranked: { entry: SlashCommand; rank: number; index: number }[] = [];
  commands.forEach((entry, index) => {
    const rank = rankCommand(entry, needle);
    if (rank !== null) ranked.push({ entry, rank, index });
  });
  ranked.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index));
  return ranked.map((item) => item.entry);
}

/** Move the selection by `delta`, wrapping around the list bounds. */
export function moveSelection(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return ((index + delta) % length + length) % length;
}

/** One rendered group: its name and the commands under it. */
export interface SlashGroup {
  group: CommandGroup;
  commands: SlashCommand[];
}

/**
 * Group a filtered command list for display.
 *
 * The output follows {@link COMMAND_GROUPS} order regardless of the input order,
 * so a filtered list keeps the menu's stable group order; empty groups are
 * dropped.
 */
export function groupCommands(commands: SlashCommand[]): SlashGroup[] {
  return COMMAND_GROUPS.map((group) => ({
    group,
    commands: commands.filter((entry) => entry.group === group),
  })).filter((entry) => entry.commands.length > 0);
}

/** True when the composer text should open the `/` menu. */
export function opensSlashMenu(text: string): boolean {
  return text.startsWith("/");
}

/**
 * The leading slash command in a composer text, or null.
 *
 * Only the first token is considered: a skill entry like `/skill:diagram 画一下`
 * is still the `/skill:diagram` command, and the rest is the user's own detail.
 */
export function slashToken(text: string): string | null {
  const match = /^(\/\S+)/.exec(text.trim());
  return match?.[1] ?? null;
}

/**
 * Whether a composer text is a slash command the menu does not know.
 *
 * A `/skill:<name>` entry is always allowed (the user finishes it themselves),
 * even before the agent has reported its command list; every other `/xxx` must
 * match a built-in. This is what stops an unknown `/新会话节` from being sent to
 * the model as ordinary prose.
 */
export function isUnknownCommand(text: string, commands: SlashCommand[]): boolean {
  const token = slashToken(text);
  if (token === null) return false;
  // A `/skill:<name>` entry is the user's to finish; never treat it as unknown.
  if (token.startsWith("/skill:")) return false;
  return !commands.some((entry) => entry.command === token);
}
