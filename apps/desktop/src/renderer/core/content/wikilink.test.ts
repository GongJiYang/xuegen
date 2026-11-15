import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import type { PhrasingContent, Root } from "mdast";
import { remarkWikilink, splitWikilinks, wikilinkHrefTarget } from "./wikilink.js";

/** Parse one paragraph of Markdown through the plugin and return its children. */
function children(markdown: string): PhrasingContent[] {
  const processor = unified().use(remarkParse).use(remarkMath).use(remarkWikilink).freeze();
  const tree = processor.runSync(processor.parse(markdown)) as Root;
  const first = tree.children[0];
  if (first === undefined || first.type !== "paragraph") throw new Error("expected a paragraph");
  return first.children;
}

describe("splitWikilinks", () => {
  it("splits one wikilink with a label into text, link target, text", () => {
    expect(splitWikilinks("见 [[wiki/a/100-x|CTM：闭包]] 结束")).toEqual([
      { kind: "text", value: "见 " },
      { kind: "link", target: "wiki/a/100-x", label: "CTM：闭包" },
      { kind: "text", value: " 结束" },
    ]);
  });

  it("falls back to the last path segment without `.md` when there is no label", () => {
    expect(splitWikilinks("[[wiki/knowledge/concepts/p/100-ctm-closures.md]]")).toEqual([
      { kind: "link", target: "wiki/knowledge/concepts/p/100-ctm-closures.md", label: "100-ctm-closures" },
    ]);
  });

  it("splits two wikilinks on one line", () => {
    const chunks = splitWikilinks("a[[one|一]]b[[two]]c");
    expect(chunks.filter((chunk) => chunk.kind === "link")).toHaveLength(2);
    expect(chunks.map((chunk) => (chunk.kind === "link" ? chunk.label : chunk.value))).toEqual([
      "a",
      "一",
      "b",
      "two",
      "c",
    ]);
  });

  it("leaves text without a wikilink, and an unterminated one, as one text chunk", () => {
    expect(splitWikilinks("普通文字")).toEqual([{ kind: "text", value: "普通文字" }]);
    expect(splitWikilinks("[[没闭合")).toEqual([{ kind: "text", value: "[[没闭合" }]);
  });
});

describe("wikilinkHrefTarget", () => {
  it("decodes the target out of a `#wiki:` href", () => {
    expect(wikilinkHrefTarget("#wiki:" + encodeURIComponent("wiki/a/100-x"))).toBe("wiki/a/100-x");
  });

  it("returns null for any other href, including a malformed escape", () => {
    expect(wikilinkHrefTarget("https://example.com")).toBeNull();
    expect(wikilinkHrefTarget(null)).toBeNull();
    expect(wikilinkHrefTarget("#wiki:%E0%A4%A")).toBeNull();
  });
});

describe("remarkWikilink", () => {
  it("turns a labelled wikilink into a link node carrying the chip class", () => {
    const [, link] = children("见 [[wiki/a/100-x|CTM：闭包]] 结束");
    expect(link?.type).toBe("link");
    if (link?.type !== "link") throw new Error("expected a link");
    expect(link.url).toBe("#wiki:" + encodeURIComponent("wiki/a/100-x"));
    expect(link.data?.hProperties).toEqual({ className: ["xg-wikilink"] });
    expect(link.children).toEqual([{ type: "text", value: "CTM：闭包" }]);
  });

  it("does not touch wikilinks inside inline code, a link, or inline math", () => {
    const nodes = children("`[[a]]` 与 [[b]] 与 $[[c]]$");
    const links = nodes.filter((node) => node.type === "link");
    expect(links).toHaveLength(1);
    const code = nodes.find((node) => node.type === "inlineCode");
    expect(code?.type === "inlineCode" ? code.value : null).toBe("[[a]]");
    const math = nodes.find((node) => node.type === "inlineMath");
    expect(math?.type === "inlineMath" ? math.value : null).toBe("[[c]]");
  });

  it("skips text inside an ordinary Markdown link", () => {
    const nodes = children("[http://x/[[a]]](http://x/y)");
    expect(nodes.filter((node) => node.type === "link")).toHaveLength(1);
    expect(JSON.stringify(nodes)).not.toContain("#wiki:");
  });
});
