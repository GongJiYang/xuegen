/**
 * `[[…]]` wikilinks in model answers (user 11-15, `domain.html` ③).
 *
 * A concept answer cites its sources as `[[wiki/knowledge/…/100-x|标题]]`. Left
 * alone, those brackets reach the reader verbatim. This remark plugin (mdast, so
 * it runs before `remark-rehype`) rewrites them into ordinary `a` elements
 * carrying the `xg-wikilink` class, which a skin draws as a small chip. The href
 * is `#wiki:<encoded target>`: a fragment URL that never navigates, so the 领域
 * page can intercept a click and open that page in the column beside.
 *
 * Only plain text is rewritten: code, math and existing links keep their
 * brackets, because there they are literal content, not a citation.
 */

import type { Root } from "mdast";

/** One piece of a text node after splitting it on `[[…]]` markers. */
export type WikilinkChunk = { kind: "text"; value: string } | { kind: "link"; target: string; label: string };

const WIKILINK_RE = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

const HREF_PREFIX = "#wiki:";

/** The class the skin styles and the 领域 page's click handler looks for. */
export const WIKILINK_CLASS = "xg-wikilink";

/**
 * The label to show when a wikilink carries no `|label`: the last path segment,
 * minus a `.md` suffix — `wiki/…/100-ctm` reads better than the whole path.
 */
function labelOf(target: string): string {
  const segments = target.split("/");
  const last = segments[segments.length - 1] ?? target;
  return last.endsWith(".md") ? last.slice(0, -".md".length) : last;
}

/** Split one text value into plain runs and wikilink chunks (in order). */
export function splitWikilinks(value: string): WikilinkChunk[] {
  const chunks: WikilinkChunk[] = [];
  let cursor = 0;
  WIKILINK_RE.lastIndex = 0;
  for (let match = WIKILINK_RE.exec(value); match !== null; match = WIKILINK_RE.exec(value)) {
    const target = (match[1] ?? "").trim();
    if (target === "") continue;
    if (match.index > cursor) chunks.push({ kind: "text", value: value.slice(cursor, match.index) });
    const label = (match[2] ?? "").trim();
    chunks.push({ kind: "link", target, label: label === "" ? labelOf(target) : label });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) chunks.push({ kind: "text", value: value.slice(cursor) });
  return chunks;
}

/**
 * The target a wikilink href names, or null when `href` is not one of ours —
 * including a `decodeURIComponent` failure, which hostile input can provoke.
 */
export function wikilinkHrefTarget(href: string | null): string | null {
  if (href === null || !href.startsWith(HREF_PREFIX)) return null;
  try {
    return decodeURIComponent(href.slice(HREF_PREFIX.length));
  } catch {
    return null;
  }
}

/** The markdown-equivalent node for one link chunk. */
function linkNode(target: string, label: string): unknown {
  return {
    type: "link",
    url: HREF_PREFIX + encodeURIComponent(target),
    data: { hProperties: { className: [WIKILINK_CLASS] } },
    children: [{ type: "text", value: label }],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isParent(node: unknown): node is { type: string; children: unknown[] } {
  return isRecord(node) && typeof node.type === "string" && Array.isArray(node.children);
}

/**
 * Rewrite every text node of `parent`, in place, and recurse into its children.
 *
 * A small hand-written walk beats pulling in `unist-util-visit` for the one
 * shape checked here: `text` under anything but a `link` is the only thing that
 * becomes a wikilink.
 */
function rewrite(parent: { type: string; children: unknown[] }): void {
  const next: unknown[] = [];
  for (const child of parent.children) {
    if (
      isRecord(child) &&
      child.type === "text" &&
      typeof child.value === "string" &&
      parent.type !== "link"
    ) {
      for (const chunk of splitWikilinks(child.value)) {
        next.push(
          chunk.kind === "text" ? { type: "text", value: chunk.value } : linkNode(chunk.target, chunk.label),
        );
      }
      continue;
    }
    if (isParent(child)) rewrite(child);
    next.push(child);
  }
  parent.children = next;
}

/** The remark plugin: run it after parsing / GFM / math, before `remark-rehype`. */
export function remarkWikilink(): (tree: Root) => void {
  return (tree) => {
    rewrite(tree);
  };
}
