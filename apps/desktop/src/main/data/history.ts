/**
 * `history.list` / `history.undo` requests: the `history.mjs` script's JSON
 * output mapped onto the data-channel protocol types. The script is ours, but
 * the boundary still guards every field so a malformed response degrades to an
 * empty result instead of leaking `unknown` into the renderer.
 */

import type { DataResponse } from "../../shared/data-protocol.js";
import type { HistoryEntry, HistoryUndoResult } from "../../shared/history.js";
import { resolveWorkspace } from "../../agent/environment.js";
import { runScript } from "./scripts.js";

const BLOCKED = new Set(["kind", "empty", "later"]);

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  const added = entry.added as Record<string, unknown> | undefined;
  return (
    typeof entry.id === "string" &&
    typeof entry.at === "string" &&
    (typeof entry.verb === "string" || entry.verb === null) &&
    (typeof entry.slug === "string" || entry.slug === null) &&
    typeof entry.text === "string" &&
    typeof entry.manual === "boolean" &&
    typeof added === "object" &&
    added !== null &&
    typeof added.concepts === "number" &&
    typeof added.cards === "number" &&
    typeof entry.undoable === "boolean" &&
    (entry.blocked === null || (typeof entry.blocked === "string" && BLOCKED.has(entry.blocked)))
  );
}

/** The script's `{entries: [...]}` envelope → `HistoryEntry[]`, malformed entries dropped. */
export function historyEntriesOf(data: unknown): HistoryEntry[] {
  if (typeof data !== "object" || data === null) return [];
  const entries = (data as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter(isHistoryEntry);
}

/** The script's undo result → `HistoryUndoResult` (`jj` internals stay out of the protocol). */
export function historyUndoResultOf(data: unknown): HistoryUndoResult {
  const record = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return {
    undone: strings(record.undone),
    restoreFiles: strings(record.restoreFiles),
    keptNew: strings(record.keptNew),
    keptShared: strings(record.keptShared),
    board: typeof record.board === "string" ? record.board : "skipped",
  };
}

/** `history.list` / `history.undo`: run `history.mjs` and map its JSON. */
export async function historyRun(
  vault: string,
  request: { kind: "history.list"; days: number } | { kind: "history.undo"; ids: string[] },
): Promise<DataResponse> {
  const args =
    request.kind === "history.list"
      ? ["list", vault, "--days", String(request.days), "--json"]
      : ["undo", vault, "--ids", request.ids.join(","), "--workspace", resolveWorkspace(), "--json"];
  const result = await runScript("course/history.mjs", args);
  if (!result.ok) return result;
  return {
    ok: true,
    data: request.kind === "history.list" ? historyEntriesOf(result.data) : historyUndoResultOf(result.data),
  };
}
