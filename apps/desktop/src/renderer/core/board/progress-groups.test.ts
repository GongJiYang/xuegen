import { describe, expect, it } from "vitest";
import type { CourseSummary, SubjectsOverview } from "@shared/data-protocol.js";
import { courseMark, groupProgress } from "./progress-groups.js";
import { strings } from "../strings.js";

function course(slug: string, done: number, total: number, last: string | null): CourseSummary {
  return {
    slug,
    title: slug,
    weekLabel: null,
    week: { done: 0, total: 0, tasks: [] },
    overall: { done, total },
    lastRecord: last ? { date: last, seq: "01" } : null,
    nextSession: null,
    styleHint: null,
  };
}

const OVERVIEW: SubjectsOverview = {
  date: "2026-11-06",
  cycle: { cycle: "C1", week: 1, weeks: 7, aux: "（空）；（空）——路线原定数据结构与算法" },
  subjects: [
    { slug: "ai", title: "AI", layer: "C", route: "路线外", main: false, courses: ["mi", "gone"], materials: [] },
    {
      slug: "dm",
      title: "离散",
      layer: "A",
      route: "C1 主项",
      main: true,
      courses: ["epp"],
      materials: [
        { type: "书籍", mark: "now", status: "学习中", role: "主线", title: "Epp", course: "epp" },
        { type: "书籍", mark: "none", status: "未制定计划", role: "预习", title: "Walk", course: null },
      ],
    },
    {
      slug: "se",
      title: "软件工程",
      layer: "D",
      route: "C10 主项",
      main: false,
      courses: [],
      materials: [{ type: "文章", mark: "done", status: "已摄取", role: "参考", title: "Command", course: null }],
    },
    { slug: "empty", title: "空科目", layer: "A", route: "C2 主项", main: false, courses: [], materials: [] },
  ],
};

describe("courseMark", () => {
  it("marks finished, not started, stale and active courses", () => {
    expect(courseMark(course("a", 4, 4, "2026-10-01"), "2026-11-06")).toBe("done");
    expect(courseMark(course("a", 0, 4, null), "2026-11-06")).toBe("plan");
    expect(courseMark(course("a", 0, 4, "2026-10-22"), "2026-11-06")).toBe("warn");
    expect(courseMark(course("a", 0, 4, "2026-10-23"), "2026-11-06")).toBe("now");
  });
});

describe("groupProgress", () => {
  const courses = [course("epp", 0, 4, "2026-11-05"), course("mi", 0, 4, "2026-10-18"), course("loose", 0, 1, null)];
  const groups = groupProgress(OVERVIEW, courses, "2026-11-06");

  it("puts the main subjects first with their courses and unplanned count", () => {
    expect(groups.cycle).toEqual({ cycle: "C1", week: 1, weeks: 7 });
    expect(groups.auxEmpty).toBe(true);
    expect(groups.main.map((group) => [group.title, group.courses.map((item) => [item.course.slug, item.mark]), group.unplanned])).toEqual([
      ["离散", [["epp", "now"]], 1],
    ]);
  });

  it("lists other subjects with courses, then the courses no subject claims", () => {
    expect(groups.other.map((group) => [group.title, group.courses.map((item) => [item.course.slug, item.mark])])).toEqual([
      ["AI", [["mi", "warn"]]],
      [strings.progress.unassigned, [["loose", "plan"]]],
    ]);
  });

  it("lists subjects with only ingested materials as learned", () => {
    expect(groups.learned).toEqual([{ slug: "se", title: "软件工程", done: 1 }]);
  });

  it("has no cycle line outside a cycle", () => {
    const outside = groupProgress({ ...OVERVIEW, cycle: null }, courses, "2026-11-06");
    expect(outside.cycle).toBeNull();
    expect(outside.aux).toBeNull();
    expect(outside.auxEmpty).toBe(true);
  });
});
