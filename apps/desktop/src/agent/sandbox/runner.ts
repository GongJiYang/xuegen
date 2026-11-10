/**
 * Bash sandbox wrapper (stage 4a-1).
 *
 * Rewrites a bash command so it runs under the per-role seatbelt profile from
 * `./config.ts`, and reads the violation store back into stderr so the model
 * sees why a command was blocked. Not wired into the session yet — the guard
 * integration lands after the stage-3 review batch.
 *
 * The sandbox-runtime import stays dynamic: like the Pi SDK in `session.ts`,
 * a top-level value import would load the module before the environment is
 * settled, so only `import type` appears at module scope.
 */

import { mkdirSync } from "node:fs";
import type { SessionRole } from "../../shared/protocol.js";
import { rulePaths, type CanonFn, type Roots, type RulePaths } from "../guard/vault-paths.js";
import { sandboxConfigFor } from "./config.js";

/** What the guard's bash path gets: wrap on the way in, annotate on the way out. */
export interface SandboxRunner {
  /** The command rewritten to run inside the sandbox for `role`. */
  wrap(command: string, commandId: string, role: SessionRole): Promise<string>;
  /** `stderr` with the sandbox violations attributed to `commandId` appended. */
  annotate(commandId: string, stderr: string): string;
  /** Tear the sandbox down (proxies, log monitor); the next `wrap` re-initializes. */
  reset(): Promise<void>;
}

/**
 * The directory the sandbox hands the child as `TMPDIR`, in the same order
 * sandbox-runtime resolves it (`CLAUDE_CODE_TMPDIR` → `CLAUDE_TMPDIR` →
 * `/tmp/claude`, empty values counting as unset).
 *
 * Spelled canonically (`/private/tmp/claude`): `/tmp` is a symlink to
 * `/private/tmp`, and the seatbelt profile pins the real path.
 */
export function sandboxTmpDir(env: NodeJS.ProcessEnv): string {
  const configured = env["CLAUDE_CODE_TMPDIR"] || env["CLAUDE_TMPDIR"];
  return configured === undefined || configured === "" ? "/private/tmp/claude" : configured;
}

/**
 * Create `TMPDIR` for sandboxed commands. The runtime lists it as writable but
 * never creates it, so without this every here-doc (`cannot create temp file
 * for here document`) and every `mkdtemp(os.tmpdir())` in a wrapped command
 * fails with ENOENT. An existing directory is left untouched.
 */
function ensureSandboxTmpDir(env: NodeJS.ProcessEnv): void {
  const dir = sandboxTmpDir(env);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // Fail closed: the guard turns a throwing `wrap` into a refused command.
    throw new Error(`沙盒临时目录建不了（${dir}：${detail}）`);
  }
}

/** A violation path counts when the match does not continue with a path character. */
function mentionsPath(text: string, path: string): boolean {
  let index = text.indexOf(path);
  while (index !== -1) {
    const next = text.charAt(index + path.length);
    if (next === "" || !/[\w.-]/.test(next)) return true;
    index = text.indexOf(path, index + 1);
  }
  return false;
}

const COURSE_HINT = "课程页和看板不能用 bash 写：课程会话用 course_close，总控用 course_plan。";
const CALENDAR_HINT = "日历用 calendar_write 写。";
const RAW_HINT = "原料只读。";

/**
 * The "use the dedicated tool instead" line for an annotated failure: whatever
 * the closed path is, the model should hear which tool owns it. Rule paths come
 * from the same `rulePaths` the sandbox config uses, so the hint cannot drift
 * from the policy. Returns an empty string when no rule path is named.
 */
export function toolHint(text: string, rules: RulePaths): string {
  const hints: string[] = [];
  if ([...rules.courses, ...rules.coursesBoard].some((path) => mentionsPath(text, path))) {
    hints.push(COURSE_HINT);
  }
  if (rules.calendar.some((path) => mentionsPath(text, path))) hints.push(CALENDAR_HINT);
  if (rules.raw.some((path) => mentionsPath(text, path))) hints.push(RAW_HINT);
  return hints.map((hint) => `\n${hint}`).join("");
}

export async function createSandboxRunner(roots: Roots, canon: CanonFn): Promise<SandboxRunner> {
  const { SandboxManager } = await import("@anthropic-ai/sandbox-runtime");
  const rules = rulePaths(roots, canon);
  let initialized = false;
  return {
    async wrap(command, commandId, role) {
      // Xuegen ships on macOS only today; elsewhere the command runs as-is and
      // the guard's text-level bash checks are the whole protection.
      if (process.platform !== "darwin") return command;
      const config = sandboxConfigFor(role, roots, canon);
      if (!initialized) {
        // Before initialize: the TMPDIR the sandbox will set for the child has
        // to exist by the time a command runs under it.
        ensureSandboxTmpDir(process.env);
        // enableLogMonitor so seatbelt denials land in the violation store and
        // annotate() can name them.
        await SandboxManager.initialize(config, undefined, true);
        initialized = true;
      }
      // `customConfig` is a per-command Partial<SandboxRuntimeConfig>: each
      // field overrides the initialized config for this invocation, so the
      // role's filesystem lists apply per command and a role change needs no
      // reset. (The proxy reads network.* from the session config, but that
      // section is identical across roles anyway.)
      return SandboxManager.wrapWithSandbox(command, undefined, config, undefined, {
        commandId,
        commandText: command,
      });
    },
    annotate(commandId, stderr) {
      const annotated = SandboxManager.annotateStderrWithSandboxFailures(commandId, stderr);
      return annotated + toolHint(annotated, rules);
    },
    async reset() {
      await SandboxManager.reset();
      initialized = false;
    },
  };
}
