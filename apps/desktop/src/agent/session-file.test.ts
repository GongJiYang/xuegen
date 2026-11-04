/**
 * The own-session-file guard must only accept real transcripts inside the
 * home's `sessions/` tree, even when settings contain a traversal or a symlink.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isOwnSessionFile } from "./session-file.js";

let root: string;
let home: string;
let sessions: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "xuegen-session-file-"));
  home = join(root, "home");
  sessions = join(home, "sessions");
  mkdirSync(sessions, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function sessionFile(name: string): string {
  const path = join(sessions, name);
  writeFileSync(path, "{}\n");
  return path;
}

describe("isOwnSessionFile", () => {
  it("accepts an existing .jsonl inside the sessions tree", () => {
    const path = sessionFile("course.jsonl");
    expect(isOwnSessionFile(home, path)).toBe(true);
  });

  it("accepts a symlink that resolves inside the sessions tree", () => {
    const target = sessionFile("real.jsonl");
    const link = join(sessions, "link.jsonl");
    symlinkSync(target, link);
    expect(isOwnSessionFile(home, link)).toBe(true);
  });

  it("rejects a file outside the sessions tree", () => {
    const outside = join(root, "outside.jsonl");
    writeFileSync(outside, "{}\n");
    expect(isOwnSessionFile(home, outside)).toBe(false);
  });

  it("rejects a `../` traversal out of the sessions tree", () => {
    const outside = join(home, "outside.jsonl");
    writeFileSync(outside, "{}\n");
    expect(isOwnSessionFile(home, join(sessions, "..", "outside.jsonl"))).toBe(false);
  });

  it("rejects a symlink pointing outside the sessions tree", () => {
    const outside = join(root, "outside.jsonl");
    writeFileSync(outside, "{}\n");
    const link = join(sessions, "escape.jsonl");
    symlinkSync(outside, link);
    expect(isOwnSessionFile(home, link)).toBe(false);
  });

  it("rejects a non-.jsonl file", () => {
    const path = join(sessions, "transcript.txt");
    writeFileSync(path, "{}\n");
    expect(isOwnSessionFile(home, path)).toBe(false);
  });

  it("rejects a file that does not exist", () => {
    expect(isOwnSessionFile(home, join(sessions, "missing.jsonl"))).toBe(false);
  });

  it("rejects a directory named like a transcript", () => {
    const path = join(sessions, "directory.jsonl");
    mkdirSync(path);
    expect(isOwnSessionFile(home, path)).toBe(false);
  });
});
