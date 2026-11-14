import { describe, expect, it } from "vitest";
import type { TermGroup } from "@shared/data-protocol.js";
import { obsidianUrl, stripTitle, termTrail, termsCourses, termsSince, termsView } from "./terms.js";

const group = (partial: Partial<TermGroup>): TermGroup => ({
  course: "discrete-math-epp",
  courseTitle: "离散数学（Epp, 5th ed）",
  date: "2026-11-12",
  lesson: "D3",
  terms: [
    {
      title: "有效论证",
      path: "/v/wiki/knowledge/concepts/discrete-math/110-valid-argument.md",
      definition: "前提都真时结论必真",
      exists: true,
    },
    {
      title: "可靠",
      path: "/v/wiki/knowledge/concepts/discrete-math/120-sound.md",
      definition: null,
      exists: false,
    },
  ],
  ...partial,
});

describe("termsView", () => {
  it("labels a lesson with the course's short name, the lesson and MM-DD; every term links to Obsidian", () => {
    const [row] = termsView([group({})], { "discrete-math-epp": "离散" });
    expect(row?.label).toBe("离散 D3 · 11-12");
    expect(row?.terms.map((term) => [term.title, term.hint, term.missing])).toEqual([
      ["有效论证", "前提都真时结论必真", false],
      ["可靠", null, true],
    ]);
    expect(row?.terms[0]?.path).toBe("/v/wiki/knowledge/concepts/discrete-math/110-valid-argument.md");
  });

  it("falls back to the full title without a short name, and leaves the lesson out when unknown", () => {
    const [row] = termsView([group({ lesson: null })], {});
    expect(row?.label).toBe("离散数学（Epp, 5th ed） · 11-12");
  });

  it("keeps the data channel's order and caps the rows", () => {
    const rows = termsView(
      [
        group({ date: "2026-11-12" }),
        group({ date: "2026-11-11", lesson: "D2" }),
        group({ date: "2026-11-09", lesson: "D1" }),
      ],
      {},
      2,
    );
    expect(rows.map((row) => row.key)).toEqual([
      "discrete-math-epp|2026-11-12|D3",
      "discrete-math-epp|2026-11-11|D2",
    ]);
  });
});

describe("termsSince / obsidianUrl", () => {
  it("looks back two weeks including today, across a month edge", () => {
    expect(termsSince("2026-11-13")).toBe("2026-10-31");
    expect(termsSince("2026-11-13", 1)).toBe("2026-11-13");
  });

  it("encodes spaces and CJK in the path", () => {
    expect(obsidianUrl("/a b/术语.md")).toBe("obsidian://open?path=%2Fa%20b%2F%E6%9C%AF%E8%AF%AD.md");
  });
});

describe("termsCourses / termTrail", () => {
  const rows = termsView(
    [
      group({ date: "2026-11-12" }),
      group({
        course: "ctm",
        courseTitle: "CTM",
        date: "2026-11-11",
        lesson: "D1",
        terms: [{ title: "核心语言", path: "/v/c.md", definition: null, exists: true }],
      }),
      group({
        date: "2026-11-09",
        lesson: "D1",
        terms: [{ title: "命题", path: "/v/p.md", definition: null, exists: true }],
      }),
    ],
    { "discrete-math-epp": "离散" },
  );

  it("each row knows its course; courses come in first-seen order with their term counts", () => {
    expect(rows.map((row) => row.course)).toEqual(["discrete-math-epp", "ctm", "discrete-math-epp"]);
    expect(termsCourses(rows)).toEqual([
      { course: "discrete-math-epp", name: "离散", count: 3 },
      { course: "ctm", name: "CTM", count: 1 },
    ]);
  });

  it("the trail walks the openable terms in the order shown, with their lesson label", () => {
    expect(termTrail(rows).map((stop) => [stop.title, stop.label])).toEqual([
      ["有效论证", "离散 D3 · 11-12"],
      ["核心语言", "CTM D1 · 11-11"],
      ["命题", "离散 D1 · 11-09"],
    ]);
  });
});

describe("stripTitle", () => {
  it("drops the page's leading H1 (the reader shows the title itself)", () => {
    expect(stripTitle("\n# 变量与三类陈述\n\n## Definition\n正文")).toBe("## Definition\n正文");
  });

  it("leaves a page without a leading H1 alone", () => {
    expect(stripTitle("正文\n# 后面的标题")).toBe("正文\n# 后面的标题");
  });
});
