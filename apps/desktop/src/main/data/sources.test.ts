// @vitest-environment node
// Exercises the reading-source listing against a temporary vault: only `.md` /
// `.pdf` under `raw/` and `clippings/` are offered, newest first, and files
// already linked from a reading page are excluded.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listReadingSources } from "./sources.js";

describe("listReadingSources", () => {
  let vault: string;

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), "xuegen-sources-"));
    mkdirSync(join(vault, "wiki", "reading"), { recursive: true });
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  function write(relativePath: string, seconds: number): void {
    const file = join(vault, relativePath);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, "# 标题\n", "utf8");
    utimesSync(file, seconds, seconds);
  }

  it("lists .md and .pdf under raw/ and clippings/, newest first", () => {
    write("raw/articles/old.md", 1_000);
    write("raw/papers/new.pdf", 3_000);
    write("clippings/clip.md", 2_000);
    const sources = listReadingSources(vault);
    expect(sources.map((source) => source.path)).toEqual([
      "raw/papers/new.pdf",
      "clippings/clip.md",
      "raw/articles/old.md",
    ]);
    expect(sources[0]?.name).toBe("new");
  });

  it("ignores non-source extensions and hidden files", () => {
    write("raw/notes/skip.txt", 1_000);
    write("raw/notes/skip.png", 2_000);
    write("raw/.hidden.md", 3_000);
    write("raw/keep.md", 4_000);
    expect(listReadingSources(vault).map((source) => source.path)).toEqual(["raw/keep.md"]);
  });

  it("excludes files already linked from a reading page", () => {
    write("raw/articles/x.md", 1_000);
    write("raw/articles/y.md", 2_000);
    writeFileSync(
      join(vault, "wiki", "reading", "x.md"),
      '---\nsource: "[[raw/articles/x]]"\npriority: high\n---\n\n# X\n',
      "utf8",
    );
    expect(listReadingSources(vault).map((source) => source.path)).toEqual(["raw/articles/y.md"]);
  });

  it("returns an empty list when there are no source directories", () => {
    expect(listReadingSources(vault)).toEqual([]);
  });
});
