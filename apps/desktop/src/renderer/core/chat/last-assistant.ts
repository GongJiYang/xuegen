/**
 * Locate the newest assistant block in a transcript.
 *
 * The follow-bottom hook anchors a just-started answer by scrolling its opening
 * line to the viewport top; both skins need the same last-assistant lookup.
 */

import type { ChatMessage } from "@shared/protocol.js";

/** The last assistant message, or undefined when the turn has no answer yet. */
export function lastAssistantMessage(messages: readonly ChatMessage[]): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") return message;
  }
  return undefined;
}
