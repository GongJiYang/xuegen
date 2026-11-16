import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RecallGroup } from "../../core/board/recall.js";
import { strings } from "../../core/strings.js";
import { RecallBlock } from "./recall-block.js";

afterEach(cleanup);

const CTM: RecallGroup = {
  key: "ctm|D2",
  course: "ctm",
  label: "CTM D2 · 11-14",
  name: "CTM",
  terms: [
    {
      key: "a",
      title: "闭包与静态作用域",
      path: "/v/wiki/a.md",
      hint: "函数记住定义处的环境",
      missing: false,
    },
    { key: "b", title: "语言抽象与函数", path: "/v/wiki/b.md", hint: null, missing: false },
  ],
  more: 0,
  domain: { id: "programming-paradigms", title: "编程语言与编程范式" },
};

const panel = strings.panel;

describe("Bear RecallBlock", () => {
  it("draws nothing without groups", () => {
    const { container } = render(
      <RecallBlock groups={[]} onOpenTerm={vi.fn()} onOpenDomain={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists one lesson's pages; the hint is the hover text, a page without one uses its title", () => {
    render(<RecallBlock groups={[CTM]} onOpenTerm={vi.fn()} onOpenDomain={vi.fn()} />);
    expect(screen.getByText(panel.recallTitle)).toBeTruthy();
    expect(screen.getByText(panel.recallCaption)).toBeTruthy();
    expect(screen.getByText("CTM D2 · 11-14")).toBeTruthy();
    const first = screen.getByRole("button", { name: "闭包与静态作用域" });
    expect(first.getAttribute("title")).toBe("函数记住定义处的环境");
    const second = screen.getByRole("button", { name: "语言抽象与函数" });
    expect(second.getAttribute("title")).toBe("语言抽象与函数");
  });

  it("opens a page in the reader", () => {
    const onOpenTerm = vi.fn();
    render(<RecallBlock groups={[CTM]} onOpenTerm={onOpenTerm} onOpenDomain={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "闭包与静态作用域" }));
    expect(onOpenTerm).toHaveBeenCalledWith("/v/wiki/a.md", "闭包与静态作用域");
  });

  it("opens the course's 领域 page from the foot", () => {
    const onOpenDomain = vi.fn();
    render(<RecallBlock groups={[CTM]} onOpenTerm={vi.fn()} onOpenDomain={onOpenDomain} />);
    fireEvent.click(screen.getByRole("button", { name: "CTM 全部概念页 → 领域" }));
    expect(onOpenDomain).toHaveBeenCalledWith("programming-paradigms", "编程语言与编程范式");
  });

  it("says so when the lesson saved no pages, and still offers 领域", () => {
    const { container } = render(
      <RecallBlock groups={[{ ...CTM, terms: [] }]} onOpenTerm={vi.fn()} onOpenDomain={vi.fn()} />,
    );
    expect(screen.getByText(panel.recallEmpty)).toBeTruthy();
    expect(container.querySelector("ul")).toBeNull();
    expect(screen.getByRole("button", { name: "CTM 全部概念页 → 领域" })).toBeTruthy();
  });

  it("counts the pages past the cut and opens 领域 there too", () => {
    const onOpenDomain = vi.fn();
    render(
      <RecallBlock groups={[{ ...CTM, more: 3 }]} onOpenTerm={vi.fn()} onOpenDomain={onOpenDomain} />,
    );
    fireEvent.click(screen.getByRole("button", { name: panel.recallMore(3) }));
    expect(onOpenDomain).toHaveBeenCalledWith("programming-paradigms", "编程语言与编程范式");
  });

  it("without a 领域 page the foot goes away and the count is plain text", () => {
    render(
      <RecallBlock
        groups={[{ ...CTM, more: 3, domain: null }]}
        onOpenTerm={vi.fn()}
        onOpenDomain={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "CTM 全部概念页 → 领域" })).toBeNull();
    expect(screen.queryByRole("button", { name: panel.recallMore(3) })).toBeNull();
    expect(screen.getByText(panel.recallMore(3))).toBeTruthy();
  });

  it("without a handler there is no 领域 link either", () => {
    render(
      <RecallBlock groups={[{ ...CTM, more: 3 }]} onOpenTerm={vi.fn()} onOpenDomain={undefined} />,
    );
    expect(screen.queryByRole("button", { name: "CTM 全部概念页 → 领域" })).toBeNull();
    expect(screen.queryByRole("button", { name: panel.recallMore(3) })).toBeNull();
  });

  it("with two courses, one section each in the given order; the title shows once", () => {
    const D: RecallGroup = {
      ...CTM,
      key: "d|D2",
      course: "d",
      label: "离散 D2 · 11-13",
      name: "离散",
      terms: [],
      domain: null,
    };
    const { container } = render(
      <RecallBlock groups={[CTM, D]} onOpenTerm={vi.fn()} onOpenDomain={vi.fn()} />,
    );
    const lessons = [...container.querySelectorAll(".bear-cp-recall-lesson")].map(
      (node) => node.textContent,
    );
    expect(lessons).toEqual(["CTM D2 · 11-14", "离散 D2 · 11-13"]);
    expect(screen.getAllByText(panel.recallTitle)).toHaveLength(1);
  });
});
