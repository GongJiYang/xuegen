import { describe, expect, it } from "vitest";
import {
  CONTEXT_SOON_PERCENT,
  contextUsageDetail,
  contextUsageLabel,
  contextUsageView,
  notesAt,
  threadNotes,
} from "./context-usage.js";
import { strings } from "../strings.js";

describe("contextUsageLabel", () => {
  it("shows the rounded percent", () => {
    expect(contextUsageLabel({ tokens: 40_400, contextWindow: 100_000, percent: 40.4 }, false)).toBe(
      strings.chat.context(40),
    );
  });

  it("warns at and above the threshold", () => {
    const usage = { tokens: 80_000, contextWindow: 100_000, percent: CONTEXT_SOON_PERCENT };
    expect(contextUsageLabel(usage, false)).toBe(`${strings.chat.context(80)}${strings.chat.contextSoon}`);
  });

  it("shows unknown when there is no usage or the percent is null (just compacted)", () => {
    expect(contextUsageLabel(null, false)).toBe(strings.chat.contextUnknown);
    expect(contextUsageLabel({ tokens: null, contextWindow: 100_000, percent: null }, false)).toBe(
      strings.chat.contextUnknown,
    );
  });

  it("says compacting while a compaction runs, whatever the usage", () => {
    expect(contextUsageLabel({ tokens: 1, contextWindow: 2, percent: 50 }, true)).toBe(strings.chat.compacting);
  });
});

describe("contextUsageDetail / contextUsageView", () => {
  it("falls back when usage is unavailable", () => {
    expect(contextUsageDetail(null)).toBe(strings.chat.contextUnavailable);
    const view = contextUsageView(null, false, () => {});
    expect(view).toMatchObject({ tokens: null, contextWindow: 0, percent: null, compacting: false });
  });

  it("carries the numbers and the compact action", () => {
    let called = 0;
    const view = contextUsageView({ tokens: 10, contextWindow: 100, percent: 10 }, false, () => {
      called += 1;
    });
    expect(view.detail).toBe(strings.chat.contextDetail(10, 100));
    view.onCompact();
    expect(called).toBe(1);
  });
});

describe("threadNotes / notesAt", () => {
  const notes = threadNotes([
    { beforeIndex: 0, kind: "compaction" },
    { beforeIndex: 2, kind: "compaction" },
    { beforeIndex: 9, kind: "compaction" },
  ]);

  it("uses the compaction text", () => {
    expect(notes.every((note) => note.text === strings.chat.compactionNote)).toBe(true);
  });

  it("places notes by index and clamps past-the-end notes to the end", () => {
    expect(notesAt(notes, 0, 3)).toHaveLength(1);
    expect(notesAt(notes, 1, 3)).toHaveLength(0);
    expect(notesAt(notes, 2, 3)).toHaveLength(1);
    expect(notesAt(notes, 3, 3)).toHaveLength(1);
  });
});
