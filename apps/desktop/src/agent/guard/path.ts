/**
 * Path canonicalization for the tool guard (ARCH-DISCUSSION-1109 §10.2).
 *
 * Comparing raw path strings is not enough on APFS: case folding and Unicode
 * normalization make different spellings name the same file, and a symlink
 * anywhere in the chain changes where a path lands. `canonical` therefore
 * resolves symlinks through the deepest existing ancestor, normalizes to NFC,
 * and folds case when the volume is case-insensitive, so two spellings of one
 * file compare equal. All inputs the guard compares (roots, allow lists, tool
 * paths) go through it.
 *
 * Pure: the filesystem facts it needs arrive as {@link PathFacts} parameters.
 *
 * `canonicalParts` returns the resolved path and its case-folded form from one
 * resolution, so the guard can check one value and rewrite the tool input to
 * the very same one (时间检查与使用同一条路径, Mind the Gap).
 */

import { basename, dirname, join, resolve } from "node:path";

/**
 * The filesystem facts `canonical` needs, injected so the function stays pure.
 *
 * `realpath` throws `ENOENT` for a path that does not exist; any other error
 * propagates (a permission failure must not silently degrade the comparison).
 */
export interface PathFacts {
  realpath(p: string): string;
  /** True when the volume holding `dir` folds case (`Dir` === `dir`). */
  caseInsensitive(dir: string): boolean;
}

/** One resolution seen two ways: the absolute form and the comparable form. */
export interface CanonicalPath {
  /** Absolute path with symlinks resolved through the deepest existing ancestor, NFC, case kept. */
  resolved: string;
  /** `resolved` folded to lower case when the volume is case-insensitive; the guard compares this. */
  canonical: string;
}

interface ResolvedPath {
  /** Absolute path with symlinks resolved through the deepest existing ancestor, NFC. */
  resolved: string;
  /** The deepest ancestor that exists (used for the volume's case check). */
  anchor: string;
}

/**
 * Resolve `path` against `cwd`, then stitch symlinks back together.
 *
 * `realpath` only works on paths that exist, so for a file that does not exist
 * yet the walk climbs to the deepest ancestor that resolves, then rejoins the
 * missing tail segments (which keep their original spelling — there is nothing
 * on disk to resolve them against).
 */
function resolveDeep(path: string, cwd: string, facts: PathFacts): ResolvedPath {
  const absolute = resolve(cwd, path);
  const missing: string[] = [];
  let dir = absolute;
  for (;;) {
    try {
      const anchor = facts.realpath(dir);
      const resolved = missing.length === 0 ? anchor : join(anchor, ...missing);
      return { resolved: resolved.normalize("NFC"), anchor };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(dir);
      if (parent === dir) return { resolved: absolute.normalize("NFC"), anchor: dir };
      missing.unshift(basename(dir));
      dir = parent;
    }
  }
}

/**
 * Expand a leading `~` to `userHome` (shells and model-written paths use it).
 *
 * Only `~` / `~/…` is a home reference; `~user` and a bare `~` inside a word
 * are left alone (nothing in the skills writes them, and guessing would make
 * two different strings canonicalize to one path).
 */
export function expandTilde(path: string, userHome: string): string {
  if (path === "~") return userHome;
  return path.startsWith("~/") ? `${userHome}${path.slice(1)}` : path;
}

/** Resolve once and return both the absolute form and the comparable form. */
export function canonicalParts(path: string, cwd: string, facts: PathFacts): CanonicalPath {
  const { resolved, anchor } = resolveDeep(path, cwd, facts);
  return { resolved, canonical: facts.caseInsensitive(anchor) ? resolved.toLowerCase() : resolved };
}

/**
 * Canonicalize a tool-supplied path: resolve against `cwd`, stitch symlinks
 * through the deepest existing ancestor, NFC, then fold case when the volume
 * holding the deepest existing ancestor is case-insensitive.
 */
export function canonical(path: string, cwd: string, facts: PathFacts): string {
  return canonicalParts(path, cwd, facts).canonical;
}

/**
 * The absolute path `canonical` checks, before the case fold.
 *
 * The guard rewrites a tool's `path` input to this so the tool writes exactly
 * the file that was checked — symlinks already resolved, no second lookup
 * between check and use (ARCH-DISCUSSION-1109 §10.2, Mind the Gap).
 */
export function resolvedInput(path: string, cwd: string, facts: PathFacts): string {
  return canonicalParts(path, cwd, facts).resolved;
}

/**
 * True when `child` is inside `parent` (or equal to it), compared path segment
 * by path segment so `/a/bc` is not treated as inside `/a/b`.
 *
 * Both arguments must be outputs of {@link canonical}; the trailing-slash form
 * keeps the comparison segment-aligned.
 */
export function within(child: string, parent: string): boolean {
  if (child === parent) return true;
  const prefix = parent.endsWith("/") ? parent : `${parent}/`;
  return child.startsWith(prefix);
}
