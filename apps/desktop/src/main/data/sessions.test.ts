// @vitest-environment node
// Session summaries: pure `summarizeSession` cases on canned transcript text,
// and `listSessions` against a temporary <home>/sessions directory.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listSessions, summarizeSession } from "./sessions.js";

const FILE = "/tmp/sessions/2026-11-08T09-12-34-123Z_test.jsonl";

describe("summarizeSession", () => {
  it("counts user and assistant text messages, skipping bad lines and textless records", () => {
    const text = [
      JSON.stringify({ type: "session", cwd: "/tmp" }),
      "not json at all",
      JSON.stringify({ type: "message", message: { role: "user", content: "第一个问题" } }),
      JSON.stringify({
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "回答一" }, { type: "toolcall", id: "t1" }] },
      }),
      JSON.stringify({ type: "message", message: { role: "toolResult", content: "工具结果" } }),
      // An assistant turn with only tool calls has no text and does not count.
      JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "toolcall", id: "t2" }] } }),
      JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "第二个问题" }] } }),
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
      JSON.stringify({ type: "message", message: { role: "assistant", content: "> [!abstract] 今日要点 · 离散 D2\n- 真值表" } }),
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
    write("2026-11-07T20-00-00-000Z_b.jsonl", [{ type: "message", message: { role: "user", content: "旧的" } }]);
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
