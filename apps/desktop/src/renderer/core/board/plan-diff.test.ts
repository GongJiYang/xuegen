import { describe, expect, it } from "vitest";
import type { CycleMonth } from "@shared/data-protocol.js";
import { changeLine, placements, planDiff, planMarks } from "./plan-diff.js";

const month = (name: string, lessons: CycleMonth["lessons"]): CycleMonth => ({
  month: name,
  days: {},
  lessons,
  names: {},
  subjects: {},
  roles: {},
  cycles: [],
  recovery: [],
});
const lesson = (course: string, id: string) => ({ course, id, content: "" });

describe("placements", () => {
  it("maps every lesson to its day across months, keeping the first day of a repeated lesson", () => {
    const result = placements([
      month("2026-11", {
        "2026-11-30": [lesson("dm", "D9")],
        "2026-11-16": [lesson("dm", "D4"), lesson("ctm", "D2")],
      }),
      month("2026-12", { "2026-12-01": [lesson("dm", "D9")] }),
    ]);
    expect(result).toEqual({
      "dm|D4": { course: "dm", id: "D4", date: "2026-11-16" },
      "ctm|D2": { course: "ctm", id: "D2", date: "2026-11-16" },
      "dm|D9": { course: "dm", id: "D9", date: "2026-11-30" },
    });
  });
});

describe("planDiff", () => {
  const before = placements([
    month("2026-11", {
      "2026-11-16": [lesson("dm", "D4")],
      "2026-11-17": [lesson("ctm", "D2")],
      "2026-11-19": [lesson("ctm", "D3")],
      "2026-11-20": [lesson("c", "D3")],
    }),
  ]);

  it("lists moved, added and removed lessons by their earlier day; untouched ones are left out", () => {
    const after = placements([
      month("2026-11", {
        "2026-11-17": [lesson("dm", "D4")],
        "2026-11-18": [lesson("ctm", "D2")],
        "2026-11-19": [lesson("ctm", "D3")],
        "2026-11-21": [lesson("dm", "D5")],
      }),
    ]);
    expect(planDiff(before, after)).toEqual([
      { course: "dm", id: "D4", from: "2026-11-16", to: "2026-11-17" },
      { course: "ctm", id: "D2", from: "2026-11-17", to: "2026-11-18" },
      { course: "c", id: "D3", from: "2026-11-20", to: null },
      { course: "dm", id: "D5", from: null, to: "2026-11-21" },
    ]);
  });

  it("is empty when nothing moved", () => {
    expect(planDiff(before, before)).toEqual([]);
  });
});

describe("changeLine / planMarks", () => {
  const names = { dm: "离散" };
  const moved = { course: "dm", id: "D4", from: "2026-11-16", to: "2026-11-17" };
  const added = { course: "dm", id: "D9", from: null, to: "2026-11-20" };
  const removed = { course: "ctm", id: "D3", from: "2026-11-19", to: null };

  it("words each change with the short name, falling back to the slug", () => {
    expect(changeLine(moved, names)).toBe("离散 D4 11-16 → 11-17");
    expect(changeLine(added, names)).toBe("新加 离散 D9 · 11-20");
    expect(changeLine(removed, names)).toBe("删掉 ctm D3（原 11-19）");
  });

  it("marks the new places and leaves struck-out copies on the old days", () => {
    expect(planMarks([moved, added, removed], names, { ctm: "aux" })).toEqual({
      at: { "2026-11-17|dm|D4": "从 11-16 挪来", "2026-11-20|dm|D9": "新" },
      ghosts: {
        "2026-11-16": [{ lane: "main", label: "离散 D4", note: "→ 11-17" }],
        "2026-11-19": [{ lane: "guide", label: "ctm D3", note: "删掉" }],
      },
    });
  });
});
