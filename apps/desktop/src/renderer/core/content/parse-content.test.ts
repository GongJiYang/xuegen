import { describe, expect, it } from "vitest";
import { parseContent } from "./parse-content.js";
import { calloutTypeOf, codeNode, isDiagramBody } from "./nodes.js";

describe("parseContent — fenced code", () => {
  it("classifies an ordinary fenced language as a code node", () => {
    const nodes = parseContent("```typescript\nconst x = 1;\n```");
    expect(nodes).toEqual([{ kind: "code", language: "typescript", code: "const x = 1;" }]);
  });

  it("classifies a mermaid fence as a mermaid node", () => {
    const nodes = parseContent("```mermaid\ngraph TD\n  A-->B\n```");
    expect(nodes).toEqual([{ kind: "mermaid", code: "graph TD\n  A-->B" }]);
  });

  it("classifies a math fence as a block formula", () => {
    const nodes = parseContent("```math\nE = mc^2\n```");
    expect(nodes).toEqual([{ kind: "math-block", latex: "E = mc^2" }]);
  });

  it("lower-cases the language and keeps an empty one", () => {
    expect(parseContent("```TypeScript\nx\n```")[0]).toMatchObject({ language: "typescript" });
    expect(parseContent("```\nplain\n```")[0]).toMatchObject({ kind: "code", language: "" });
  });
});

describe("parseContent — block math with $$", () => {
  it("reads a $$ … $$ block", () => {
    const nodes = parseContent("$$\n\\sum_{n=1}^{\\infty} 1/n^2\n$$");
    expect(nodes).toEqual([{ kind: "math-block", latex: "\\sum_{n=1}^{\\infty} 1/n^2" }]);
  });

  it("leaves an unterminated $$ block as its own node, not a crash", () => {
    const nodes = parseContent("$$\nx + y");
    expect(nodes).toEqual([{ kind: "math-block", latex: "x + y" }]);
  });
});

describe("parseContent — GFM tables", () => {
  it("reads a header, a delimiter, and body rows", () => {
    const nodes = parseContent("| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |");
    expect(nodes).toEqual([
      {
        kind: "table",
        header: ["a", "b"],
        rows: [
          ["1", "2"],
          ["3", "4"],
        ],
      },
    ]);
  });

  it("accepts alignment markers in the delimiter row", () => {
    const nodes = parseContent("| a | b |\n| :-- | --: |\n| 1 | 2 |");
    expect(nodes[0]).toMatchObject({ kind: "table", header: ["a", "b"] });
  });

  it("stops the table at a blank line and resumes Markdown", () => {
    const nodes = parseContent("| a | b |\n| --- | --- |\n| 1 | 2 |\n\nafter");
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ kind: "table" });
    expect(nodes[1]).toEqual({ kind: "markdown", markdown: "after" });
  });
});

describe("parseContent — callouts", () => {
  it("reads a question callout with its title and body", () => {
    const nodes = parseContent("> [!question] 检验题\n> 当 a>0 时开口朝上？");
    expect(nodes).toEqual([
      { kind: "callout", calloutType: "question", title: "检验题", body: "当 a>0 时开口朝上？" },
    ]);
  });

  it("reads a note callout and a warning callout", () => {
    expect(parseContent("> [!note] 提示\n> 先看符号")[0]).toMatchObject({ calloutType: "note" });
    expect(parseContent("> [!warning] 注意\n> 小心")[0]).toMatchObject({ calloutType: "warning" });
  });

  it("maps an unknown keyword to note", () => {
    expect(parseContent("> [!tip] 小技巧\n> 内容")[0]).toMatchObject({ calloutType: "note" });
  });

  it("ends the callout at the first non-quote line", () => {
    const nodes = parseContent("> [!note] 提示\n> 内容\n\n正文");
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ kind: "callout" });
    expect(nodes[1]).toEqual({ kind: "markdown", markdown: "正文" });
  });
});

describe("parseContent — plain Markdown and ordering", () => {
  it("wraps text without special blocks as one markdown node", () => {
    expect(parseContent("普通段落\n\n第二个段落")).toEqual([
      { kind: "markdown", markdown: "普通段落\n\n第二个段落" },
    ]);
  });

  it("keeps nodes in document order across kinds", () => {
    const nodes = parseContent("前\n\n```js\nx\n```\n\n后");
    expect(nodes.map((node) => node.kind)).toEqual(["markdown", "code", "markdown"]);
  });

  it("returns no nodes for an empty string", () => {
    expect(parseContent("")).toEqual([]);
  });
});

describe("parseContent — incomplete streaming Markdown", () => {
  it("treats an unterminated fence as a code node until it closes", () => {
    const nodes = parseContent("说明\n\n```python\nprint(");
    expect(nodes[0]).toMatchObject({ kind: "markdown" });
    expect(nodes[1]).toMatchObject({ kind: "code", language: "python" });
  });

  it("does not mistake a lone pipe line for a table", () => {
    const nodes = parseContent("| 还没写完");
    expect(nodes).toEqual([{ kind: "markdown", markdown: "| 还没写完" }]);
  });

  it("treats a header without a delimiter row as plain text", () => {
    const nodes = parseContent("| a | b |\n| 1 | 2 |");
    expect(nodes).toEqual([{ kind: "markdown", markdown: "| a | b |\n| 1 | 2 |" }]);
  });
});

describe("codeNode / calloutTypeOf helpers", () => {
  it("routes known languages to their node kind", () => {
    expect(codeNode("mermaid", "x")).toEqual({ kind: "mermaid", code: "x" });
    expect(codeNode("math", "y")).toEqual({ kind: "math-block", latex: "y" });
    expect(codeNode("go", "z")).toEqual({ kind: "code", language: "go", code: "z" });
  });

  it("maps callout keywords to modelled types", () => {
    expect(calloutTypeOf("question")).toBe("question");
    expect(calloutTypeOf("Warning")).toBe("warning");
    expect(calloutTypeOf("caution")).toBe("warning");
    expect(calloutTypeOf("anything")).toBe("note");
  });
});

describe("parseContent — terminal character diagrams", () => {
  // Positive: a plain/text fence whose body carries box-drawing or braille.
  it("classifies an unlabelled fence with box-drawing glyphs as a diagram", () => {
    const nodes = parseContent("```\n┌──┐\n│ab│\n└──┘\n```");
    expect(nodes).toEqual([{ kind: "diagram", code: "┌──┐\n│ab│\n└──┘" }]);
  });

  it("classifies a `text` fence with block elements as a diagram", () => {
    const nodes = parseContent("```text\n完整 █▓▒░\n```");
    expect(nodes[0]).toMatchObject({ kind: "diagram" });
  });

  it("classifies a `diagram` fence with braille as a diagram", () => {
    const nodes = parseContent("```diagram\n⣀⣠⣤⣶⣾\n```");
    expect(nodes[0]).toMatchObject({ kind: "diagram" });
  });

  it("classifies an `ascii` fence with an arrow glyph as a diagram", () => {
    const nodes = parseContent("```ascii\nA ──▸ B\n```");
    expect(nodes[0]).toMatchObject({ kind: "diagram" });
  });

  // Negative: the character set decides, so a plain prose fence stays code.
  it("keeps an empty fence without box/braille glyphs as code", () => {
    const nodes = parseContent("```\njust prose\n```");
    expect(nodes).toEqual([{ kind: "code", language: "", code: "just prose" }]);
  });

  it("keeps a `text` fence without box/braille glyphs as code", () => {
    const nodes = parseContent("```text\nhello world\n```");
    expect(nodes[0]).toMatchObject({ kind: "code", language: "text" });
  });

  it("never classifies a named language (typescript) as a diagram, even with box glyphs", () => {
    const nodes = parseContent("```typescript\n// ┌──┐\nconst x = 1;\n```");
    expect(nodes[0]).toMatchObject({ kind: "code", language: "typescript" });
  });

  it("keeps an ordinary fenced language block as code", () => {
    const nodes = parseContent("```python\nprint(1)\n```");
    expect(nodes[0]).toMatchObject({ kind: "code", language: "python" });
  });

  // Streaming: an unclosed diagram fence still classifies, and does not throw.
  it("classifies an unterminated diagram fence while streaming", () => {
    const nodes = parseContent("说明\n\n```\n┌──┐\n│");
    expect(nodes[0]).toMatchObject({ kind: "markdown" });
    expect(nodes[1]).toMatchObject({ kind: "diagram" });
  });
});

describe("isDiagramBody", () => {
  it("accepts diagram languages with box/braille and rejects others", () => {
    expect(isDiagramBody("", "│")).toBe(true);
    expect(isDiagramBody("txt", "▒")).toBe(true);
    expect(isDiagramBody("plain", "⠿")).toBe(true);
    expect(isDiagramBody("text", "no glyphs")).toBe(false);
    expect(isDiagramBody("python", "│")).toBe(false);
  });
});
