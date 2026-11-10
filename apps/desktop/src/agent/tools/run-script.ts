/**
 * Shared "run a `skills/` script in the app's own Node" helper for the
 * dedicated tools (`course-close-tool.ts`, `course-plan-tool.ts`,
 * docs/platform/STAGE4A-DESIGN.md §1).
 *
 * The scripts used to run through `bash`, but the stage-4a shell sandbox
 * cannot write `wiki/courses/` or the course board, so the dedicated tools
 * spawn them directly with `ELECTRON_RUN_AS_NODE=1` — the same child-process
 * pattern `main/data/scripts.ts` uses — outside the sandbox.
 */

import { join } from "node:path";

/**
 * The part of `execFile` the tools use, so a test can replay an exit code
 * without spawning Node or needing `skills/` on disk.
 */
export type RunExecFile = (
  file: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number },
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => void;

/** A close can copy snapshots; give scripts more room than the data-channel 15 s. */
const TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

/**
 * Spawn `<repo>/<script>` (repo-relative, e.g. `skills/course/course-close.mjs`)
 * in the app's Node; resolves with its output, never rejects — a non-zero exit
 * is reported via `ok: false` so the caller can hand the script's own output
 * back to the model.
 */
export function runScript(
  exec: RunExecFile,
  repo: string,
  script: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string; message: string }> {
  return new Promise((resolvePromise) => {
    exec(
      process.execPath,
      [join(repo, script), ...args],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER_BYTES,
      },
      (error, stdout, stderr) =>
        resolvePromise({
          ok: error === null,
          stdout,
          stderr,
          message: error?.message ?? "",
        }),
    );
  });
}
