/**
 * The 总控 avatar's mood (BE-11b).
 *
 * While the 总控 session is open its avatar shows what 学根 is doing: thinking
 * while it answers, working while a tool runs, notifying when a lesson was
 * missed, sleeping on a rest day, idle otherwise. Pure: everything is an argument.
 */

import type { CycleDay } from "@shared/data-protocol.js";
import type { ChatMessage } from "@shared/protocol.js";
import type { AsyncState } from "./state.js";

export type BotMood = "idle" | "thinking" | "working" | "notifying" | "sleeping";

/** What the shell needs to draw the 总控 avatar. */
export interface ControlView {
  mood: BotMood;
}

/** True while the newest message has a tool call still running. */
export function toolRunning(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  return last !== undefined && last.toolCalls.some((call) => call.status === "running");
}

export function botMood(streaming: boolean, runningTool: boolean, day: CycleDay | null): BotMood {
  if (streaming) return runningTool ? "working" : "thinking";
  if (day && day.overdue.length > 0) return "notifying";
  if (day?.type === "休息") return "sleeping";
  return "idle";
}

/** The avatar view while the 总控 session is open; null in any other session. */
export function controlView(
  isControl: boolean,
  streaming: boolean,
  messages: ChatMessage[],
  today: AsyncState<CycleDay>,
): ControlView | null {
  if (!isControl) return null;
  const day = today.status === "ready" ? today.value : null;
  return { mood: botMood(streaming, toolRunning(messages), day) };
}
