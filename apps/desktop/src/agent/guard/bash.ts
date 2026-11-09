/**
 * The bash / powershell checks that are decidable at the tool layer
 * (ARCH-DISCUSSION-1109 §7.1「bash」行; the complete restriction lands with
 * the stage-4 system sandbox, so this stays deliberately small).
 *
 * Three things can be judged from the command text alone:
 *
 * - a credential path in the command (the same predicate the read rule uses),
 * - `rm -rf`-like deletion whose targets are outside the workspace,
 * - `chmod` / `chflags` on a course page, which only `course-state.mjs` runs.
 *
 * Everything else passes and is audited by the caller.
 */

import { isDeniedReadPath, rulePaths, withinAny, type CanonFn, type Roots } from "./vault-paths.js";
import { within } from "./path.js";
import type { Decision } from "./roles.js";

const RM = /\brm\b/;
const CHMOD = /\b(?:chmod|chflags)\b/;
const COURSE_STATE = /course-state\.mjs/;

/**
 * Whether this `rm` segment asks for a recursive removal.
 *
 * `rm -r`, `-rf`, `-Rf` and `--recursive` are all the same danger; matching only
 * the literal spelling from the spec would let `rm -fr <vault>` through while
 * blocking `rm -rf`.
 */
function isRecursiveRm(segment: string): boolean {
  const tokens = segment.trim().split(/\s+/);
  const index = tokens.findIndex((token) => token === "rm" || token.endsWith("/rm"));
  if (index < 0) return false;
  for (const token of tokens.slice(index + 1)) {
    if (token === "--recursive") return true;
    // A short flag cluster (`-rf`, `-fr`, `-Rf`) that contains `r`/`R`.
    if (/^-[a-zA-Z]+$/.test(token) && /[rR]/.test(token.slice(1))) return true;
  }
  return false;
}

function deny(reason: string): Decision {
  return { allow: false, reason };
}

/** Judge one shell command for `label` (the role's name, as reasons address it). */
export function decideBash(
  label: string,
  command: unknown,
  roots: Roots,
  canon: CanonFn,
): Decision {
  if (typeof command !== "string" || command.trim() === "") return { allow: true, reason: "" };
  const rules = rulePaths(roots, canon);
  const paths = commandPaths(command, canon);
  for (const target of paths) {
    if (isDeniedReadPath(target, roots, canon)) {
      return deny(`${label}不能碰 ${target}：凭据和密钥不属于学习材料，不要在命令里读或动它。`);
    }
  }
  if (RM.test(command)) {
    for (const target of rmTargets(command, canon)) {
      if (!within(target, roots.workspace) && !withinAny(target, rules.tmp)) {
        return deny(
          `${label}：递归删除（rm -r / rm -rf）的目标 ${target} 不在工作区或 /private/tmp 里，拒绝执行；要清理请限定在工作区内。`,
        );
      }
    }
  }
  if (CHMOD.test(command) && !COURSE_STATE.test(command)) {
    for (const target of paths) {
      if (withinAny(target, rules.courses)) {
        return deny(`${label}不能给课程页改权限：课程页的锁只由 course-state.mjs 脚本动。`);
      }
    }
  }
  return { allow: true, reason: "" };
}

/**
 * Path-looking tokens in a shell command, canonicalized.
 *
 * A token counts as path-ish when it contains `/` or starts with `~`/`.`;
 * everything else (flags, words, substitutions) is ignored. Best-effort by
 * design — the full guarantee lands with the stage-4 system sandbox.
 */
function commandPaths(command: string, canon: CanonFn): string[] {
  const results: string[] = [];
  for (const raw of command.split(/\s+/)) {
    const token = raw.replace(/^["'`]+|["'`]+$/g, "");
    if (token === "" || token.startsWith("-")) continue;
    if (!token.includes("/") && !token.startsWith("~") && !token.startsWith(".")) continue;
    try {
      results.push(canon(token));
    } catch {
      // A token that does not canonicalize is not a usable path; skip it.
    }
  }
  return results;
}

/** The canonical targets of each recursive `rm` segment in `command`. */
function rmTargets(command: string, canon: CanonFn): string[] {
  const targets: string[] = [];
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    if (!isRecursiveRm(segment)) continue;
    let seenRm = false;
    for (const raw of segment.trim().split(/\s+/)) {
      const token = raw.replace(/^["']+|["']+$/g, "");
      if (!seenRm) {
        if (token === "rm" || token.endsWith("/rm")) seenRm = true;
        continue;
      }
      if (token === "" || token.startsWith("-")) continue;
      try {
        targets.push(canon(token));
      } catch {
        // Unresolvable argument: rm will fail on it anyway.
      }
    }
  }
  return targets;
}
