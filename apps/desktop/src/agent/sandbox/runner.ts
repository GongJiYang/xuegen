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

import type { SessionRole } from "../../shared/protocol.js";
import type { CanonFn, Roots } from "../guard/vault-paths.js";
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

export async function createSandboxRunner(roots: Roots, canon: CanonFn): Promise<SandboxRunner> {
  const { SandboxManager } = await import("@anthropic-ai/sandbox-runtime");
  let initialized = false;
  return {
    async wrap(command, commandId, role) {
      // Xuegen ships on macOS only today; elsewhere the command runs as-is and
      // the guard's text-level bash checks are the whole protection.
      if (process.platform !== "darwin") return command;
      const config = sandboxConfigFor(role, roots, canon);
      if (!initialized) {
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
      return SandboxManager.annotateStderrWithSandboxFailures(commandId, stderr);
    },
    async reset() {
      await SandboxManager.reset();
      initialized = false;
    },
  };
}
