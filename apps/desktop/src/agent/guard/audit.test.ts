/**
 * The audit log: one JSONL line per decision, rotation past 5 MB, and a write
 * or rotation failure that never breaks the tool call.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendAudit, type AuditEntry } from "./audit.js";

const temporary: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xuegen-guard-audit-"));
  temporary.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    time: "2026-11-09T08:00:00.000Z",
    session: "session-1",
    role: "course:ctm",
    tool: "write",
    target: "/vault/wiki/courses/ctm.md",
    allow: true,
    reason: "",
    ...overrides,
  };
}

describe("appendAudit", () => {
  it("writes one JSON line per decision, readable back as entries", () => {
    const file = join(tempDir(), "guard.log");
    appendAudit(file, entry());
    appendAudit(file, entry({ allow: false, reason: "不能写别的课程页", tool: "edit" }));

    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const [first, second] = lines.map((line) => JSON.parse(line) as AuditEntry);
    expect(first?.tool).toBe("write");
    expect(first?.allow).toBe(true);
    expect(second?.allow).toBe(false);
    expect(second?.reason).toBe("不能写别的课程页");
  });

  it("creates the file when it does not exist yet", () => {
    const file = join(tempDir(), "guard.log");
    expect(() => appendAudit(file, entry())).not.toThrow();
    expect(statSync(file).size).toBeGreaterThan(0);
  });

  it("rotates the log to guard.log.1 once it is past 5 MB, then keeps appending", () => {
    const dir = tempDir();
    const file = join(dir, "guard.log");
    const rotated = `${file}.1`;
    const limit = 5 * 1024 * 1024 + 1;
    writeFileSync(file, `${"x".repeat(limit)}\n`, "utf8");

    appendAudit(file, entry({ tool: "read" }));

    expect(statSync(rotated).size).toBe(limit + 1);
    const fresh = readFileSync(file, "utf8").trim();
    expect(fresh.split("\n")).toHaveLength(1);
    expect((JSON.parse(fresh) as AuditEntry).tool).toBe("read");
  });

  it("reports a write failure instead of throwing, so the decision still stands", () => {
    const dir = tempDir();
    const file = join(dir, "guard.log");
    // A directory where the log should be: the append itself fails.
    mkdirSync(file);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => appendAudit(file, entry())).not.toThrow();
    expect(console.error).toHaveBeenCalledOnce();
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0] ?? "")).toContain("[guard]");
  });

  it("reports a failed rotation instead of throwing either", () => {
    const dir = tempDir();
    const file = join(dir, "guard.log");
    const limit = 5 * 1024 * 1024 + 1;
    writeFileSync(file, `${"x".repeat(limit)}\n`, "utf8");
    // guard.log.1 is a directory: renameSync cannot replace it, so rotation fails.
    mkdirSync(`${file}.1`);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => appendAudit(file, entry())).not.toThrow();
    expect(console.error).toHaveBeenCalledOnce();
  });
});
