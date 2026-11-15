// @vitest-environment node
// 「今天学过」: pure `studiedInTranscript` / `mergeStudied` cases on canned
// transcript text, and `listStudied` against a temporary <home>/sessions tree.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listStudied, mergeStudied, studiedInTranscript } from "./studied.js";

const DAY = "2026-11-15";
const DAY_START = new Date(2026, 10, 15).getTime();
const DAY_END = new Date(2026, 10, 16).getTime();

/** A local-time ISO timestamp on Nov `day` at `h:min`. */
function at(day: number, h: number, min = 0): string {
  return new Date(2026, 10, day, h, min).toISOString();
}

/** The same instant as epoch ms. */
function ms(day: number, h: number, min = 0): number {
  return new Date(2026, 10, day, h, min).getTime();
}

/** One transcript line; `timestamp` may be left out entirely. */
function line(role: "user" | "assistant", content: string, timestamp?: string): string {
  return JSON.stringify({ type: "message", timestamp, message: { role, content } });
}

describe("studiedInTranscript", () => {
  it("A: a lesson session yields its slug, the pin title, and first user → last assistant", () => {
    const text = [
      line("user", "[风格：细讲] 开始今天的课\n⟦xuegen:open|epp|离散数学⟧", at(15, 8, 10)),
      line("assistant", "开场白，没有要点", at(15, 8, 11)),
      line("assistant", "> [!abstract] 今日要点 · 离散 D3\n- 有效论证", at(15, 9, 40)),
      line("assistant", "今日要点 · 不该取到", at(15, 9, 50)),
    ].join("\n");
    expect(studiedInTranscript(text, DAY_START, DAY_END)).toEqual({
      slug: "epp",
      action: "lesson",
      pin: "离散 D3",
      from: ms(15, 8, 10),
      to: ms(15, 9, 50),
    });
  });

  it("B: records outside the day do not move the span; the slug may come from an earlier day", () => {
    const text = [
      line("user", "开始昨天的课\n⟦xuegen:open|epp|离散数学⟧", at(14, 20, 0)),
      line("assistant", "今日要点 · 离散 D2\n- 昨天的要点不算", at(14, 20, 30)),
      line("user", "接着昨天讲", at(15, 8, 0)),
      line("assistant", "回答", at(15, 9, 0)),
    ].join("\n");
    const span = studiedInTranscript(text, DAY_START, DAY_END);
    expect(span?.slug).toBe("epp");
    expect(span?.from).toBe(ms(15, 8, 0));
    expect(span?.to).toBe(ms(15, 9, 0));
    // 昨天的 open 只定 slug：action 与 pin 都看当天的消息。
    expect(span?.action).toBe("other");
    expect(span?.pin).toBeNull();
  });

  it("C: sessions without an open/resume/verify course marker return null", () => {
    for (const first of [
      "随便问问",
      "陪我读一段\n⟦xuegen:accompany⟧",
      "问领域\n⟦xuegen:domain|programming-paradigms|编程范式⟧",
      "今天的安排\n⟦xuegen:brief⟧",
    ]) {
      const text = [line("user", first, at(15, 8, 0)), line("assistant", "回答", at(15, 9, 0))].join("\n");
      expect(studiedInTranscript(text, DAY_START, DAY_END)).toBeNull();
    }
  });

  it('D: a day whose only marker is verify comes out "verify"', () => {
    const text = [
      line("user", "核实第三周\n⟦xuegen:verify|ctm|CTM 7 周⟧", at(15, 10, 0)),
      line("assistant", "第一项…", at(15, 10, 5)),
    ].join("\n");
    const span = studiedInTranscript(text, DAY_START, DAY_END);
    expect(span?.slug).toBe("ctm");
    expect(span?.action).toBe("verify");
  });

  it("E: with no assistant answer, `to` falls back to the day's last user message", () => {
    const one = line("user", "⟦xuegen:open|epp|离散⟧", at(15, 8, 10));
    expect(studiedInTranscript(one, DAY_START, DAY_END)).toMatchObject({
      from: ms(15, 8, 10),
      to: ms(15, 8, 10),
    });
    const two = [
      line("user", "⟦xuegen:open|epp|离散⟧", at(15, 8, 10)),
      line("user", "追问一句", at(15, 8, 50)),
    ].join("\n");
    expect(studiedInTranscript(two, DAY_START, DAY_END)?.to).toBe(ms(15, 8, 50));
  });

  it("H: bad lines and records without a timestamp are skipped, not fatal", () => {
    const text = [
      "corrupt line {",
      JSON.stringify({ type: "message", message: { role: "user", content: "没有时间的消息" } }),
      line("user", "⟦xuegen:open|epp|离散⟧", at(15, 8, 10)),
      line("assistant", "今日要点 · 离散 D3", at(15, 9, 0)),
      JSON.stringify({ type: "session", cwd: "/tmp" }),
    ].join("\n");
    expect(studiedInTranscript(text, DAY_START, DAY_END)).toMatchObject({
      slug: "epp",
      action: "lesson",
      pin: "离散 D3",
      from: ms(15, 8, 10),
      to: ms(15, 9, 0),
    });
  });

  it("returns null when the day holds no user message", () => {
    const text = [
      line("user", "⟦xuegen:open|epp|离散⟧", at(14, 20, 0)),
      line("assistant", "只有助手说过话", at(15, 9, 0)),
    ].join("\n");
    expect(studiedInTranscript(text, DAY_START, DAY_END)).toBeNull();
  });
});

describe("mergeStudied", () => {
  it("F: one course's sessions merge into a single earliest-to-latest span", () => {
    const merged = mergeStudied([
      { slug: "epp", action: "other", pin: null, from: ms(15, 14, 0), to: ms(15, 15, 0) },
      { slug: "epp", action: "lesson", pin: "离散 D3", from: ms(15, 9, 0), to: ms(15, 9, 30) },
    ]);
    expect(merged).toEqual([
      { slug: "epp", action: "lesson", pin: "离散 D3", from: ms(15, 9, 0), to: ms(15, 15, 0) },
    ]);
  });

  it("F: lesson beats verify for the merged action, and the pin comes from the lesson", () => {
    const merged = mergeStudied([
      { slug: "ctm", action: "verify", pin: null, from: ms(15, 14, 0), to: ms(15, 15, 0) },
      { slug: "ctm", action: "lesson", pin: "CTM W3", from: ms(15, 9, 0), to: ms(15, 9, 30) },
    ]);
    expect(merged).toEqual([
      { slug: "ctm", action: "lesson", pin: "CTM W3", from: ms(15, 9, 0), to: ms(15, 15, 0) },
    ]);
  });

  it("keeps different courses apart and sorts the result by `from`", () => {
    const merged = mergeStudied([
      { slug: "ctm", action: "verify", pin: null, from: ms(15, 14, 0), to: ms(15, 15, 0) },
      { slug: "epp", action: "lesson", pin: "离散 D3", from: ms(15, 9, 0), to: ms(15, 9, 30) },
    ]);
    expect(merged.map((span) => span.slug)).toEqual(["epp", "ctm"]);
  });
});

describe("listStudied", () => {
  let home: string;
  let sessionsDir: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "xuegen-studied-"));
    sessionsDir = join(home, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function record(role: "user" | "assistant", content: string, timestamp: string): object {
    return { type: "message", timestamp, message: { role, content } };
  }

  /** Write a transcript and pin its mtime (fresh writes would carry "now"). */
  function write(dir: string, name: string, lines: (string | object)[], touched = ms(15, 12, 0)): string {
    const file = join(dir, name);
    writeFileSync(
      file,
      lines.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))).join("\n"),
      "utf8",
    );
    utimesSync(file, touched / 1000, touched / 1000);
    return file;
  }

  it("G: reads sessions/ and its direct subdirectories, merging one course's sessions", () => {
    const sub = join(sessionsDir, "sub");
    mkdirSync(sub);
    write(sub, "2026-11-14T20-00-00-000Z_a.jsonl", [
      record("user", "⟦xuegen:open|epp|离散⟧", at(15, 9, 0)),
      record("assistant", "今日要点 · 离散 D3", at(15, 9, 30)),
    ]);
    write(sub, "2026-11-14T21-00-00-000Z_b.jsonl", [
      record("user", "⟦xuegen:resume|epp|离散⟧", at(15, 14, 0)),
      record("assistant", "继续讲", at(15, 15, 0)),
    ]);
    write(sessionsDir, "2026-11-14T22-00-00-000Z_c.jsonl", [
      record("user", "⟦xuegen:verify|ctm|CTM⟧", at(15, 16, 0)),
      record("assistant", "核实第一项", at(15, 16, 10)),
    ]);
    const spans = listStudied(home, DAY);
    expect(spans).toEqual([
      { slug: "epp", action: "lesson", pin: "离散 D3", from: ms(15, 9, 0), to: ms(15, 15, 0) },
      { slug: "ctm", action: "verify", pin: null, from: ms(15, 16, 0), to: ms(15, 16, 10) },
    ]);
  });

  it("G: a file untouched today (mtime before the day) is skipped", () => {
    write(sessionsDir, "2026-11-14T20-00-00-000Z_a.jsonl", [
      record("user", "⟦xuegen:open|epp|离散⟧", at(15, 9, 0)),
      record("assistant", "今日要点 · 离散 D3", at(15, 9, 30)),
    ]);
    // Today's messages in content, but the file itself was last touched yesterday.
    write(
      sessionsDir,
      "2026-11-13T20-00-00-000Z_stale.jsonl",
      [record("user", "⟦xuegen:open|ctm|CTM⟧", at(15, 10, 0))],
      ms(14, 23, 59),
    );
    expect(listStudied(home, DAY).map((span) => span.slug)).toEqual(["epp"]);
  });

  it("G: a name whose start stamp is past the day's end is skipped", () => {
    write(sessionsDir, "2026-11-17T20-00-00-000Z_late.jsonl", [
      record("user", "⟦xuegen:open|epp|离散⟧", at(15, 9, 0)),
    ]);
    expect(listStudied(home, DAY)).toEqual([]);
  });

  it("G: a symlinked directory pointing outside <home>/sessions is not read", () => {
    const outside = mkdtempSync(join(tmpdir(), "xuegen-outside-"));
    try {
      write(outside, "2026-11-14T20-00-00-000Z_x.jsonl", [
        record("user", "⟦xuegen:open|epp|离散⟧", at(15, 9, 0)),
      ]);
      symlinkSync(outside, join(sessionsDir, "linked"));
      expect(listStudied(home, DAY)).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("G: a missing sessions directory yields an empty list", () => {
    expect(listStudied(join(home, "absent"), DAY)).toEqual([]);
  });
});
