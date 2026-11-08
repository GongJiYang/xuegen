/**
 * Pure helpers that turn a restored Pi transcript into renderer messages.
 *
 * Only user and assistant text messages survive; system and tool-result entries
 * are folded away, since batch 1 shows tools as cards on live runs only.
 *
 * `historyFromEntries` replays the session *branch* (the raw persisted entries)
 * rather than Pi's projected context. That keeps the original messages visible
 * after a compaction — the session file still stores them — and lets a local
 * marker sit exactly where the `CompactionEntry` was appended. The model itself
 * sees the summary plus the kept messages, not this full transcript.
 */

import type { ChatMessage, SystemNote } from "../shared/protocol.js";
import { textFromContent } from "./event-mapper.js";

/** A restored transcript plus the local-only notes to render between messages. */
export interface HistoryReplay {
  messages: ChatMessage[];
  notes: SystemNote[];
}

function messageFrom(value: unknown, id: string, at: string | undefined): ChatMessage | null {
  const message = value as { role?: string; content?: unknown } | undefined;
  if (!message || (message.role !== "user" && message.role !== "assistant")) return null;
  const markdown = textFromContent(message.content);
  if (!markdown) return null;
  return {
    id,
    role: message.role,
    markdown,
    streaming: false,
    toolCalls: [],
    ...(at !== undefined ? { at } : {}),
  };
}

/**
 * Replay raw session entries, inserting a local compaction marker where the
 * session file recorded one. Notes are renderer-only and never persisted.
 */
export function historyFromEntries(entries: readonly unknown[], idPrefix: string): HistoryReplay {
  const messages: ChatMessage[] = [];
  const notes: SystemNote[] = [];
  entries.forEach((entry, index) => {
    const record = entry as { type?: string; message?: unknown } | null | undefined;
    if (!record) return;
    if (record.type === "compaction") {
      notes.push({ beforeIndex: messages.length, kind: "compaction" });
      return;
    }
    if (record.type !== "message") return;
    const timestamp = (entry as { timestamp?: unknown }).timestamp;
    const message = messageFrom(record.message, `${idPrefix}-history-${index}`, typeof timestamp === "string" ? timestamp : undefined);
    if (message) messages.push(message);
  });
  return { messages, notes };
}

/**
 * Build renderer messages from a Pi transcript.
 *
 * `idPrefix` keeps restored ids distinct from live ones so the renderer never
 * merges a restored message with a streaming one.
 */
export function historyFromMessages(messages: readonly unknown[], idPrefix: string): ChatMessage[] {
  const result: ChatMessage[] = [];
  messages.forEach((entry, index) => {
    const message = messageFrom(entry, `${idPrefix}-history-${index}`, undefined);
    if (message) result.push(message);
  });
  return result;
}
