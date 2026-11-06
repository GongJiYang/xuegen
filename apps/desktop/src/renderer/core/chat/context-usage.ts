/**
 * Context-usage view model.
 *
 * Pure derivation from the protocol's usage snapshot to the strings a skin
 * shows, plus the mapping from local session notes to transcript lines. Kept
 * pure so the threshold and null-usage rules are testable without React.
 */

import type { ContextUsagePayload, SystemNote } from "@shared/protocol.js";
import type { ContextUsageView, ThreadNote } from "../../skins/contract.js";
import { strings } from "../strings.js";

/** At or above this percent the title bar warns that compaction is near. */
export const CONTEXT_SOON_PERCENT = 80;

/** The title-bar label: usage, unknown, near-limit warning, or compacting. */
export function contextUsageLabel(usage: ContextUsagePayload | null, compacting: boolean): string {
  if (compacting) return strings.chat.compacting;
  if (!usage || usage.percent === null) return strings.chat.contextUnknown;
  const percent = Math.round(usage.percent);
  const base = strings.chat.context(percent);
  return percent >= CONTEXT_SOON_PERCENT ? `${base}${strings.chat.contextSoon}` : base;
}

/** The small panel's used/window line. */
export function contextUsageDetail(usage: ContextUsagePayload | null): string {
  if (!usage) return strings.chat.contextUnavailable;
  return strings.chat.contextDetail(usage.tokens, usage.contextWindow);
}

/** Map local session notes to the transcript lines a skin renders. */
export function threadNotes(notes: readonly SystemNote[]): ThreadNote[] {
  return notes.map((note) => ({ beforeIndex: note.beforeIndex, text: strings.chat.compactionNote }));
}

/** Assemble the whole Shell-facing view model. */
export function contextUsageView(
  usage: ContextUsagePayload | null,
  compacting: boolean,
  onCompact: () => void,
): ContextUsageView {
  return {
    label: contextUsageLabel(usage, compacting),
    detail: contextUsageDetail(usage),
    tokens: usage?.tokens ?? null,
    contextWindow: usage?.contextWindow ?? 0,
    percent: usage?.percent ?? null,
    compacting,
    onCompact,
  };
}

/**
 * The notes to render before message `index` of a `length`-message transcript.
 * A note past the end belongs after the last message (`index === length`).
 */
export function notesAt(notes: readonly ThreadNote[], index: number, length: number): ThreadNote[] {
  return notes.filter((note) => Math.min(Math.max(note.beforeIndex, 0), length) === index);
}
