// @vitest-environment node
// Session summaries: pure `summarizeSession` cases on canned transcript text,
// and `listSessions` against a temporary <home>/sessions directory.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import type * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listOtherSessions, listSessions, summarizeSession } from "./sessions.js";

const FILE = "/tmp/sessions/2026-11-08T09-12-34-123Z_test.jsonl";

// realpathSync on a path ending in "gone" succeeds once, then throws ENOENT —
// this simulates a folder deleted between `readdirSync` and the loop's own
// `realpathSync` (a race no deterministic fixture can produce otherwise).
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>();
  const realpath = actual.realpathSync as (path: unknown, options?: unknown) => unknown;
  const calls = new Map<string, number>();
  return {
    ...actual,
    realpathSync: (path: unknown, options?: unknown) => {
      const key = String(path);
      if (key.endsWith("/gone") || key.endsWith("\\gone")) {
        const count = (calls.get(key) ?? 0) + 1;
        calls.set(key, count);
        if (count > 1) throw new Error(`ENOENT: no such file or directory, realpath '${key}'`);
      }
      return realpath(path, options);
    },
  };
});

describe("summarizeSession", () => {
  it("counts user and assistant text messages, skipping bad lines and textless records", () => {
    const text = [
      JSON.stringify({ type: "session", cwd: "/tmp" }),
      "not json at all",
      JSON.stringify({ type: "message", message: { role: "user", content: "第一个问题" } }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "回答一" },
            { type: "toolcall", id: "t1" },
          ],
        },
      }),
      JSON.stringify({ type: "message", message: { role: "toolResult", content: "工具结果" } }),
      // An assistant turn with only tool calls has no text and does not count.
      JSON.stringify({
        type: "message",
        message: { role: "assistant", content: [{ type: "toolcall", id: "t2" }] },
      }),
      JSON.stringify({
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "第二个问题" }] },
      }),
    ].join("\n");
    expect(summarizeSession(FILE, text)).toEqual({
      file: FILE,
      startedAt: Date.UTC(2026, 10, 8, 9, 12, 34, 123),
      firstUser: "第一个问题",
      pin: null,
      count: 3,
    });
  });

  it("records the first assistant 「今日要点 · X」 title as pin", () => {
    const text = [
      JSON.stringify({ type: "message", message: { role: "user", content: "上课" } }),
      JSON.stringify({ type: "message", message: { role: "assistant", content: "开场白，没有要点" } }),
      JSON.stringify({
        type: "message",
        message: { role: "assistant", content: "> [!abstract] 今日要点 · 离散 D2\n- 真值表" },
      }),
      JSON.stringify({ type: "message", message: { role: "assistant", content: "今日要点 · 不该取到" } }),
    ].join("\n");
    expect(summarizeSession(FILE, text)?.pin).toBe("离散 D2");
  });

  it("returns null when the file name carries no timestamp", () => {
    expect(summarizeSession("/tmp/sessions/latest.jsonl", "")).toBeNull();
  });
});

describe("listSessions", () => {
  let home: string;
  let sessionsDir: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "xuegen-sessions-"));
    sessionsDir = join(home, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function write(name: string, lines: unknown[]): string {
    const file = join(sessionsDir, name);
    writeFileSync(
      file,
      lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n"),
      "utf8",
    );
    return file;
  }

  it("still lists the folder when the current session is not saved yet", () => {
    write("2026-11-07T20-00-00-000Z_b.jsonl", [
      { type: "message", message: { role: "user", content: "旧的" } },
    ]);
    const unsaved = join(sessionsDir, "2026-11-08T11-00-00-000Z_new.jsonl");
    expect(listSessions(home, unsaved).map((meta) => meta.firstUser)).toEqual(["旧的"]);
    expect(listSessions(home, join(home, "elsewhere", "x.jsonl"))).toEqual([]);
  });

  it("lists the directory's sessions newest first", () => {
    const current = write("2026-11-08T09-00-00-000Z_a.jsonl", [
      { type: "message", message: { role: "user", content: "问" } },
    ]);
    const yesterday = write("2026-11-07T20-00-00-000Z_b.jsonl", [
      "corrupt line {",
      { type: "message", message: { role: "user", content: "昨天的问题" } },
      { type: "message", message: { role: "assistant", content: "今日要点 · 离散 D2\n- 内容" } },
    ]);
    const newest = write("2026-11-08T10-00-00-000Z_c.jsonl", [
      { type: "message", message: { role: "assistant", content: [{ type: "toolcall" }] } },
      { type: "message", message: { role: "user", content: "第三场" } },
    ]);
    const list = listSessions(home, current);
    expect(list.map((meta) => meta.file)).toEqual([newest, current, yesterday]);
    expect(list[1]?.firstUser).toBe("问");
    expect(list[2]?.pin).toBe("离散 D2");
    expect(list[2]?.count).toBe(2);
  });

  it("returns [] when current is outside <home>/sessions", () => {
    const outside = join(home, "2026-11-08T09-00-00-000Z_x.jsonl");
    writeFileSync(outside, "", "utf8");
    expect(listSessions(home, outside)).toEqual([]);
  });
});

describe("listOtherSessions", () => {
  let home: string;
  let sessionsDir: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "xuegen-others-"));
    sessionsDir = join(home, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  /** Write a minimal transcript (one user message) into `dir` (a folder name under sessions/). */
  function write(dir: string, name: string, user = "问"): string {
    const folder = join(sessionsDir, dir);
    mkdirSync(folder, { recursive: true });
    const file = join(folder, name);
    writeFileSync(
      file,
      JSON.stringify({ type: "message", message: { role: "user", content: user } }),
      "utf8",
    );
    return file;
  }

  it("groups other folders newest first, labels them by their last segment, skips the current folder and empty ones", () => {
    const current = write("--Users-me-xuegen--", "2026-11-08T09-00-00-000Z_a.jsonl", "我的会话");
    write("--Users-alice-projects-foo--", "2026-11-06T10-00-00-000Z_旧.jsonl", "旧问题");
    write("--Users-alice-projects-foo--", "2026-11-07T10-00-00-000Z_新.jsonl", "新问题");
    write("--Users-bob-bar--", "2026-11-08T10-00-00-000Z_z.jsonl", "最近的一场");
    mkdirSync(join(sessionsDir, "--Users-carol-empty--"), { recursive: true });

    const groups = listOtherSessions(home, current);
    expect(groups.map((group) => group.dir)).toEqual(["--Users-bob-bar--", "--Users-alice-projects-foo--"]);
    expect(groups[0]?.label).toBe("bar");
    expect(groups[1]?.label).toBe("foo");
    expect(groups[1]?.sessions.map((meta) => meta.firstUser)).toEqual(["新问题", "旧问题"]);
  });

  it("returns [] when current is outside <home>/sessions, and skips folders that escape via symlink", () => {
    const current = write("--Users-me-xuegen--", "2026-11-08T09-00-00-000Z_a.jsonl");
    const outside = join(home, "outside-sessions");
    mkdirSync(outside);
    writeFileSync(join(outside, "2026-11-08T08-00-00-000Z_leak.jsonl"), "", "utf8");
    symlinkSync(outside, join(sessionsDir, "--Users-eve-escape--"));

    const groups = listOtherSessions(home, current);
    expect(groups.map((group) => group.dir)).toEqual([]);

    // `current` outside <home>/sessions never lists anything.
    const elsewhere = join(home, "2026-11-08T09-00-00-000Z_x.jsonl");
    writeFileSync(elsewhere, "", "utf8");
    expect(listOtherSessions(home, elsewhere)).toEqual([]);
  });

  it("skips a group whose folder disappears between readdir and realpath", () => {
    const current = write("--Users-me-xuegen--", "2026-11-08T09-00-00-000Z_a.jsonl");
    write("--Users-bob-bar--", "2026-11-08T10-00-00-000Z_z.jsonl", "还在的");
    mkdirSync(join(sessionsDir, "gone"));

    const groups = listOtherSessions(home, current);
    expect(groups.map((group) => group.dir)).toEqual(["--Users-bob-bar--"]);
  });

  it("labels a folder named like `--Users-alice--` as `alice`", () => {
    const current = write("--Users-me-xuegen--", "2026-11-08T09-00-00-000Z_a.jsonl");
    write("--Users-alice--", "2026-11-07T10-00-00-000Z_s.jsonl");
    const groups = listOtherSessions(home, current);
    expect(groups[0]?.dir).toBe("--Users-alice--");
    expect(groups[0]?.label).toBe("alice");
  });
});
