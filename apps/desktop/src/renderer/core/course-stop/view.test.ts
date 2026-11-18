import { describe, expect, it } from "vitest";
import type { CourseSummary } from "@shared/data-protocol.js";
import { stoppedList, summaryLine } from "./view.js";

function course(slug: string, title: string, archivedOn: string | null, archived = true): CourseSummary {
  return {
    slug,
    title,
    weekLabel: null,
    week: { done: 0, total: 0, tasks: [] },
    overall: { done: 0, total: 0 },
    lastRecord: null,
    nextSession: null,
    styleHint: null,
    archived,
    archivedOn,
  };
}

describe("stoppedList", () => {
  it("keeps only the stopped courses, oldest stop first, as name + MM-DD", () => {
    const list = stoppedList([
      course("data-structures", "数据结构", "2026-11-15"),
      course("ctm", "CTM", null, false),
      course("c-language", "C 语言", "2026-11-10"),
    ]);

    expect(list).toEqual([
      { slug: "c-language", name: "C 语言", on: "11-10" },
      { slug: "data-structures", name: "数据结构", on: "11-15" },
    ]);
  });

  it("orders stops across a year boundary by the full date, not by MM-DD", () => {
    const list = stoppedList([
      course("older", "旧课", "2025-12-30"),
      course("newer", "新课", "2026-01-02"),
    ]);
    expect(list.map((item) => item.slug)).toEqual(["older", "newer"]);
  });

  it("leaves `on` empty when the stop date is unknown", () => {
    expect(stoppedList([course("ctm", "CTM", null)])).toEqual([{ slug: "ctm", name: "CTM", on: "" }]);
  });

  it("returns nothing while the course list is still loading", () => {
    expect(stoppedList(null)).toEqual([]);
  });
});

describe("summaryLine", () => {
  it("counts the courses and joins their names", () => {
    expect(summaryLine([{ name: "C 语言" }, { name: "数据结构" }])).toBe("已停用 2 门 · C 语言、数据结构");
  });
});
