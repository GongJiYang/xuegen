import { describe, expect, it } from "vitest";
import type { Element } from "hast";
import { markdownToHast } from "./markdown-to-hast.js";

/** Walk a HAST tree and collect every element of a given tag name. */
function collect(tree: unknown, tagName: string): Element[] {
  const found: Element[] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const record = node as { type?: string; tagName?: string; children?: unknown[] };
    if (record.type === "element" && record.tagName === tagName) found.push(node as Element);
    if (Array.isArray(record.children)) record.children.forEach(visit);
  };
  visit(tree);
  return found;
}

describe("markdownToHast — inline math", () => {
  it("typesets inline $…$ with KaTeX (a `.katex` span survives sanitizing)", () => {
    const tree = markdownToHast("质能方程 $E=mc^2$ 很简洁。");
    const katex = collect(tree, "span").filter((el) => {
      const className = el.properties?.className;
      return Array.isArray(className) && className.includes("katex");
    });
    expect(katex.length).toBe(1);
  });

  it("does not drop the math-inline class before KaTeX runs", () => {
    // A math element that KaTeX could not typeset (invalid TeX) still proves the
    // class survived sanitizing: KaTeX leaves a `.katex-error` in its place.
    const tree = markdownToHast("这里是坏公式 $\\frac{1}{$ 结束。");
    const html = JSON.stringify(tree);
    expect(html).toContain("katex");
  });
});

describe("markdownToHast — raw HTML is removed", () => {
  it("drops a <script> element", () => {
    const tree = markdownToHast("前\n\n<script>alert(1)</script>\n\n后");
    expect(collect(tree, "script")).toHaveLength(0);
    expect(JSON.stringify(tree)).not.toContain("alert(1)");
  });

  it("drops an inline event handler", () => {
    const tree = markdownToHast('<a href="#" onclick="alert(1)">x</a>');
    expect(JSON.stringify(tree)).not.toContain("onclick");
  });

  it("keeps ordinary formatting and inline code", () => {
    const tree = markdownToHast("**粗体** 与 `code`");
    expect(collect(tree, "strong")).toHaveLength(1);
    const code = collect(tree, "code");
    expect(code).toHaveLength(1);
    expect(code[0]?.properties?.className).toBeUndefined();
  });
});
