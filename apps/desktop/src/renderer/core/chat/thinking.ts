/**
 * Per-message thinking predicate.
 *
 * The thinking indicator belongs to the *last* assistant block only, while it is
 * still generating with nothing to show yet. Every earlier assistant block — one
 * that already streamed text, or one that ran tool calls before handing off — is
 * finished and must not show it. The skin's `Thread` maps over the transcript
 * and calls this per index, so the global `thinking` flag reaches exactly one
 * message.
 */

import type { ChatMessage } from "@shared/protocol.js";
import { isThinking } from "./chat-reducer.js";

/**
 * Whether the message at `index` should show the thinking indicator.
 *
 * True only when the session is thinking (see {@link isThinking}) and `index` is
 * the last assistant message. Any tool call on that last block counts as "has
 * been doing work", but the block is still the one the user is waiting on, so it
 * keeps the indicator until its first text delta arrives (at which point
 * `isThinking` is false).
 */
export function thinkingFor(messages: ChatMessage[], index: number, thinking: boolean): boolean {
  if (!thinking) return false;
  const lastAssistant = lastAssistantIndex(messages);
  return lastAssistant === index;
}

/** The index of the last assistant message, or -1 when there is none. */
function lastAssistantIndex(messages: ChatMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return index;
  }
  return -1;
}

/** Re-exported so a caller can gate on the session-level flag without a second import. */
export { isThinking };
