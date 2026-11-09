/**
 * Role inference for sessions the interface did not label: the transcript's
 * action marker, `desktop.json`'s remembered maps, and the pre-marker opening
 * text.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inferSessionRole, roleFromHints, type SessionRoleHints } from "./session-role.js";

const temporary: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xuegen-guard-role-"));
  temporary.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** One transcript line as Pi writes it: a JSON object per message. */
function userLine(text: string): string {
  return `${JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text }] } })}\n`;
}

/** A transcript file holding the given user messages. */
function transcript(texts: readonly string[]): string {
  const dir = tempDir();
  const file = join(dir, "session.jsonl");
  writeFileSync(file, texts.map(userLine).join(""), "utf8");
  return file;
}

/** A `<home>` with an `desktop.json` holding the given maps. */
function home(settings: Record<string, unknown> | null): string {
  const dir = tempDir();
  if (settings !== null) writeFileSync(join(dir, "desktop.json"), JSON.stringify(settings), "utf8");
  return dir;
}

function hints(overrides: Partial<SessionRoleHints> = {}): SessionRoleHints {
  return {
    sessionFile: null,
    userTexts: [],
    courseSessions: {},
    controlFiles: [],
    ...overrides,
  };
}

describe("roleFromHints", () => {
  it("recognises a remembered 总控 file first", () => {
    expect(
      roleFromHints(
        hints({
          sessionFile: "/sessions/control.jsonl",
          controlFiles: ["/sessions/control.jsonl"],
          // Even an opening marker does not override the remembered 总控 file.
          userTexts: ["开始今天的 离散数学（Epp）\n⟦xuegen:open|epp|离散数学（Epp）⟧"],
        }),
      ),
    ).toEqual({ kind: "control" });
  });

  it("reads the opening marker's slug", () => {
    expect(
      roleFromHints(
        hints({ userTexts: ["开始今天的 离散数学（Epp）\n⟦xuegen:open|discrete-math-epp|离散数学（Epp）⟧"] }),
      ),
    ).toEqual({ kind: "course", slug: "discrete-math-epp" });
  });

  it("reads the plan / resume / continue markers too", () => {
    for (const action of ["plan", "resume", "continue"]) {
      expect(
        roleFromHints(hints({ userTexts: [`改计划\n⟦xuegen:${action}|ctm|计算理论⟧`] })),
      ).toEqual({ kind: "course", slug: "ctm" });
    }
  });

  it("treats the daily brief as 总控 (it only ever goes there)", () => {
    expect(roleFromHints(hints({ userTexts: ["今天的安排\n⟦xuegen:brief⟧"] }))).toEqual({ kind: "control" });
  });

  it("ignores a marker with no slug that is not the brief", () => {
    expect(roleFromHints(hints({ userTexts: ["收课\n⟦xuegen:close⟧"] }))).toEqual({ kind: "free" });
  });

  it("ignores the composer's style prefix before the marker", () => {
    expect(
      roleFromHints(hints({ userTexts: ["[风格：大白话] 开始今天的 离散\n⟦xuegen:open|epp|离散⟧"] })),
    ).toEqual({ kind: "course", slug: "epp" });
  });

  it("falls back to the remembered course map for a marker-less session", () => {
    expect(
      roleFromHints(
        hints({ sessionFile: "/sessions/epp.jsonl", courseSessions: { epp: "/sessions/epp.jsonl" } }),
      ),
    ).toEqual({ kind: "course", slug: "epp" });
  });

  it("rejects a remembered slug that is not slug-shaped", () => {
    expect(
      roleFromHints(
        hints({ sessionFile: "/sessions/x.jsonl", courseSessions: { "Not A Slug": "/sessions/x.jsonl" } }),
      ),
    ).toEqual({ kind: "free" });
  });

  it("reads the pre-marker opening text naming the course file", () => {
    expect(
      roleFromHints(
        hints({ userTexts: ["开始今天的 离散数学，下次起点：§2.1（课程文件：wiki/courses/epp.md）"] }),
      ),
    ).toEqual({ kind: "course", slug: "epp" });
  });

  it("does not treat an arbitrary prompt mentioning a course file as an opening", () => {
    expect(roleFromHints(hints({ userTexts: ["看看 wiki/courses/epp.md 里写了什么"] }))).toEqual({ kind: "free" });
  });

  it("falls back to free when nothing identifies the session", () => {
    expect(roleFromHints(hints({ userTexts: ["随便问问"] }))).toEqual({ kind: "free" });
  });
});

describe("inferSessionRole", () => {
  it("reads a real transcript file and its marker", () => {
    const file = transcript(["开始今天的 离散\n⟦xuegen:open|discrete-math-epp|离散数学⟧"]);
    expect(inferSessionRole(home({}), file)).toEqual({ kind: "course", slug: "discrete-math-epp" });
  });

  it("uses desktop.json's control map", () => {
    const file = transcript(["/skill:cycle-plan 给出今天的简报"]);
    const settings = { controlSessions: { C1: file } };
    expect(inferSessionRole(home(settings), file)).toEqual({ kind: "control" });
  });

  it("uses desktop.json's course map", () => {
    const file = transcript(["开始今天的 离散，课程文件见 wiki/courses/epp.md"]);
    const settings = { courseSessions: { epp: file } };
    expect(inferSessionRole(home(settings), file)).toEqual({ kind: "course", slug: "epp" });
  });

  it("tolerates a missing or hand-edited desktop.json", () => {
    const file = transcript(["/skill:teach 讲讲闭包"]);
    expect(inferSessionRole(home(null), file)).toEqual({ kind: "free" });
    const brokenHome = tempDir();
    writeFileSync(join(brokenHome, "desktop.json"), "{ not json", "utf8");
    expect(inferSessionRole(brokenHome, file)).toEqual({ kind: "free" });
    const wrongShapeHome = tempDir();
    writeFileSync(join(wrongShapeHome, "desktop.json"), JSON.stringify({ courseSessions: { ctm: 7 } }), "utf8");
    expect(inferSessionRole(wrongShapeHome, file)).toEqual({ kind: "free" });
  });

  it("returns free when there is no session file (a brand-new session)", () => {
    const settingsHome = home({ controlSessions: { C1: "/s.jsonl" } });
    expect(inferSessionRole(settingsHome, null)).toEqual({ kind: "free" });
  });

  it("returns free when the transcript cannot be read", () => {
    expect(inferSessionRole(home(null), join(tempDir(), "missing.jsonl"))).toEqual({ kind: "free" });
  });

  it("survives a truncated tail line (a mid-file cut)", () => {
    const dir = tempDir();
    const file = join(dir, "session.jsonl");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      file,
      `${userLine("开始今天的 离散\n⟦xuegen:open|epp|离散⟧")}{"type":"message","message":{"role":"user","conte`,
      "utf8",
    );
    expect(inferSessionRole(home(null), file)).toEqual({ kind: "course", slug: "epp" });
  });
});
