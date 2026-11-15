import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/protocol.js";
import type { DomainGlossary, DomainTerm } from "@shared/data-protocol.js";
import { splitActionMarker, withActionMarker } from "../chat/action-marker.js";
import { strings } from "../strings.js";
import {
  countEntries,
  domainOf,
  domainOpenMessage,
  domainSections,
  filterSections,
  findPage,
  neighbour,
} from "./domain.js";

const PAGE_PATH = "/v/wiki/knowledge/concepts/paradigm/closure.md";
const STORE_PATH = "/v/wiki/knowledge/concepts/paradigm/store.md";
const CLOSURE_TERM_PATH = "/v/wiki/knowledge/concepts/paradigm/closure.md#term";

function message(role: "user" | "assistant", markdown: string): ChatMessage {
  return { id: markdown, role, markdown, streaming: false, toolCalls: [] };
}

function term(partial: Partial<DomainTerm>): DomainTerm {
  return {
    term: "闭包",
    en: "closure",
    path: CLOSURE_TERM_PATH,
    page: "闭包与静态作用域",
    kind: "term",
    definition: null,
    ...partial,
  };
}

const PAGE_ONE = term({
  term: "闭包与静态作用域",
  en: "closure · static scoping",
  path: PAGE_PATH,
  kind: "page",
});
const PAGE_TWO = term({
  term: "单赋值存储",
  en: "single-assignment store",
  path: STORE_PATH,
  kind: "page",
  page: "单赋值存储",
});

function glossary(other: DomainTerm[] = []): DomainGlossary {
  return {
    subject: "paradigm",
    title: "编程范式",
    summary: null,
    groups: [
      {
        label: "CTM D2 · 11-14",
        course: "ctm",
        lesson: "D2",
        date: "2026-11-14",
        terms: [PAGE_ONE, term({})],
      },
      {
        label: "CTM D1 · 11-12",
        course: "ctm",
        lesson: "D1",
        date: "2026-11-12",
        terms: [PAGE_TWO],
      },
    ],
    other,
  };
}

describe("domainOf", () => {
  it("reads the subject from the first user message carrying a domain marker", () => {
    const messages = [
      message("assistant", "先说说你的计划。"),
      message(
        "user",
        withActionMarker("打开这个领域", "domain", { slug: "paradigm", title: "领域 · 编程范式" }),
      ),
      message("user", withActionMarker("再来一个", "domain", { slug: "ctm", title: "领域 · CTM" })),
    ];
    expect(domainOf(messages)).toEqual({ subject: "paradigm", title: "编程范式" });
  });

  it("returns null when no user message carries a domain marker", () => {
    const messages = [
      message("user", withActionMarker("开今天的课", "open", { slug: "ctm", title: "CTM" })),
      message("assistant", "好。"),
    ];
    expect(domainOf(messages)).toBeNull();
  });

  it("skips an earlier marker of another kind and reads the domain one", () => {
    const messages = [
      message("user", withActionMarker("开今天的课", "open", { slug: "ctm", title: "CTM" })),
      message("assistant", "好。"),
      message(
        "user",
        withActionMarker("打开这个领域", "domain", { slug: "paradigm", title: "领域 · 编程范式" }),
      ),
    ];
    expect(domainOf(messages)?.subject).toBe("paradigm");
  });

  it("falls back to the marker title when it lacks the 领域 · prefix", () => {
    const messages = [message("user", withActionMarker("打开", "domain", { slug: "ctm", title: "CTM" }))];
    expect(domainOf(messages)).toEqual({ subject: "ctm", title: "CTM" });
  });
});

describe("domainSections", () => {
  it("turns every group into a section in order, one section per group", () => {
    const sections = domainSections(glossary());
    expect(sections.map((section) => section.label)).toEqual(["CTM D2 · 11-14", "CTM D1 · 11-12"]);
    expect(sections[0]?.entries).toHaveLength(2);
  });

  it("appends an 其他 section when the glossary has ungrouped terms", () => {
    const sections = domainSections(glossary([term({ term: "Prolog 逻辑编程", path: "/v/wiki/x.md" })]));
    expect(sections.map((section) => section.label)).toEqual([
      "CTM D2 · 11-14",
      "CTM D1 · 11-12",
      strings.domain.otherGroup,
    ]);
    expect(sections[2]?.entries).toHaveLength(1);
  });
});

describe("filterSections", () => {
  it("keeps the term hit by its Chinese name and drops sections left empty", () => {
    const filtered = filterSections(domainSections(glossary()), "闭包");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.entries.map((entry) => entry.term)).toEqual(["闭包与静态作用域", "闭包"]);
  });

  it("matches the English name regardless of case", () => {
    const filtered = filterSections(domainSections(glossary()), "STORE");
    expect(filtered.flatMap((section) => section.entries).map((entry) => entry.term)).toEqual(["单赋值存储"]);
  });

  it("returns the sections untouched for a blank query", () => {
    const sections = domainSections(glossary());
    expect(filterSections(sections, "   ")).toBe(sections);
  });

  it("yields no sections when nothing matches", () => {
    expect(filterSections(domainSections(glossary()), "monad")).toEqual([]);
  });
});

describe("countEntries", () => {
  it("sums every entry of every section", () => {
    expect(countEntries(domainSections(glossary()))).toBe(3);
    expect(countEntries(domainSections(glossary([term({ path: "/v/wiki/y.md" })])))).toBe(4);
  });

  it("is zero for no sections", () => {
    expect(countEntries([])).toBe(0);
  });
});

describe("domainOpenMessage", () => {
  it("carries the domain marker with the subject as slug and the plain title", () => {
    const marker = splitActionMarker(domainOpenMessage("paradigm", "编程范式"));
    expect(marker.action).toBe("domain");
    expect(marker.slug).toBe("paradigm");
    expect(marker.courseTitle).toBe("编程范式");
    expect(marker.body).toBe(strings.domain.openPrompt("编程范式", "paradigm"));
  });

  it("survives a round trip through domainOf", () => {
    const messages = [message("user", domainOpenMessage("paradigm", "编程范式"))];
    expect(domainOf(messages)).toEqual({ subject: "paradigm", title: "编程范式" });
  });

  it("still reads the plain title out of an old marker that carries 「领域 · 」", () => {
    const messages = [
      message(
        "user",
        withActionMarker("打开这个领域", "domain", { slug: "paradigm", title: "领域 · 编程范式" }),
      ),
    ];
    expect(domainOf(messages)).toEqual({ subject: "paradigm", title: "编程范式" });
  });
});

describe("neighbour", () => {
  const sections = domainSections(glossary());

  it("walks forward and backward between pages, skipping term entries", () => {
    expect(neighbour(sections, PAGE_PATH, 1)?.path).toBe(STORE_PATH);
    expect(neighbour(sections, STORE_PATH, -1)?.path).toBe(PAGE_PATH);
  });

  it("returns null at both ends", () => {
    expect(neighbour(sections, PAGE_PATH, -1)).toBeNull();
    expect(neighbour(sections, STORE_PATH, 1)).toBeNull();
  });

  it("returns null for a path that is not in the filtered result", () => {
    expect(neighbour(filterSections(sections, "闭包"), STORE_PATH, 1)).toBeNull();
  });
});

describe("findPage", () => {
  const sections = domainSections(glossary());
  const target = "knowledge/concepts/paradigm/closure";

  it("finds the page a plain target names, with its section label", () => {
    expect(findPage(sections, target)).toEqual({ entry: PAGE_ONE, label: "CTM D2 · 11-14" });
  });

  it("accepts a `wiki/` prefix, a leading slash, a `.md` suffix and a `#…` fragment", () => {
    expect(findPage(sections, `wiki/${target}`)?.entry.path).toBe(PAGE_PATH);
    expect(findPage(sections, `/wiki/${target}.md`)?.entry.path).toBe(PAGE_PATH);
    expect(findPage(sections, `${target}.md#小节`)?.entry.path).toBe(PAGE_PATH);
  });

  it("accepts a percent-encoded target", () => {
    expect(findPage(sections, encodeURIComponent(target))?.entry.path).toBe(PAGE_PATH);
  });

  it("opens the page, not the `#term` entry, when the target carries a fragment", () => {
    expect(findPage(sections, `wiki/knowledge/concepts/paradigm/closure#term`)?.entry.kind).toBe("page");
  });

  it("returns null for a page the subject does not have", () => {
    expect(findPage(sections, "knowledge/concepts/paradigm/monad")).toBeNull();
  });

  it("returns null for a course page, which is not in the glossary", () => {
    expect(findPage(sections, "wiki/courses/ctm/2026-11-14")).toBeNull();
  });
});
