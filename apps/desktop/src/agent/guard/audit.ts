/**
 * The guard's audit log: one JSONL line per tool-call decision.
 *
 * Every guarded call is recorded — allowed or denied — so a denied call can be
 * told apart from a silent tool failure later. The log lives at
 * `<home>/guard.log` and rotates to `guard.log.1` once it passes 5 MB.
 */

import { appendFileSync, renameSync, statSync } from "node:fs";

export interface AuditEntry {
  /** ISO timestamp. */
  time: string;
  /** Pi session id (empty before the session is bound). */
  session: string;
  /** `control` / `course:<slug>` / `free`. */
  role: string;
  tool: string;
  /** Canonical path, or the command's first 200 characters. */
  target: string;
  allow: boolean;
  reason: string;
}

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Append one decision line, rotating the log when it grows past 5 MB.
 *
 * Audit must never break a tool call: a write failure goes to stderr (which
 * the main process pipes through as `[agent]`) and the decision stands.
 */
export function appendAudit(file: string, entry: AuditEntry): void {
  try {
    if (sizeOf(file) > MAX_BYTES) renameSync(file, `${file}.1`);
    appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error(`[guard] 审计写入失败（${file}）：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** File size, or 0 when the log does not exist yet. */
function sizeOf(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}
