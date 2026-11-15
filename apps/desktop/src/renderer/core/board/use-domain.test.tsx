import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { DomainGlossary, DomainTerm } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import { useDomain, type DomainState } from "./use-domain.js";

const clientMock = vi.hoisted(() => ({ data: vi.fn() }));
vi.mock("../client.js", () => ({ data: clientMock.data }));

const PAGE_ONE_PATH = "/v/wiki/knowledge/concepts/paradigm/closure.md";
const PAGE_TWO_PATH = "/v/wiki/knowledge/concepts/paradigm/store.md";

function term(partial: Partial<DomainTerm>): DomainTerm {
  return {
    term: "闭包",
    en: "closure",
    path: `${PAGE_ONE_PATH}#term`,
    page: "闭包与静态作用域",
    kind: "term",
    definition: null,
    ...partial,
  };
}

const PAGE_ONE = term({ term: "闭包与静态作用域", en: null, path: PAGE_ONE_PATH, kind: "page" });
const PAGE_TWO = term({
  term: "单赋值存储",
  en: "single-assignment store",
  path: PAGE_TWO_PATH,
  kind: "page",
});

function glossary(subject = "paradigm", title = "编程范式"): DomainGlossary {
  return {
    subject,
    title,
    summary: null,
    groups: [
      {
        label: "CTM D2 · 11-14",
        course: "ctm",
        lesson: "D2",
        date: "2026-11-14",
        terms: [PAGE_ONE, term({})],
      },
      { label: "CTM D1 · 11-12", course: "ctm", lesson: "D1", date: "2026-11-12", terms: [PAGE_TWO] },
    ],
    other: [],
  };
}

let captured: DomainState | null = null;

function Harness({ subject }: { subject: string | null }) {
  const domain = useDomain(subject);
  useEffect(() => {
    captured = domain;
  });
  return null;
}

interface Deferred {
  promise: Promise<unknown>;
  resolve(value: unknown): void;
}

/** `wiki.read` requests, released by the test so the in-flight state is observable. */
let reads: { path: string; pending: Deferred }[] = [];

function deferred(): Deferred {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  reads = [];
  captured = null;
  clientMock.data.mockReset();
  clientMock.data.mockImplementation((request: { kind: string; subject?: string; path?: string }) => {
    if (request.kind === "domain.glossary")
      return Promise.resolve({ ok: true, data: glossary(request.subject ?? "paradigm") });
    if (request.kind === "wiki.read") {
      const pending = deferred();
      reads.push({ path: request.path ?? "", pending });
      return pending.promise;
    }
    return Promise.resolve({ ok: true, data: null });
  });
});

afterEach(() => {
  captured = null;
  vi.restoreAllMocks();
});

describe("useDomain — 词表与过滤", () => {
  it("exposes the sections and the unfiltered total once the glossary arrives", async () => {
    render(<Harness subject="paradigm" />);
    await act(async () => {});
    expect(captured?.glossary === "failed" ? null : captured?.glossary?.title).toBe("编程范式");
    expect(captured?.sections.map((section) => section.label)).toEqual(["CTM D2 · 11-14", "CTM D1 · 11-12"]);
    expect(captured?.total).toBe(3);
    expect(clientMock.data.mock.calls[0]?.[0]).toEqual({ kind: "domain.glossary", subject: "paradigm" });
  });

  it("narrows the sections on setQuery but keeps the total", async () => {
    render(<Harness subject="paradigm" />);
    await act(async () => {});
    act(() => captured?.setQuery("store"));
    expect(captured?.query).toBe("store");
    expect(captured?.sections.flatMap((section) => section.entries).map((entry) => entry.term)).toEqual([
      "单赋值存储",
    ]);
    expect(captured?.total).toBe(3);
  });

  it("returns null (and sends no request) while the subject is null", async () => {
    render(<Harness subject={null} />);
    await act(async () => {});
    expect(captured).toBeNull();
    expect(clientMock.data).not.toHaveBeenCalled();
  });
});

describe("useDomain — 读一页", () => {
  it("shows the page loading first, then its markdown without the H1", async () => {
    render(<Harness subject="paradigm" />);
    await act(async () => {});
    act(() => captured?.openPage(PAGE_ONE, "CTM D2 · 11-14"));

    expect(captured?.page).toMatchObject({
      path: PAGE_ONE_PATH,
      title: "闭包与静态作用域",
      crumb: strings.domain.entryCrumb("CTM D2 · 11-14"),
      markdown: null,
      error: null,
    });
    expect(captured?.page?.external).toBe(`obsidian://open?path=${encodeURIComponent(PAGE_ONE_PATH)}`);
    expect(reads.map((read) => read.path)).toEqual([PAGE_ONE_PATH]);

    await act(async () => {
      reads[0]?.pending.resolve({
        ok: true,
        data: {
          path: PAGE_ONE_PATH,
          title: "闭包与静态作用域",
          markdown: "# 闭包与静态作用域\n\n代码 + 环境。\n",
        },
      });
      await Promise.resolve();
    });
    expect(captured?.page?.markdown).toBe("代码 + 环境。\n");
    expect(captured?.page?.error).toBeNull();
  });

  it("keeps the page open with the error when wiki.read fails", async () => {
    render(<Harness subject="paradigm" />);
    await act(async () => {});
    act(() => captured?.openPage(PAGE_ONE, "CTM D2 · 11-14"));
    await act(async () => {
      reads[0]?.pending.resolve({ ok: false, code: "script-failed", error: "没有这个文件" });
      await Promise.resolve();
    });
    expect(captured?.page?.markdown).toBeNull();
    expect(captured?.page?.error).toBe("没有这个文件");
  });

  it("ignores a stale answer when a second page is opened right after the first", async () => {
    render(<Harness subject="paradigm" />);
    await act(async () => {});
    act(() => captured?.openPage(PAGE_ONE, "CTM D2 · 11-14"));
    act(() => captured?.openPage(PAGE_TWO, "CTM D1 · 11-12"));
    await act(async () => {
      reads[1]?.pending.resolve({
        ok: true,
        data: { path: PAGE_TWO_PATH, title: "单赋值存储", markdown: "# 单赋值存储\n\n绑定一次。\n" },
      });
      reads[0]?.pending.resolve({
        ok: true,
        data: { path: PAGE_ONE_PATH, title: "闭包与静态作用域", markdown: "# 闭包\n\n旧页。\n" },
      });
      await Promise.resolve();
    });
    expect(captured?.page?.path).toBe(PAGE_TWO_PATH);
    expect(captured?.page?.markdown).toBe("绑定一次。\n");
  });

  it("steps to the neighbouring page and closes back to no page", async () => {
    render(<Harness subject="paradigm" />);
    await act(async () => {});
    act(() => captured?.openPage(PAGE_ONE, "CTM D2 · 11-14"));
    act(() => captured?.step(1));
    expect(captured?.page?.path).toBe(PAGE_TWO_PATH);
    expect(captured?.page?.crumb).toBe(strings.domain.entryCrumb("CTM D1 · 11-12"));
    expect(reads.map((read) => read.path)).toEqual([PAGE_ONE_PATH, PAGE_TWO_PATH]);

    act(() => captured?.closePage());
    expect(captured?.page).toBeNull();
  });
});

describe("useDomain — 换科目", () => {
  it("drops the query and the open page when the subject changes", async () => {
    const view = render(<Harness subject="paradigm" />);
    await act(async () => {});
    act(() => captured?.setQuery("闭包"));
    act(() => captured?.openPage(PAGE_ONE, "CTM D2 · 11-14"));
    expect(captured?.query).toBe("闭包");
    expect(captured?.page).not.toBeNull();

    await act(async () => {
      view.rerender(<Harness subject="ctm" />);
      await Promise.resolve();
    });
    expect(captured?.query).toBe("");
    expect(captured?.page).toBeNull();
    expect(captured?.glossary === "failed" ? null : captured?.glossary?.subject).toBe("ctm");
  });
});
