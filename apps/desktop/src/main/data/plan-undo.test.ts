// @vitest-environment node
import { describe, expect, it } from "vitest";
import { planCommitsOf, planUndoResultOf } from "./plan-undo.js";

describe("planCommitsOf", () => {
  it("unwraps the script's commits array", () => {
    expect(
      planCommitsOf({
        commits: [
          { id: "abc123", kind: "计划", slug: "epp", date: "2026-11-14" },
          { id: "def456", kind: "顺延", slug: "linear", date: "2026-11-14" },
        ],
      }),
    ).toEqual([
      { id: "abc123", kind: "计划", slug: "epp", date: "2026-11-14" },
      { id: "def456", kind: "顺延", slug: "linear", date: "2026-11-14" },
    ]);
  });

  it("reports an empty list for a missing or malformed envelope", () => {
    expect(planCommitsOf({ commits: [] })).toEqual([]);
    expect(planCommitsOf({})).toEqual([]);
    expect(planCommitsOf(null)).toEqual([]);
    expect(planCommitsOf("oops")).toEqual([]);
    expect(planCommitsOf({ commits: "not-an-array" })).toEqual([]);
  });

  it("drops entries that are not well-formed plan commits", () => {
    expect(
      planCommitsOf({
        commits: [
          { id: "abc123", kind: "计划", slug: "epp", date: "2026-11-14" },
          { id: "bad", kind: "收课", slug: "epp", date: "2026-11-14" },
          { id: 7, kind: "计划", slug: "epp", date: "2026-11-14" },
          "garbage",
        ],
      }),
    ).toEqual([{ id: "abc123", kind: "计划", slug: "epp", date: "2026-11-14" }]);
  });
});

describe("planUndoResultOf", () => {
  it("keeps the four protocol fields and drops the rest", () => {
    expect(
      planUndoResultOf({
        undone: ["a", "b"],
        restoreFiles: ["wiki/courses/epp.md"],
        keptNew: ["wiki/courses/linear.md"],
        jj: "ok",
        board: "ok",
      }),
    ).toEqual({
      undone: ["a", "b"],
      restoreFiles: ["wiki/courses/epp.md"],
      keptNew: ["wiki/courses/linear.md"],
      board: "ok",
    });
  });

  it("degrades malformed fields to empty arrays and board skipped", () => {
    expect(planUndoResultOf(null)).toEqual({
      undone: [],
      restoreFiles: [],
      keptNew: [],
      board: "skipped",
    });
    expect(
      planUndoResultOf({ undone: ["a", 3], restoreFiles: "x", keptNew: null, board: 42 }),
    ).toEqual({ undone: ["a"], restoreFiles: [], keptNew: [], board: "skipped" });
  });
});
