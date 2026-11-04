/**
 * Own-session-file guard.
 *
 * A course remembers its session transcript so 继续学习 can reopen it. The path
 * arrives from settings, so before handing it to Pi it must be proven to be a
 * real transcript inside this home's `sessions/` tree. Resolving both the root
 * and the target with `realpathSync` closes the symlink escape: a link inside
 * `sessions/` that points elsewhere resolves outside the root and is rejected.
 */

import { realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

/** True for an existing `.jsonl` file physically inside `<home>/sessions`. */
export function isOwnSessionFile(home: string, file: string): boolean {
  if (!file.endsWith(".jsonl")) return false;
  try {
    const root = realpathSync(resolve(home, "sessions"));
    const full = realpathSync(resolve(file));
    if (!full.startsWith(`${root}${sep}`)) return false;
    return statSync(full).isFile();
  } catch {
    // Missing root, missing file, or a broken link: never a valid transcript.
    return false;
  }
}
