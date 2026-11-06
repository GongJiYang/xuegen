/**
 * What 学根 is doing in an assistant block right now, for the line that used to
 * read only 「正在思考」: looking things up, changing things, thinking, or
 * writing. Pure: the message and the thinking flag are arguments.
 */

import type { ChatMessage } from "@shared/protocol.js";
import { strings } from "../strings.js";

export type ActivityMood = "thinking" | "searching" | "working" | "writing";

export interface Activity {
  mood: ActivityMood;
  label: string;
}

/** Pi's tools that only look at files; every other tool may change something. */
const LOOKING_TOOLS = new Set(["read", "grep", "find", "ls"]);

/** Shell commands that only look; 学根 often reads files through bash rather than `read`. */
const LOOKING_COMMANDS = new Set(["cat", "head", "tail", "ls", "wc", "grep", "rg", "find", "stat", "tree"]);

/** Longest tool detail shown after 「正在查资料：」 / 「正在动手：」. */
const MAX_DETAIL = 40;

/** A tool's arguments arrive as JSON; show the command or path, not the braces. */
function detailOf(argsSummary: string): string {
  try {
    const args: unknown = JSON.parse(argsSummary);
    if (typeof args === "object" && args !== null) {
      const record = args as Record<string, unknown>;
      const value = record.command ?? record.path ?? record.file_path ?? record.pattern;
      if (typeof value === "string") return value;
    }
  } catch {
    // Not JSON: already a plain summary.
  }
  return argsSummary;
}

function clip(text: string): string {
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL - 1)}…` : text;
}

/**
 * The block's current activity, or null when nothing is in progress.
 *
 * A running tool wins (it is what 学根 is waiting on); then an empty block is
 * thinking (`thinking` comes from `thinkingFor`); then streaming text is writing.
 */
export function activityOf(message: ChatMessage, thinking: boolean): Activity | null {
  if (message.role !== "assistant") return null;
  const running = [...message.toolCalls].reverse().find((call) => call.status === "running");
  if (running) {
    const detail = detailOf(running.argsSummary);
    const looking =
      LOOKING_TOOLS.has(running.toolName) ||
      (running.toolName === "bash" && LOOKING_COMMANDS.has(detail.trim().split(/\s+/)[0] ?? ""));
    if (looking) {
      return { mood: "searching", label: strings.chat.activitySearching(clip(detailOf(running.argsSummary) || running.toolName)) };
    }
    return { mood: "working", label: strings.chat.activityWorking(clip(`${running.toolName} ${detailOf(running.argsSummary)}`.trim())) };
  }
  if (thinking) return { mood: "thinking", label: strings.chat.thinking };
  if (message.streaming && message.markdown.trim() !== "") return { mood: "writing", label: strings.chat.activityWriting };
  return null;
}

const THINKING: Activity = { mood: "thinking", label: strings.chat.thinking };

/**
 * The one in-progress line for a whole answer (Bear draws it once, after the
 * transcript), or null when no answer is running.
 *
 * While `busy`, it follows the last assistant block — a running tool, then
 * thinking, then writing — and falls back to 正在思考 in the gaps between
 * blocks (a tool just finished and the next block has not started), so the
 * line never disappears mid-answer.
 *
 * @param busy     True from send until the answer ends (the controller's `streaming`).
 * @param thinking The session-level flag from `isThinking`.
 */
export function turnActivity(messages: ChatMessage[], busy: boolean, thinking: boolean): Activity | null {
  if (!busy) return null;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return THINKING;
  return activityOf(last, thinking) ?? THINKING;
}
