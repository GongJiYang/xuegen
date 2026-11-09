/**
 * Runs the skill scripts (`skills/<name>/*.mjs`) and returns their JSON output.
 *
 * The deterministic logic lives in those zero-dependency scripts; the main
 * process only invokes them, validates the result, and forwards it. Scripts run
 * in the app's own Node (`process.execPath` with `ELECTRON_RUN_AS_NODE=1`), so
 * they need no separately installed runtime.
 */

import { execFile, type ExecFileException } from "node:child_process";
import { join } from "node:path";
import { repoRoot } from "../../agent/environment.js";
import type { DataResponse } from "../../shared/data-protocol.js";

/** How long a script may run before it is killed when the caller sets no budget. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Per-call knobs; only the timeout differs today. */
export interface ScriptOptions {
  /** Kill the process after this many milliseconds (default 15s). */
  timeoutMs?: number;
}

/** The result of a script run, already in the data-channel response shape. */
export type ScriptResult = DataResponse;

/** The timeout a run actually used, for both the kill and the error message. */
function timeoutOf(options: ScriptOptions | undefined): number {
  return options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

/** Absolute path to a script inside the repository `skills/` tree. */
function scriptPath(relative: string): string {
  return join(repoRoot, "skills", relative);
}

/** Spawn one skill script; resolves with its stdout/stderr, never rejects. */
function spawn(
  relative: string,
  args: string[],
  timeoutMs: number,
): Promise<{ error: ExecFileException | null; stdout: string; stderr: string }> {
  const file = scriptPath(relative);
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [file, ...args],
      {
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      },
      (error, stdout, stderr) => resolvePromise({ error, stdout, stderr }),
    );
  });
}

/**
 * Run one skill script to completion and parse its `--json` stdout.
 *
 * Every failure mode (spawn error, timeout, non-zero exit, invalid JSON) is
 * reported as `{ok:false}` so callers never have to wrap this in try/catch.
 */
export async function runScript(
  relative: string,
  args: string[],
  options?: ScriptOptions,
): Promise<ScriptResult> {
  const timeoutMs = timeoutOf(options);
  const { error, stdout, stderr } = await spawn(relative, args, timeoutMs);
  if (error) {
    return { ok: false, code: "script-failed", error: scriptError(relative, stderr, error, timeoutMs) };
  }
  try {
    return { ok: true, data: JSON.parse(stdout) };
  } catch {
    return { ok: false, code: "script-failed", error: `脚本 ${relative} 输出不是合法 JSON。` };
  }
}

/**
 * Run one skill script that prints no JSON (e.g. `course-state.mjs dashboard`,
 * `render-board.mjs`): a clean exit is success and stdout is ignored.
 */
export async function runScriptPlain(
  relative: string,
  args: string[],
  options?: ScriptOptions,
): Promise<ScriptResult> {
  const timeoutMs = timeoutOf(options);
  const { error, stderr } = await spawn(relative, args, timeoutMs);
  if (error) {
    return { ok: false, code: "script-failed", error: scriptError(relative, stderr, error, timeoutMs) };
  }
  return { ok: true, data: null };
}

/** Build a user-facing error message from a failed script run. */
function scriptError(
  relative: string,
  stderr: string,
  error: ExecFileException,
  timeoutMs: number,
): string {
  const detail = stderr.trim() || error.message;
  if (error.killed) return `脚本 ${relative} 超时（${timeoutMs / 1000} 秒）。`;
  return `脚本 ${relative} 执行失败：${detail}`;
}
