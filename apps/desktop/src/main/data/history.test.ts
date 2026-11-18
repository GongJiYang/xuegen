// @vitest-environment node
import { describe, expect, it } from "vitest";
import { historyEntriesOf, historyUndoResultOf } from "./history.js";

const ENTRY = {
  id: "0123abcd",
  at: "2026-11-17T10:00:00+08:00",
  verb: "收课",
  slug: "epp",
  text: "收课 epp 2026-11-17",
  manual: false,
  added: { concepts: 1, cards: 2 },
  undoable: true,
  blocked: null,
};

describe("historyEntriesOf", () => {
  it("unwraps the script's entries array", () => {
    const manual = {
      id: "def45678",
      at: "2026-11-17T11:00:00+08:00",
      verb: null,
      slug: null,
      text: "改名：库全英文命名",
      manual: true,
      added: { concepts: 0, cards: 0 },
      undoable: false,
      blocked: "kind",
    };
    expect(historyEntriesOf({ entries: [ENTRY, manual] })).toEqual([ENTRY, manual]);
  });

  it("reports an empty list for a missing or malformed envelope", () => {
    expect(historyEntriesOf({ entries: [] })).toEqual([]);
    expect(historyEntriesOf({})).toEqual([]);
    expect(historyEntriesOf(null)).toEqual([]);
    expect(historyEntriesOf("oops")).toEqual([]);
    expect(historyEntriesOf({ entries: "not-an-array" })).toEqual([]);
  });

  it("drops entries that are not well-formed history entries", () => {
    expect(
      historyEntriesOf({
        entries: [
          ENTRY,
          { ...ENTRY, id: 7 },
          { ...ENTRY, id: "abc", verb: 3 },
          { ...ENTRY, id: "def", blocked: "later" },
          { ...ENTRY, id: "ghi", blocked: "wrong" },
          { ...ENTRY, id: "jkl", added: { concepts: "1", cards: 0 } },
          { ...ENTRY, id: "mno", added: null },
          { ...ENTRY, id: "pqr", undoable: "yes" },
          "garbage",
        ],
      }),
    ).toEqual([ENTRY, { ...ENTRY, id: "def", blocked: "later" }]);
  });
});

describe("historyUndoResultOf", () => {
  it("keeps the five protocol fields and drops the rest", () => {
    expect(
      historyUndoResultOf({
        undone: ["a", "b"],
        restoreFiles: ["wiki/courses/epp.md"],
        keptNew: ["wiki/knowledge/concepts/demo/010-a.md"],
        keptShared: ["wiki/log.md", "wiki/index.md"],
        jj: "ok",
        board: "ok",
      }),
    ).toEqual({
      undone: ["a", "b"],
      restoreFiles: ["wiki/courses/epp.md"],
      keptNew: ["wiki/knowledge/concepts/demo/010-a.md"],
      keptShared: ["wiki/log.md", "wiki/index.md"],
      board: "ok",
    });
  });

  it("degrades malformed fields to empty arrays and board skipped", () => {
    expect(historyUndoResultOf(null)).toEqual({
      undone: [],
      restoreFiles: [],
      keptNew: [],
      keptShared: [],
      board: "skipped",
    });
    expect(
      historyUndoResultOf({
        undone: ["a", 3],
        restoreFiles: "x",
        keptNew: null,
        keptShared: 5,
        board: 42,
      }),
    ).toEqual({ undone: ["a"], restoreFiles: [], keptNew: [], keptShared: [], board: "skipped" });
  });
});
