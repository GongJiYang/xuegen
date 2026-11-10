/**
 * Reading sources: the原件 under `raw/` and `clippings/` that
 * can still be added to the reading queue.
 *
 * `reading-queue.mjs add` only accepts原文 inside `raw/` or `clippings/`, so
 * the composer's "加入阅读" field offers exactly those files. A
 * file already linked from a reading page's `source` frontmatter is excluded,
 * because adding it again would fail on the existing slug.
 *
 * The main process owns the filesystem, so this listing happens here rather than
 * in a skill script: it is a cheap directory walk with no state of its own.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { existsSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import type { ReadingSource } from "../../shared/data-protocol.js";

/**
 * The directories a reading source may live in, per `reading-queue.mjs`.
 * `clippings/` holds web clippings.
 */
const SOURCE_ROOTS = ["raw", "clippings"] as const;

/** Extensions the reading queue accepts as原文. */
const SOURCE_EXTENSIONS = [".md", ".pdf"] as const;

/** At most this many candidates are returned, newest first. */
const MAX_SOURCES = 50;

/** Normalize a path to forward slashes so comparisons match the link format. */
function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/** True for a path ending in an accepted原文 extension. */
function isSourceFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SOURCE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Walk `dir` recursively, returning absolute file paths. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && isSourceFile(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The vault-relative paths already referenced by a reading page's `source`.
 *
 * A reading page stores `source: "[[raw/articles/x]]"`; the link is resolved
 * relative to the vault with an implicit `.md` in `reading-queue.mjs verify`. We
 * compare on the path without an extension so both `.md` and `.pdf` sources are
 * matched the same way the script treats them.
 */
function queuedPaths(vault: string): Set<string> {
  const dir = join(vault, "wiki", "reading");
  const queued = new Set<string>();
  if (!existsSync(dir)) return queued;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md") || name.startsWith(".")) continue;
    let text: string;
    try {
      text = readFileSync(join(dir, name), "utf8");
    } catch {
      continue;
    }
    const match = text.match(/^source:\s*"\[\[([^\]|]+)/m) ?? text.match(/^source:\s*\[\[([^\]|]+)/m);
    const link = match?.[1];
    if (link) queued.add(link.replace(/\.[^./]+$/, ""));
  }
  return queued;
}

/**
 * List candidate原文 files under `raw/` and `clippings/`.
 *
 * Newest modification time first, capped at {@link MAX_SOURCES}. Files already
 * linked from a reading page are omitted so the list only contains what the
 * "加入阅读" action can actually add.
 */
export function listReadingSources(vault: string): ReadingSource[] {
  const queued = queuedPaths(vault);
  const found: ReadingSource[] = [];
  if (!existsSync(vault)) return found;
  // Match by lowercase: on a case-insensitive volume the directory may be
  // spelled differently on disk.
  const wanted = new Set(SOURCE_ROOTS.map((root) => root.toLowerCase()));
  const roots = readdirSync(vault).filter((name) => wanted.has(name.toLowerCase()));
  for (const root of roots) {
    for (const file of walk(join(vault, root))) {
      const path = toPosix(relative(vault, file));
      if (queued.has(path.replace(/\.[^./]+$/, ""))) continue;
      let modifiedAt = 0;
      try {
        modifiedAt = statSync(file).mtimeMs;
      } catch {
        continue;
      }
      found.push({ path, name: basename(file).replace(/\.[^./]+$/, ""), modifiedAt });
    }
  }
  return found.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, MAX_SOURCES);
}
