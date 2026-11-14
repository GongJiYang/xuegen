// @vitest-environment node
// The vault is a real temporary directory because the guard's whole job is
// comparing real paths: `..` segments and symlinks must be exercised, not
// mocked.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseWikiPage, readWikiPage } from "./wiki-page.js";

const OUTSIDE = {
  ok: false,
  code: "invalid-request",
  error: "只能打开知识库 wiki 里的页面。",
};

function page(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text, "utf8");
}

describe("parseWikiPage", () => {
  it("strips frontmatter that closes at EOF", () => {
    expect(parseWikiPage("/v/wiki/a.md", "---\nx: 1\n---")).toEqual({
      path: "/v/wiki/a.md",
      title: "a",
      markdown: "",
    });
  });
});

describe("readWikiPage", () => {
  let vault: string;

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), "xuegen-wiki-vault-"));
    mkdirSync(join(vault, "wiki"), { recursive: true });
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  it("returns the page's H1 and Markdown", () => {
    const file = join(vault, "wiki", "knowledge", "concepts", "demo", "010-alpha.md");
    page(file, "# 甲概念\n\n甲的定义。\n");
    expect(readWikiPage(vault, file)).toEqual({
      ok: true,
      data: { path: file, title: "甲概念", markdown: "# 甲概念\n\n甲的定义。\n" },
    });
  });

  it("strips a leading frontmatter block and keeps the rest verbatim", () => {
    const file = join(vault, "wiki", "b.md");
    page(file, "---\ntags: [x]\n---\n\n# 乙\n\n---\n\n正文里的分隔线。\n");
    expect(readWikiPage(vault, file)).toEqual({
      ok: true,
      data: {
        path: file,
        title: "乙",
        markdown: "\n# 乙\n\n---\n\n正文里的分隔线。\n",
      },
    });
  });

  it("falls back to the file name when the page has no H1", () => {
    const file = join(vault, "wiki", "no-title.md");
    page(file, "没有标题。\n\n## 二级\n");
    expect(readWikiPage(vault, file)).toEqual({
      ok: true,
      data: { path: file, title: "no-title", markdown: "没有标题。\n\n## 二级\n" },
    });
  });

  it("rejects a file outside wiki/", () => {
    const file = join(vault, "notes", "a.md");
    page(file, "# 外面\n");
    expect(readWikiPage(vault, file)).toEqual(OUTSIDE);
  });

  it("rejects a ../ escape", () => {
    const file = join(vault, "secret.md");
    page(file, "# 秘密\n");
    expect(readWikiPage(vault, `${join(vault, "wiki")}/../secret.md`)).toEqual(OUTSIDE);
  });

  it("rejects a symlink inside wiki/ that resolves outside", () => {
    const outside = join(vault, "outside.md");
    page(outside, "# 外面\n");
    const link = join(vault, "wiki", "link.md");
    symlinkSync(outside, link);
    expect(readWikiPage(vault, link)).toEqual(OUTSIDE);
  });

  it("rejects a directory named like a page", () => {
    const dir = join(vault, "wiki", "dir.md");
    mkdirSync(dir);
    expect(readWikiPage(vault, dir)).toEqual(OUTSIDE);
  });

  it("reports a missing page as gone", () => {
    expect(readWikiPage(vault, join(vault, "wiki", "missing.md"))).toEqual({
      ok: false,
      code: "invalid-request",
      error: "这一页不在了。",
    });
  });

  it("rejects a non-.md path", () => {
    const file = join(vault, "wiki", "note.txt");
    page(file, "x");
    expect(readWikiPage(vault, file)).toEqual(OUTSIDE);
  });

  it("rejects a page larger than 512 KB", () => {
    const file = join(vault, "wiki", "big.md");
    page(file, `# 大\n\n${"x".repeat(513 * 1024)}`);
    expect(readWikiPage(vault, file)).toEqual({
      ok: false,
      code: "invalid-request",
      error: "页面太大，请在 Obsidian 里打开。",
    });
  });
});
