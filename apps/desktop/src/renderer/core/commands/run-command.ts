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

/** The effect of running a command. */
export type CommandEffect =
  | { kind: "style"; style: TeachingStyle }
  /** Open a tool window; `focus` names a field inside it to focus when it opens. */
  | { kind: "tool"; tool: ToolId; focus?: ToolFocus }
  | { kind: "resume" }
  | { kind: "new-session" }
  | { kind: "continue-session" }
  | { kind: "prompt"; text: string }
  | { kind: "insert"; text: string }
  | { kind: "none" };

export type { ToolFocus };

/** Resolve a command string to its effect. */
export function commandEffect(command: string): CommandEffect {
  switch (command) {
    case "/大白话":
      return { kind: "style", style: "plain" };
    case "/细讲":
      return { kind: "style", style: "detailed" };
    case "/深度":
      return { kind: "style", style: "deep" };
    case "/新会话":
      return { kind: "new-session" };
    case "/继续会话":
      return { kind: "continue-session" };
    case "/进度":
      return { kind: "tool", tool: "progress" };
    case "/阅读":
    case "/加入阅读":
      return { kind: "tool", tool: "reading", focus: "reading-add" };
    case "/今天读什么":
      return { kind: "tool", tool: "reading" };
    case "/制卡":
      // 说明 is 「把这次学到的内容起草成卡片」: it must ask 学根 to draft, not
      // merely open the cards window.
      return { kind: "prompt", text: "把这次学到的内容起草成卡片" };
    case "/日历":
      return { kind: "tool", tool: "calendar" };
    case "/技能":
      return { kind: "tool", tool: "skills" };
    case "/继续":
      return { kind: "resume" };
    case "/今天学到这里":
      return { kind: "prompt", text: "今天学到这里，写进 wiki，更新计划" };
    default:
      // A skill command is inserted so the user can add their own detail.
      if (command.startsWith("/skill:")) return { kind: "insert", text: `${command} ` };
      return { kind: "none" };
  }
}
