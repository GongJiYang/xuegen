/**
 * Pure helpers that turn a restored Pi transcript into renderer messages.
 *
 * Only user and assistant text messages survive; system and tool-result entries
 * are folded away, since batch 1 shows tools as cards on live runs only.
 */

import type { ChatMessage } from "../shared/protocol.js";
import { textFromContent } from "./event-mapper.js";

/**
 * Build renderer messages from a Pi transcript.
 *
 * `idPrefix` keeps restored ids distinct from live ones so the renderer never
 * merges a restored message with a streaming one.
 */
export function historyFromMessages(messages: readonly unknown[], idPrefix: string): ChatMessage[] {
  const result: ChatMessage[] = [];
  messages.forEach((entry, index) => {
    const message = entry as { role?: string; content?: unknown } | undefined;
    if (!message || (message.role !== "user" && message.role !== "assistant")) return;
    const markdown = textFromContent(message.content);
    if (!markdown) return;
    result.push({
      id: `${idPrefix}-history-${index}`,
      role: message.role,
      markdown,
      streaming: false,
      toolCalls: [],
    });
  });
  return result;
}
