/**
 * What a `/` command does, expressed as data.
 *
 * The composer's menu entries are `SlashCommand`s; running one means one of a
 * few things: change the teaching style, open a tool window, send a prepared
 * prompt, or hand the text back to the composer (`/skill:*`, which the user
 * finishes themselves). Keeping the mapping pure lets the app shell switch over
 * the result instead of hard-coding command strings, and lets it be tested.
 */

import type { TeachingStyle } from "@shared/protocol.js";
import type { ToolFocus, ToolId } from "../../skins/contract.js";
import { strings } from "../strings.js";
import { withActionMarker } from "../chat/action-marker.js";

/** The effect of running a command. */
export type CommandEffect =
  | { kind: "style"; style: TeachingStyle }
  /** Open a tool window; `focus` names a field inside it to focus when it opens. */
  | { kind: "tool"; tool: ToolId; focus?: ToolFocus }
  | { kind: "resume" }
  | { kind: "new-session" }
  | { kind: "sessions" }
  | { kind: "continue-session" }
  | { kind: "control" }
  | { kind: "prompt"; text: string }
  | { kind: "insert"; text: string }
  | { kind: "none" };

export type { ToolFocus };

/** Resolve a command string to its effect. */
export function commandEffect(command: string): CommandEffect {
  switch (command) {
    case "/默认":
      return { kind: "style", style: "default" };
    case "/大白话":
      return { kind: "style", style: "plain" };
    case "/细讲":
      return { kind: "style", style: "detailed" };
    case "/深度":
      return { kind: "style", style: "deep" };
    case "/新会话":
      return { kind: "new-session" };
    case "/会话列表":
      return { kind: "sessions" };
    case "/总控":
      return { kind: "control" };
    case "/进度":
      return { kind: "tool", tool: "progress" };
    case "/阅读":
    case "/加入阅读":
      return { kind: "tool", tool: "reading", focus: "reading-add" };
    case "/制卡":
      // 说明 is 「把这次学到的内容起草成卡片」: it must ask 学根 to draft, not
      // merely open the cards window.
      return { kind: "prompt", text: withActionMarker(strings.cards.draftPrompt, "cards") };
    case "/日历":
      return { kind: "tool", tool: "calendar" };
    case "/技能":
      return { kind: "tool", tool: "skills" };
    case "/总结":
      return { kind: "prompt", text: withActionMarker(strings.commands.summarizePrompt, "summary") };
    case "/收课":
      return { kind: "prompt", text: withActionMarker(strings.commands.endTodayPrompt, "close") };
    default:
      // A skill command is inserted so the user can add their own detail.
      if (command.startsWith("/skill:")) return { kind: "insert", text: `${command} ` };
      return { kind: "none" };
  }
}
