/**
 * Wiki page reader for `wiki.read`.
 *
 * The terms block links concept pages, but the user's Obsidian may register
 * the vault under a different root than xuegen's (one side symlinked), so an
 * `obsidian://` open can fail to find the vault. Instead the page is read
 * here and rendered by the renderer itself.
 *
 * The path arrives from the renderer as an absolute `<vault>/wiki/…/*.md`
 * path and is not trusted: the `wiki/` root and the target are both
 * realpath'd and compared — the same guard `src/agent/session-file.ts` uses —
 * which closes `../` escapes and symlinks pointing out of `wiki/`.
 */

import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join, sep } from "node:path";
import type { DataResponse, WikiPage } from "../../shared/data-protocol.js";

/** Pages past this size are left for Obsidian instead of crossing IPC. */
const MAX_PAGE_BYTES = 512 * 1024;

/** Leading YAML frontmatter: `---\n…\n---` followed by a newline or EOF. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

const OUTSIDE_WIKI: DataResponse = {
  ok: false,
  code: "invalid-request",
  error: "只能打开知识库 wiki 里的页面。",
};

const PAGE_GONE: DataResponse = {
  ok: false,
  code: "invalid-request",
  error: "这一页不在了。",
};

const PAGE_TOO_BIG: DataResponse = {
  ok: false,
  code: "invalid-request",
  error: "页面太大，请在 Obsidian 里打开。",
};

/** Strip a leading frontmatter block; every other byte is returned as-is. */
function stripFrontmatter(text: string): string {
  const match = FRONTMATTER.exec(text);
  return match === null ? text : text.slice(match[0].length);
}

/** The text of the first non-empty `# ` heading in the page, or null. */
function firstHeading(markdown: string): string | null {
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("# ")) continue;
    const title = line.slice(2).trim();
    if (title !== "") return title;
  }
  return null;
}

/**
 * Build the page payload from its raw text: frontmatter removed, title from
 * the first H1 or — when the page has none — the file name without `.md`.
 */
export function parseWikiPage(path: string, text: string): WikiPage {
  const markdown = stripFrontmatter(text);
  return { path, title: firstHeading(markdown) ?? basename(path, ".md"), markdown };
}

/**
 * Read one wiki page for display, or a failure response. Only regular `.md`
 * files physically inside `<vault>/wiki/` are served; a missing root, a
 * missing page, or a dangling link all read as "page gone".
 */
export function readWikiPage(vault: string, path: string): DataResponse {
  if (!path.endsWith(".md")) return OUTSIDE_WIKI;
  let root: string;
  let full: string;
  try {
    root = realpathSync(join(vault, "wiki"));
    full = realpathSync(path);
  } catch {
    return PAGE_GONE;
  }
  if (!full.startsWith(`${root}${sep}`)) return OUTSIDE_WIKI;
  const stat = statSync(full);
  if (!stat.isFile()) return OUTSIDE_WIKI;
  if (stat.size > MAX_PAGE_BYTES) return PAGE_TOO_BIG;
  let text: string;
  try {
    text = readFileSync(full, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, code: "unknown", error: `这一页读不出来：${detail}` };
  }
  return { ok: true, data: parseWikiPage(path, text) };
}
