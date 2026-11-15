/**
 * The 领域 tab's data (user 11-15, domain.html): one subject's glossary loaded
 * through the data channel, the search box's filtered view, and the page being
 * read in the centre. The tab is read-only — nothing here writes.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { DomainGlossary, DomainTerm } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { strings } from "../strings.js";
import { countEntries, domainSections, filterSections, neighbour, type DomainSection } from "./domain.js";
import { obsidianUrl, stripTitle } from "./terms.js";
import { useBoardResource, type LoadResult } from "./use-resource.js";

/** A glossary request that a null subject never sends. */
const NEVER = new Promise<LoadResult<DomainGlossary>>(() => {});

/** The page open in the centre column; `markdown` is null while it reads. */
export interface DomainPage {
  path: string;
  title: string;
  /** 「概念页 · CTM D2 · 11-14」. */
  crumb: string;
  markdown: string | null;
  error: string | null;
  /** `obsidian://` link for the same page. */
  external: string;
}

export interface DomainState {
  /** null while reading, "failed" when the glossary could not be read. */
  glossary: DomainGlossary | null | "failed";
  query: string;
  setQuery(query: string): void;
  /** The sections after `query` filtering (what ← → walk). */
  sections: DomainSection[];
  /** How many entries the subject has, filter or no filter. */
  total: number;
  page: DomainPage | null;
  openPage(entry: DomainTerm, groupLabel: string): void;
  closePage(): void;
  /** Flip to the neighbouring page in the filtered list. */
  step(direction: -1 | 1): void;
}

/** The section an entry sits in, for the reader's crumb when stepping into it. */
function labelOf(sections: DomainSection[], path: string): string {
  const found = sections.find((section) =>
    section.entries.some((entry) => entry.path === path && entry.kind === "page"),
  );
  return found?.label ?? strings.domain.otherGroup;
}

/**
 * The whole 领域 state for one subject; null when no 领域 session is open (so a
 * skin can render nothing without branching on a flag).
 */
export function useDomain(subject: string | null): DomainState | null {
  const resource = useBoardResource(
    () => (subject === null ? NEVER : client.data({ kind: "domain.glossary", subject })),
    [subject],
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<DomainPage | null>(null);
  const [seenSubject, setSeenSubject] = useState(subject);
  const request = useRef(0);

  // Another subject starts from scratch: its own search and its own page.
  // Adjusted during render (React's "derive state from props") so the first
  // paint after a switch never shows the previous subject's search or page; the
  // stale `wiki.read` below is dropped by its path guard.
  if (subject !== seenSubject) {
    setSeenSubject(subject);
    setQuery("");
    setPage(null);
  }

  const glossary: DomainGlossary | null | "failed" =
    resource.state.status === "error"
      ? "failed"
      : resource.state.status === "ready"
        ? resource.state.value
        : null;
  const allSections = useMemo(
    () => (glossary === null || glossary === "failed" ? [] : domainSections(glossary)),
    [glossary],
  );
  const sections = useMemo(() => filterSections(allSections, query), [allSections, query]);

  const openPage = useCallback((entry: DomainTerm, groupLabel: string) => {
    const ticket = (request.current += 1);
    setPage({
      path: entry.path,
      title: entry.page,
      crumb: strings.domain.entryCrumb(groupLabel),
      markdown: null,
      error: null,
      external: obsidianUrl(entry.path),
    });
    void client.data({ kind: "wiki.read", path: entry.path }).then((result) => {
      // A second click before the first answer wins: only the latest ticket lands.
      if (ticket !== request.current) return;
      setPage((current) => {
        if (current === null || current.path !== entry.path) return current;
        return result.ok
          ? { ...current, markdown: stripTitle(result.data.markdown) }
          : { ...current, error: result.error };
      });
    });
  }, []);

  const closePage = useCallback(() => {
    request.current += 1;
    setPage(null);
  }, []);

  const step = useCallback(
    (direction: -1 | 1) => {
      if (page === null) return;
      const next = neighbour(sections, page.path, direction);
      if (next === null) return;
      openPage(next, labelOf(sections, next.path));
    },
    [page, sections, openPage],
  );

  if (subject === null) return null;
  return {
    glossary,
    query,
    setQuery,
    sections,
    total: countEntries(allSections),
    page,
    openPage,
    closePage,
    step,
  };
}
