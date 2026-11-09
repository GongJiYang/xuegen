/**
 * Whether 学根 has actually answered in a transcript.
 *
 * A lesson only counts as begun once there is something to sum up or close:
 * an opening message 学根 never answered (a failure, a dropped network, an empty
 * turn) is not an answer, so the course can still send its opening again.
 */

import type { ChatMessage } from "@shared/protocol.js";

/** True once 学根 has answered something in the transcript (a failed or unanswered opening does not count). */
export function hasAnswer(messages: readonly ChatMessage[]): boolean {
  return messages.some(
    (message) => message.role === "assistant" && message.markdown.trim() !== "" && !message.errorMessage,
  );
}
