/**
 * Bear 领域页 (domain.html ①②): the glossary column and the summary / page column.
 *
 * Only the two left-most columns are drawn here — the 「问」 column on the right
 * is the ordinary chat, wired by App in the next batch. So the test checks the
 * column's states (reading / failed / empty / found), that a click opens a page,
 * that ← → page through the filtered list and never fire from a field, and that
 * the 换科目 switch only shows when there is somewhere to switch to.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DomainTerm } from "@shared/data-protocol.js";
import type { DomainPanelProps } from "../contract.js";
import type { DomainPage, DomainState } from "../../core/board/use-domain.js";
import { countEntries, type DomainSection } from "../../core/board/domain.js";
import { strings } from "../../core/strings.js";
import { DomainPanel } from "./domain-panel.js";

afterEach(cleanup);

const d = strings.domain;

const closure: DomainTerm = {
  term: "闭包",
  en: "closure",
  path: "/v/wiki/knowledge/concepts/pp/100.md",
  page: "CTM：闭包与静态作用域",
  kind: "page",
  definition: null,
};
const freeId: DomainTerm = {
  term: "自由标识符",
  en: "free identifier",
  path: "/v/wiki/knowledge/concepts/pp/100.md",
  page: "CTM：闭包与静态作用域",
  kind: "term",
  definition: null,
};
const store: DomainTerm = {
  term: "单赋值存储",
  en: null,
  path: "/v/wiki/knowledge/concepts/pp/050.md",
  page: "CTM：单赋值存储",
  kind: "page",
  definition: null,
};

const sections: DomainSection[] = [
  { label: "CTM D2", entries: [closure, freeId] },
  { label: "CTM D1", entries: [store] },
];

const page: DomainPage = {
  path: closure.path,
  title: "CTM：闭包与静态作用域",
  crumb: "概念页 · CTM D2",
  markdown: "正文",
  error: null,
  external: "obsidian://x",
};

function state(overrides: Partial<DomainState> = {}): DomainState {
  return {
    glossary: { subject: "pp", title: "编程范式", summary: "1. 第一条", groups: [], other: [] },
    query: "",
    setQuery: vi.fn(),
    sections,
    total: 3,
    page: null,
    openPage: vi.fn(),
    closePage: vi.fn(),
    step: vi.fn(),
    ...overrides,
  };
}

function props(overrides: Partial<DomainPanelProps> = {}): DomainPanelProps {
  return {
    title: "编程语言与编程范式",
    subjects: [
      { id: "pp", label: "编程范式" },
      { id: "math", label: "离散数学" },
    ],
    current: "pp",
    onSwitchSubject: vi.fn(),
    domain: state(),
    renderMarkdown: (markdown) => <div data-testid="md">{markdown}</div>,
    ...overrides,
  };
}

describe("Bear 领域页", () => {
  it("draws the groups and their terms on the left and the summary in the middle", () => {
    render(<DomainPanel {...props()} />);

    expect(screen.getByText("CTM D2")).toBeTruthy();
    expect(screen.getByText("CTM D1")).toBeTruthy();
    expect(screen.getByText("闭包")).toBeTruthy();
    expect(screen.getByText("closure")).toBeTruthy();
    expect(screen.getByText("自由标识符")).toBeTruthy();
    expect(screen.getByText("单赋值存储")).toBeTruthy();
    expect(screen.getByText(d.all(3))).toBeTruthy();

    expect(screen.getByText(d.summaryTitle)).toBeTruthy();
    expect(screen.getByTestId("md").textContent).toBe("1. 第一条");
  });

  it("says so when the subject has no 领域小结 yet", () => {
    const domain = state({
      glossary: { subject: "pp", title: "编程范式", summary: null, groups: [], other: [] },
    });
    render(<DomainPanel {...props({ domain })} />);
    expect(screen.getByText(d.noSummary)).toBeTruthy();
  });

  it("opens a page from its term with the lesson's label", async () => {
    const openPage = vi.fn();
    render(<DomainPanel {...props({ domain: state({ openPage }) })} />);
    await userEvent.click(screen.getByRole("button", { name: /闭包/ }));
    expect(openPage).toHaveBeenCalledWith(closure, "CTM D2");
  });

  it("filters through the search box and counts what is left", async () => {
    const setQuery = vi.fn();
    const { unmount } = render(<DomainPanel {...props({ domain: state({ setQuery }) })} />);
    await userEvent.type(screen.getByPlaceholderText(d.find), "闭");
    expect(setQuery).toHaveBeenCalledWith("闭");
    unmount();

    render(<DomainPanel {...props({ domain: state({ query: "闭" }) })} />);
    expect(screen.getByText(d.found(countEntries(sections)))).toBeTruthy();
  });

  it("reads a page in the middle, marks its term and pages with the nav", async () => {
    const domain = state({ page });
    const closePage = vi.fn();
    const step = vi.fn();
    render(<DomainPanel {...props({ domain: { ...domain, closePage, step } })} />);

    expect(screen.getByText(page.title)).toBeTruthy();
    expect(screen.getByText(page.crumb)).toBeTruthy();
    expect(screen.getByTestId("md").textContent).toBe("正文");
    expect(screen.getByRole("link", { name: strings.feed.openInObsidian }).getAttribute("href")).toBe(
      "obsidian://x",
    );

    // Only the page entry whose path is open is marked: 自由标识符 shares the path
    // but is a term, so it stays unmarked.
    expect(screen.getByRole("button", { name: /闭包/ }).className).toContain("is-on");
    expect(screen.getByRole("button", { name: /自由标识符/ }).className).not.toContain("is-on");
    expect(screen.getByRole("button", { name: /单赋值存储/ }).className).not.toContain("is-on");

    await userEvent.click(screen.getByRole("button", { name: d.back }));
    expect(closePage).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: strings.feed.readerNext }));
    expect(step).toHaveBeenCalledWith(1);
  });

  it("shows the page's loading line and then its error", () => {
    const loading = { ...page, markdown: null, error: null };
    const { unmount } = render(<DomainPanel {...props({ domain: state({ page: loading }) })} />);
    expect(screen.getByText(d.pageLoading)).toBeTruthy();
    unmount();

    render(
      <DomainPanel {...props({ domain: state({ page: { ...page, markdown: null, error: "读不到" } }) })} />,
    );
    expect(screen.getByText("读不到")).toBeTruthy();
  });

  it("tells the glossary's reading, failure and empty states apart", () => {
    const { unmount } = render(<DomainPanel {...props({ domain: state({ glossary: null }) })} />);
    expect(screen.getByText(d.loading)).toBeTruthy();
    unmount();

    const failed = render(<DomainPanel {...props({ domain: state({ glossary: "failed" }) })} />);
    expect(screen.getByText(d.failed)).toBeTruthy();
    failed.unmount();

    render(<DomainPanel {...props({ domain: state({ sections: [], total: 0 }) })} />);
    expect(screen.getByText(d.noTerms)).toBeTruthy();
  });

  it("labels the subject switch with a small ▾ 换科目 over the select", () => {
    const { container } = render(<DomainPanel {...props()} />);
    const label = container.querySelector<HTMLLabelElement>(".bear-dp-head label.bear-dp-switch");
    expect(label).not.toBeNull();
    const select = label?.querySelector("select");
    expect(select?.className).toBe("bear-dp-switch-sel");

    // The visible words are the label's own text; the options inside the
    // (invisible) select must not be counted as the visible label.
    const visible = (label?.textContent ?? "").replace(select?.textContent ?? "", "");
    expect(visible).toBe(`▾ ${d.switchSubject}`);
    expect(screen.getByLabelText(d.switchSubject)).toBe(select);
  });

  it("switches subject only when there is another one", async () => {
    const onSwitchSubject = vi.fn();
    const { unmount } = render(<DomainPanel {...props({ onSwitchSubject })} />);
    const select = screen.getByLabelText(d.switchSubject);
    await userEvent.selectOptions(select, "math");
    expect(onSwitchSubject).toHaveBeenCalledWith("math");
    unmount();

    render(<DomainPanel {...props({ subjects: [{ id: "pp", label: "编程范式" }] })} />);
    expect(screen.queryByLabelText(d.switchSubject)).toBeNull();
  });

  it("pages with ← → while a page is open, but not from a field", async () => {
    const step = vi.fn();
    render(<DomainPanel {...props({ domain: state({ page, step }) })} />);

    await userEvent.keyboard("{ArrowRight}");
    expect(step).toHaveBeenCalledWith(1);
    await userEvent.keyboard("{ArrowLeft}");
    expect(step).toHaveBeenCalledWith(-1);

    step.mockClear();
    screen.getByPlaceholderText(d.find).focus();
    await userEvent.keyboard("{ArrowLeft}{ArrowRight}");
    expect(step).not.toHaveBeenCalled();
  });

  it("ignores ← → while no page is open", async () => {
    const step = vi.fn();
    render(<DomainPanel {...props({ domain: state({ step }) })} />);
    await userEvent.keyboard("{ArrowLeft}{ArrowRight}");
    expect(step).not.toHaveBeenCalled();
  });
});
