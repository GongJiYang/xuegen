/**
 * The real {@link PathFacts} for the tool guard, the existence probe its raw
 * material rule needs, and the roots it compares against.
 *
 * `caseInsensitive` is decided per volume: stat the case-flipped spelling of a
 * directory — if it lands on the same inode, the volume folds case. The result
 * is cached by device id, so each volume is probed once.
 */

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "../environment.js";
import { canonical, type PathFacts } from "./path.js";
import type { Roots } from "./roles.js";

/** Swap letter case so a case-insensitive volume resolves to the same inode. */
function flipCase(path: string): string {
  let result = "";
  for (const ch of path) {
    const lower = ch.toLowerCase();
    result += lower === ch ? ch.toUpperCase() : lower;
  }
  return result;
}

/** Probe one directory's volume for case folding. */
function probeCaseInsensitive(dir: string): boolean {
  const flipped = flipCase(dir);
  if (flipped === dir) {
    // No letters to flip: fall back to the platforms whose default volumes fold
    // case (APFS/HFS+, NTFS).
    return process.platform === "darwin" || process.platform === "win32";
  }
  try {
    return statSync(flipped).ino === statSync(dir).ino;
  } catch {
    return false;
  }
}

/** `PathFacts` backed by the real filesystem; case verdicts cached per volume. */
export function nodePathFacts(): PathFacts {
  const caseByDevice = new Map<number, boolean>();
  return {
    realpath: (path) => realpathSync.native(path),
    caseInsensitive(dir) {
      const device = statSync(dir).dev;
      const cached = caseByDevice.get(device);
      if (cached !== undefined) return cached;
      const insensitive = probeCaseInsensitive(dir);
      caseByDevice.set(device, insensitive);
      return insensitive;
    },
  };
}

/**
 * Whether a canonical path already exists.
 *
 * The clipping rule needs this: 原料 may be added but never overwritten, so the
 * guard has to tell a new clip from an existing one.
 */
export function existsOnDisk(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

/**
 * The configured vault root from `<home>/wiki.json`, or null when missing or
 * malformed.
 *
 * `main/data/vault.ts` has the same lookup, but the dependency direction is
 * `main -> agent`: the agent cannot import it, so the read is duplicated here
 * (three lines of JSON, not worth a shared home for).
 */
export function readVaultRoot(home: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(join(home, "wiki.json"), "utf8")) as { root?: unknown };
    if (typeof parsed.root === "string" && parsed.root.trim() !== "") return parsed.root.trim();
    return null;
  } catch {
    return null;
  }
}

/**
 * Canonical roots the guard compares tool paths against.
 *
 * When `wiki.json` is missing there is no vault to protect; the sentinel path
 * inside `home` keeps the rules fail-closed (nothing real is ever inside it).
 * `temp` is `os.tmpdir()` — macOS hands out `/var/folders/…/T`, which the guard
 * must accept as scratch space alongside `/private/tmp`.
 */
export function guardRoots(home: string, cwd: string, facts: PathFacts): Roots {
  const canon = (path: string): string => canonical(path, cwd, facts);
  const vault = readVaultRoot(home) ?? join(home, ".xuegen-no-vault");
  return {
    vault: canon(vault),
    workspace: canon(cwd),
    home: canon(home),
    repo: canon(repoRoot),
    temp: canon(tmpdir()),
  };
}
