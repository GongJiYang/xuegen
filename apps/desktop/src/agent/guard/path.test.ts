/**
 * Path canonicalization tests: relative paths, `..`, missing deep paths,
 * symlinks, NFC/NFD, case-folding volumes, and the segment-wise `within`.
 *
 * The filesystem arrives as a fake `PathFacts`, so nothing touches disk.
 */

import { describe, expect, it } from "vitest";
import { canonical, canonicalParts, expandTilde, resolvedInput, within, type PathFacts } from "./path.js";

/** A `PathFacts` over a hand-written table of existing paths and link targets. */
function fakeFacts(options: {
  /** Absolute paths that exist; a path not listed does not exist. */
  exists: readonly string[];
  /** `link -> target` map applied to whole existing paths (the vault-root case). */
  links?: Record<string, string>;
  /** Whether the volume folds case. */
  caseInsensitive?: boolean;
}): PathFacts {
  const links = options.links ?? {};
  return {
    realpath(path) {
      if (!options.exists.includes(path)) {
        const error = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return links[path] ?? path;
    },
    caseInsensitive: () => options.caseInsensitive ?? false,
  };
}

/** Every ancestor of a path, so the fake table can list a directory chain. */
function ancestors(path: string): string[] {
  const parts = path.split("/");
  return parts.map((_, index) => parts.slice(0, index + 1).join("/")).filter((entry) => entry !== "");
}

describe("canonical", () => {
  const cwd = "/vault";
  const existing = ["/vault", "/vault/wiki", "/vault/wiki/courses", "/vault/wiki/courses/ctm.md", "/vault/raw"];

  it("resolves a relative path against the cwd", () => {
    const facts = fakeFacts({ exists: existing });
    expect(canonical("wiki/courses/ctm.md", cwd, facts)).toBe("/vault/wiki/courses/ctm.md");
    expect(canonical("./wiki/../wiki/courses/ctm.md", cwd, facts)).toBe("/vault/wiki/courses/ctm.md");
  });

  it("keeps a missing tail but resolves the deepest existing ancestor", () => {
    const facts = fakeFacts({ exists: existing });
    expect(canonical("wiki/courses/new-course.md", cwd, facts)).toBe("/vault/wiki/courses/new-course.md");
    expect(canonical("wiki/knowledge/concepts/discrete/010-x.md", cwd, facts)).toBe(
      "/vault/wiki/knowledge/concepts/discrete/010-x.md",
    );
  });

  it("follows a symlinked vault root", () => {
    const facts = fakeFacts({
      exists: [...ancestors("/Users/gjy/Documents/Obsidian-gjy/GJY"), ...ancestors("/Users/gjy/学根/库/wiki/courses")],
      links: { "/Users/gjy/Documents/Obsidian-gjy/GJY": "/Users/gjy/学根/库" },
    });
    // The link resolves, and /Users/gjy/学根/库 itself is a real directory here.
    expect(canonical("/Users/gjy/Documents/Obsidian-gjy/GJY/wiki/courses/ctm.md", cwd, facts)).toBe(
      "/Users/gjy/学根/库/wiki/courses/ctm.md",
    );
    expect(canonical("/Users/gjy/学根/库/wiki/courses/ctm.md", cwd, facts)).toBe(
      "/Users/gjy/学根/库/wiki/courses/ctm.md",
    );
  });

  it("normalizes NFD spelling to NFC", () => {
    const facts = fakeFacts({ exists: ancestors("/vault/wiki/知识") });
    const nfd = "wiki/知识/e\u0301tude.md"; // e + combining acute
    const nfc = "wiki/知识/étude.md"; // precomposed
    expect(canonical(nfd, cwd, facts)).toBe(canonical(nfc, cwd, facts));
    expect(canonical(nfd, cwd, facts)).toContain("é");
  });

  it("folds case only on a case-insensitive volume", () => {
    const insensitive = fakeFacts({ exists: existing, caseInsensitive: true });
    const sensitive = fakeFacts({ exists: existing, caseInsensitive: false });
    expect(canonical("/vault/WIKI/Courses/CTM.md", cwd, insensitive)).toBe(
      canonical("/vault/wiki/courses/ctm.md", cwd, insensitive),
    );
    expect(canonical("/vault/WIKI/Courses/CTM.md", cwd, sensitive)).not.toBe(
      canonical("/vault/wiki/courses/ctm.md", cwd, sensitive),
    );
  });

  it("propagates a non-ENOENT failure instead of guessing", () => {
    const facts: PathFacts = {
      realpath() {
        const error = new Error("EACCES") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      },
      caseInsensitive: () => false,
    };
    expect(() => canonical("/vault/x", cwd, facts)).toThrow(/EACCES/);
  });

  it("returns both forms from one resolution so check and use share it", () => {
    const facts = fakeFacts({ exists: existing, caseInsensitive: true });
    const parts = canonicalParts("/vault/WIKI/Courses/CTM.md", cwd, facts);
    expect(parts.resolved).toBe("/vault/WIKI/Courses/CTM.md");
    expect(parts.canonical).toBe("/vault/wiki/courses/ctm.md");
    // The rewrite target is the same resolution, not a second lookup.
    expect(resolvedInput("/vault/WIKI/Courses/CTM.md", cwd, facts)).toBe(parts.resolved);
  });
});

describe("expandTilde", () => {
  it("expands `~` and a leading `~/` only", () => {
    expect(expandTilde("~", "/Users/gjy")).toBe("/Users/gjy");
    expect(expandTilde("~/.ssh/id_ed25519", "/Users/gjy")).toBe("/Users/gjy/.ssh/id_ed25519");
  });

  it("leaves other spellings alone, so two strings never collapse by accident", () => {
    expect(expandTilde("~user/x", "/Users/gjy")).toBe("~user/x");
    expect(expandTilde("wiki/~/x", "/Users/gjy")).toBe("wiki/~/x");
    expect(expandTilde("/vault/raw", "/Users/gjy")).toBe("/vault/raw");
  });
});

describe("within", () => {
  it("compares by whole path segments", () => {
    expect(within("/a/b", "/a/b")).toBe(true);
    expect(within("/a/b/c", "/a/b")).toBe(true);
    expect(within("/a/bc", "/a/b")).toBe(false);
    expect(within("/a", "/a/b")).toBe(false);
  });

  it("treats a trailing slash on the parent as the same parent", () => {
    expect(within("/a/b/c", "/a/b/")).toBe(true);
    expect(within("/a/bc", "/a/b/")).toBe(false);
  });
});
