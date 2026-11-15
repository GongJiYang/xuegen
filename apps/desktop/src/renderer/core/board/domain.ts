/**
 * The 领域 tab (user 11-15, domain.html): a read-only glossary of one subject's
 * concept pages, plus its 领域小结. Everything here is pure so the skin only
 * renders what `domainSections` / `filterSections` produced.
 */

import type { DomainGlossary, DomainTerm } from "@shared/data-protocol.js";
import type { ChatMessage } from "@shared/protocol.js";
import { splitActionMarker, withActionMarker } from "../chat/action-marker.js";
import { strings } from "../strings.js";

/** One lesson's share of the glossary (`其他` for the ungrouped tail). */
export interface DomainSection {
  label: string;
  entries: DomainTerm[];
}

/**
 * The subject a transcript belongs to: the first user message the 领域 tab sent
 * carries `⟦xuegen:domain|<subject>|领域 · <title>⟧`.
 */
export function domainOf(messages: readonly ChatMessage[]): { subject: string; title: string } | null {
  const prefix = strings.domain.tabTitle("");
  for (const message of messages) {
    if (message.role !== "user") continue;
    const { action, slug, courseTitle } = splitActionMarker(message.markdown);
    if (action !== "domain" || slug === null) continue;
    const title = courseTitle ?? "";
    return { subject: slug, title: title.startsWith(prefix) ? title.slice(prefix.length) : title };
  }
  return null;
}

/** The glossary as the left column's sections: one per lesson, then 其他. */
export function domainSections(glossary: DomainGlossary): DomainSection[] {
  const sections = glossary.groups.map((group) => ({ label: group.label, entries: group.terms }));
  if (glossary.other.length > 0) sections.push({ label: strings.domain.otherGroup, entries: glossary.other });
  return sections;
}

/**
 * Narrow the sections to the entries matching `query` (a term's Chinese or
 * English name, case-insensitively), dropping sections left empty. A blank query
 * returns the sections untouched.
 */
export function filterSections(sections: DomainSection[], query: string): DomainSection[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return sections;
  return sections
    .map((section) => ({
      label: section.label,
      entries: section.entries.filter(
        (entry) =>
          entry.term.toLowerCase().includes(needle) || (entry.en ?? "").toLowerCase().includes(needle),
      ),
    }))
    .filter((section) => section.entries.length > 0);
}

/** How many entries the (already filtered) sections hold. */
export function countEntries(sections: DomainSection[]): number {
  return sections.reduce((total, section) => total + section.entries.length, 0);
}

/** The message that opens a 领域 session, folded to its tab label like every other action. */
export function domainOpenMessage(subject: string, title: string): string {
  return withActionMarker(strings.domain.openPrompt(title, subject), "domain", {
    slug: subject,
    // The marker carries the plain subject title; the 「领域 · 」 prefix is the
    // tab label's job (see `strings.domain.tabTitle`), so folding the message
    // never doubles it.
    title,
  });
}

/**
 * The page before / after `path` in reading order.
 *
 * Only `kind: "page"` entries are stops: a path can appear both as the page and
 * as a term coined in it, and ← → walk pages.
 */
export function neighbour(sections: DomainSection[], path: string, step: -1 | 1): DomainTerm | null {
  const pages = sections.flatMap((section) => section.entries).filter((entry) => entry.kind === "page");
  const index = pages.findIndex((entry) => entry.path === path);
  if (index === -1) return null;
  return pages[index + step] ?? null;
}

/**
 * The wiki path a wikilink target names, folded to how glossary paths end.
 *
 * A target may be written any of these ways — `wiki/knowledge/…/100-x`,
 * `knowledge/…/100-x.md`, `/wiki/knowledge/…/100-x#小节`, URL-encoded — while an
 * entry's `path` is absolute (`/v/wiki/knowledge/…/100-x.md`). Stripping the
 * decorators leaves the one tail both sides share.
 */
function normalizeTarget(target: string): string {
  let decoded = target;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    // A malformed escape is not worth failing the lookup over; compare as written.
  }
  const withoutFragment = decoded.split("#")[0] ?? decoded;
  const withoutDotSlash = withoutFragment.startsWith("/") ? withoutFragment.slice(1) : withoutFragment;
  const withoutWiki = withoutDotSlash.startsWith("wiki/")
    ? withoutDotSlash.slice("wiki/".length)
    : withoutDotSlash;
  return withoutWiki.endsWith(".md") ? withoutWiki.slice(0, -".md".length) : withoutWiki;
}

/**
 * The glossary page a wikilink target names, with the section it sits in.
 *
 * Null means the target is not a page of this subject — a course record, a page
 * of another subject, or a name the glossary never stored — and the click does
 * nothing rather than guessing.
 */
export function findPage(
  sections: DomainSection[],
  target: string,
): { entry: DomainTerm; label: string } | null {
  const tail = "/wiki/" + normalizeTarget(target) + ".md";
  for (const section of sections) {
    const entry = section.entries.find(
      (candidate) => candidate.kind === "page" && candidate.path.endsWith(tail),
    );
    if (entry !== undefined) return { entry, label: section.label };
  }
  return null;
}
