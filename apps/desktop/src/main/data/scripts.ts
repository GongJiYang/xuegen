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

/** How long a script may run before it is killed. */
const SCRIPT_TIMEOUT_MS = 15_000;

/** The result of a script run, already in the data-channel response shape. */
export type ScriptResult = DataResponse;

/** Absolute path to a script inside the repository `skills/` tree. */
function scriptPath(relative: string): string {
  return join(repoRoot, "skills", relative);
}

/**
 * Run one skill script to completion and parse its `--json` stdout.
 *
 * Every failure mode (spawn error, timeout, non-zero exit, invalid JSON) is
 * reported as `{ok:false}` so callers never have to wrap this in try/catch.
 */
export function runScript(relative: string, args: string[]): Promise<ScriptResult> {
  const file = scriptPath(relative);
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [file, ...args],
      {
        timeout: SCRIPT_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      },
      (error, stdout, stderr) => {
        if (error) {
          resolvePromise({ ok: false, code: "script-failed", error: scriptError(relative, stderr, error) });
          return;
        }
        try {
          resolvePromise({ ok: true, data: JSON.parse(stdout) });
        } catch {
          resolvePromise({ ok: false, code: "script-failed", error: `脚本 ${relative} 输出不是合法 JSON。` });
        }
      },
    );
  });
}

/** Build a user-facing error message from a failed script run. */
function scriptError(relative: string, stderr: string, error: ExecFileException): string {
  const detail = stderr.trim() || error.message;
  if (error.killed) return `脚本 ${relative} 超时（${SCRIPT_TIMEOUT_MS / 1000} 秒）。`;
  return `脚本 ${relative} 执行失败：${detail}`;
}
