/**
 * Pure helpers that turn a restored Pi transcript into renderer messages.
 *
 * Only user and assistant messages survive; system and tool-result entries are
 * folded away, since batch 1 shows tools as cards on live runs only.
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

/**
 * One restored message, plus the failure text it ended with.
 *
 * The failure is kept beside the message rather than inside it: only a failure
 * that a later answer recovered from is shown, so an old session with an
 * unanswered failure reads exactly as it did before.
 */
interface RestoredEntry {
  message: ChatMessage;
  errorMessage: string | undefined;
}

/** Restore one Pi message value, or null when it is neither user nor assistant. */
function messageFrom(value: unknown, id: string, at: string | undefined): RestoredEntry | null {
  const message = value as { role?: unknown; content?: unknown; stopReason?: unknown; errorMessage?: unknown } | undefined;
  if (!message || (message.role !== "user" && message.role !== "assistant")) return null;
  return {
    message: {
      id,
      role: message.role,
      markdown: textFromContent(message.content),
      streaming: false,
      toolCalls: [],
      ...(at !== undefined ? { at } : {}),
    },
    errorMessage: errorOf(message),
  };
}

/** A failed message's own error text, or undefined when it did not fail. */
function errorOf(message: { stopReason?: unknown; errorMessage?: unknown }): string | undefined {
  // A user stop is not a failure, and Pi never retries it.
  if (message.stopReason !== "error") return undefined;
  return typeof message.errorMessage === "string" && message.errorMessage !== ""
    ? message.errorMessage
    : "模型返回错误";
}

/**
 * The failure text when a normal answer follows before the next user message.
 *
 * Only an answer to the *same* prompt counts: a failure followed by a new user
 * question simply stood, and the user asked again. Skimming past the failed
 * attempt itself covers the case where a retry produced its own failure first.
 */
function recoveredFrom(
  entry: RestoredEntry,
  following: readonly RestoredEntry[],
): string | undefined {
  if (entry.errorMessage === undefined) return undefined;
  const answered = following.some(
    (candidate) =>
      candidate.message.role === "assistant" &&
      candidate.message.markdown.trim() !== "" &&
      candidate.errorMessage === undefined,
  );
  return answered ? entry.errorMessage : undefined;
}

/** The entries after `index`, up to the next user message: the rest of this turn. */
function restOfTurn(restored: readonly RestoredEntry[], index: number): readonly RestoredEntry[] {
  const following = restored.slice(index + 1);
  const userAt = following.findIndex((candidate) => candidate.message.role === "user");
  return userAt === -1 ? following : following.slice(0, userAt);
}

/**
 * The transcript to show, plus where each restored entry landed in it.
 *
 * A failed answer that a normal answer followed (same turn) was retried
 * automatically: the session file keeps the failed attempt, which Pi omits from
 * the model's context. It stays, marked `"recovered"`, and reads as one soft line
 * instead of an error block under the real answer. Everything else keeps its old
 * behaviour: entries without text are dropped, and a failure no retry recovered
 * from still shows nothing in history.
 */
function buildTranscript(restored: readonly RestoredEntry[]): {
  messages: ChatMessage[];
  /** Index in `messages` of each restored entry, or -1 when it is not shown. */
  shownAt: number[];
} {
  const messages: ChatMessage[] = [];
  const shownAt: number[] = [];
  restored.forEach((entry, index) => {
    const recovered = recoveredFrom(entry, restOfTurn(restored, index));
    if (recovered !== undefined) {
      shownAt.push(messages.length);
      messages.push({ ...entry.message, errorMessage: recovered, retry: "recovered" });
      return;
    }
    if (entry.message.markdown.trim() === "") {
      shownAt.push(-1);
      return;
    }
    shownAt.push(messages.length);
    messages.push(entry.message);
  });
  return { messages, shownAt };
}

/**
 * Replay raw session entries, inserting a local compaction marker where the
 * session file recorded one. Notes are renderer-only and never persisted.
 */
export function historyFromEntries(entries: readonly unknown[], idPrefix: string): HistoryReplay {
  const restored: RestoredEntry[] = [];
  /** Insertion point of each compaction note, as a restored-entry index. */
  const notePositions: number[] = [];
  entries.forEach((entry, index) => {
    const record = entry as { type?: unknown; message?: unknown; timestamp?: unknown } | null | undefined;
    if (!record) return;
    if (record.type === "compaction") {
      notePositions.push(restored.length);
      return;
    }
    if (record.type !== "message") return;
    const restoredEntry = messageFrom(
      record.message,
      `${idPrefix}-history-${index}`,
      typeof record.timestamp === "string" ? record.timestamp : undefined,
    );
    if (restoredEntry) restored.push(restoredEntry);
  });

  const { messages, shownAt } = buildTranscript(restored);
  return {
    messages,
    // A note sits before the first shown message at or after its entry.
    notes: notePositions.map((position) => ({
      beforeIndex: shownAt.slice(0, position).filter((index) => index !== -1).length,
      kind: "compaction" as const,
    })),
  };
}

/**
 * Build renderer messages from a Pi transcript.
 *
 * `idPrefix` keeps restored ids distinct from live ones so the renderer never
 * merges a restored message with a streaming one.
 */
export function historyFromMessages(messages: readonly unknown[], idPrefix: string): ChatMessage[] {
  const restored: RestoredEntry[] = [];
  messages.forEach((entry, index) => {
    const restoredEntry = messageFrom(entry, `${idPrefix}-history-${index}`, undefined);
    if (restoredEntry) restored.push(restoredEntry);
  });
  return buildTranscript(restored).messages;
}
