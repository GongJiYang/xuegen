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

describe("markdownToHast — wikilinks become chips", () => {
  const WIKILINK = "wiki/knowledge/concepts/programming-paradigms/100-ctm-closures-and-static-scoping";

  it("renders a labelled wikilink as an `a` with the chip class and a `#wiki:` href", () => {
    const tree = markdownToHast(`闭包里装的是自由标识符的绑定[[${WIKILINK}|CTM：闭包与静态作用域]]。`);
    const links = collect(tree, "a");
    expect(links).toHaveLength(1);
    expect(links[0]?.properties?.href).toBe(`#wiki:${encodeURIComponent(WIKILINK)}`);
    expect(links[0]?.properties?.className).toEqual(["xg-wikilink"]);
    expect(JSON.stringify(tree)).toContain("CTM：闭包与静态作用域");
    expect(JSON.stringify(tree)).not.toContain("[[");
  });

  it("labels a bare wikilink with the file name", () => {
    const tree = markdownToHast(`见 [[${WIKILINK}]]。`);
    const links = collect(tree, "a");
    expect(links).toHaveLength(1);
    expect((links[0]?.children[0] as { value?: string } | undefined)?.value).toBe(
      "100-ctm-closures-and-static-scoping",
    );
  });

  it("renders two wikilinks on one line", () => {
    const tree = markdownToHast("所以结果不看在哪里调用[[wiki/b|抽象机]]，见[[wiki/c]]。");
    expect(collect(tree, "a")).toHaveLength(2);
  });

  it("leaves a wikilink inside inline code and inline math alone", () => {
    const tree = markdownToHast("`[[wiki/a|x]]` 与 $[[wiki/b]]$");
    expect(collect(tree, "a")).toHaveLength(0);
    const code = collect(tree, "code");
    expect((code[0]?.children[0] as { value?: string } | undefined)?.value).toBe("[[wiki/a|x]]");
  });

  it("keeps GFM's footnote link class now that it shares the chip's className rule", () => {
    const tree = markdownToHast("注脚[^1]\n\n[^1]: 脚注内容");
    const classes = collect(tree, "a").flatMap((link) =>
      Array.isArray(link.properties?.className) ? link.properties.className : [],
    );
    expect(classes).toContain("data-footnote-backref");
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
