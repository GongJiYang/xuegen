/**
 * `plan.undoable` / `plan.undo` requests: the `plan-undo.mjs` script's JSON
 * output mapped onto the data-channel protocol types. The script is ours, but
 * the boundary still guards every field so a malformed response degrades to an
 * empty result instead of leaking `unknown` into the renderer.
 */

import type { PlanCommit, PlanUndoResult } from "../../shared/data-protocol.js";

function isPlanCommit(value: unknown): value is PlanCommit {
  if (typeof value !== "object" || value === null) return false;
  const commit = value as Record<string, unknown>;
  return (
    typeof commit.id === "string" &&
    (commit.kind === "计划" || commit.kind === "顺延" || commit.kind === "开周期") &&
    typeof commit.slug === "string" &&
    typeof commit.date === "string"
  );
}

/** The script's `{commits: [...]}` envelope → `PlanCommit[]`. */
export function planCommitsOf(data: unknown): PlanCommit[] {
  if (typeof data !== "object" || data === null) return [];
  const commits = (data as { commits?: unknown }).commits;
  if (!Array.isArray(commits)) return [];
  return commits.filter(isPlanCommit);
}

/** The script's undo result → `PlanUndoResult` (`jj` internals stay out of the protocol). */
export function planUndoResultOf(data: unknown): PlanUndoResult {
  const record = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return {
    undone: strings(record.undone),
    restoreFiles: strings(record.restoreFiles),
    keptNew: strings(record.keptNew),
    board: typeof record.board === "string" ? record.board : "skipped",
  };
}
