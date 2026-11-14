import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { strings } from "../../core/strings.js";
import { TermsBlock } from "./terms-block.js";

afterEach(cleanup);

describe("Bear TermsBlock", () => {
  it("lists each lesson with its terms; a term opens its page, the definition is the hover text", () => {
    const onOpenTerm = vi.fn();
    render(
      <TermsBlock
        onOpenTerm={onOpenTerm}
        terms={[
          {
            key: "d|2026-11-12|D3",
            course: "d",
            courseName: "离散",
            label: "离散 D3 · 11-12",
            terms: [
              {
                key: "a",
                title: "有效论证",
                path: "/v/wiki/a.md",
                hint: "前提都真时结论必真",
                missing: false,
              },
              { key: "b", title: "可靠", path: "/v/wiki/b.md", hint: null, missing: true },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("离散 D3 · 11-12")).toBeTruthy();
    const term = screen.getByRole("button", { name: "有效论证" });
    expect(term.getAttribute("title")).toBe("前提都真时结论必真");
    fireEvent.click(term);
    expect(onOpenTerm).toHaveBeenCalledWith("/v/wiki/a.md", "有效论证");
    const gone = screen.getByRole("button", { name: "可靠" });
    expect(gone.className).toContain("is-missing");
    expect((gone as HTMLButtonElement).disabled).toBe(true);
    expect(gone.getAttribute("title")).toBe(strings.panel.termsMissing);
  });

  it("says so while loading, when empty and on failure", () => {
    const { rerender } = render(<TermsBlock terms={null} onOpenTerm={vi.fn()} />);
    expect(screen.getByText(strings.panel.blockLoading)).toBeTruthy();
    rerender(<TermsBlock terms={[]} onOpenTerm={vi.fn()} />);
    expect(screen.getByText(strings.panel.termsEmpty)).toBeTruthy();
    rerender(<TermsBlock terms="failed" onOpenTerm={vi.fn()} />);
    expect(screen.getByText(strings.panel.termsFailed)).toBeTruthy();
  });

  it("with two courses, a filter narrows the rows; the head counts every term", () => {
    const row = (course: string, name: string, title: string) => ({
      key: `${course}|${title}`,
      course,
      courseName: name,
      label: `${name} D1 · 11-12`,
      terms: [{ key: title, title, path: `/v/${title}.md`, hint: null, missing: false }],
    });
    render(
      <TermsBlock
        onOpenTerm={vi.fn()}
        terms={[row("d", "离散", "命题"), row("c", "CTM", "核心语言"), row("d", "离散", "量词")]}
      />,
    );
    expect(screen.getByText(strings.panel.termsCount(3))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "CTM 1" }));
    expect(screen.queryByRole("button", { name: "命题" })).toBeNull();
    expect(screen.getByRole("button", { name: "核心语言" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: `${strings.panel.termsAll} 3` }));
    expect(screen.getByRole("button", { name: "命题" })).toBeTruthy();
  });
});
