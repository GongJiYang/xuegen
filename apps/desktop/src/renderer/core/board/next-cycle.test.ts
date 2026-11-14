import { describe, expect, it } from "vitest";
import type { CycleAccept, CycleOverview, CyclePreviewDay, SubjectInfo } from "@shared/data-protocol.js";
import {
  acceptRows,
  defaultMaterial,
  mainOptions,
  materialOptions,
  nextCycleBanner,
  nextCyclePrompt,
  nextStart,
  previewCells,
  toggleMain,
} from "./next-cycle.js";

function overview(date: string, plannedEnd: string, delayDays = 0): CycleOverview {
  return {
    date,
    route: null,
    cycle: {
      cycle: "C1",
      title: "",
      start: "2026-11-06",
      end: plannedEnd,
      plannedEnd,
      delayDays,
      week: 7,
      weeks: 7,
      daysLeft: 0,
      next: { cycle: "C2", start: "2026-12-30" },
      subjects: {},
      auxSubjects: [],
      subjectDays: {},
    },
    courses: [],
  };
}

const ACCEPT: CycleAccept = {
  cycle: "C1",
  start: "2026-11-06",
  end: "2026-12-24",
  courses: [
    {
      slug: "discrete-math-epp",
      title: "离散数学（Epp, 5th ed）",
      subject: "discrete-math",
      goals: [
        { level: "最低", text: "三种证明各一例", done: true },
        { level: "", text: "周核实全过", done: true },
      ],
      lessons: { done: 15, total: 15, remaining: [] },
    },
    {
      slug: "ctm",
      title: "CTM 7 周学习计划",
      subject: "programming-paradigms",
      goals: [{ level: "", text: "概念图", done: false }],
      lessons: { done: 10, total: 14, remaining: ["D11", "D12", "D13", "D14"] },
    },
  ],
  next: { cycle: "C2", start: "2026-12-30", end: "2027-02-16", mains: ["dsa", "c"], status: "未开始" },
};

function subject(slug: string, title: string, materials: SubjectInfo["materials"] = []): SubjectInfo {
  return { slug, title, layer: "", route: "", main: false, courses: [], materials, defaultStyle: null };
}

describe("nextCycleBanner", () => {
  it("shows from six days before the planned end", () => {
    expect(nextCycleBanner(overview("2026-12-17", "2026-12-24"))).toBeNull();
    expect(nextCycleBanner(overview("2026-12-18", "2026-12-24"))?.text).toBe(
      "C1 最后一周 · 整合日做完周期验收后，就可以排 C2",
    );
  });

  it("names the slip and keeps showing past the planned end", () => {
    expect(nextCycleBanner(overview("2026-12-28", "2026-12-24", 9))?.text).toContain("顺延了 9 天");
  });

  it("stays away without a next cycle", () => {
    const value = overview("2026-12-20", "2026-12-24");
    if (value.cycle) value.cycle.next = null;
    expect(nextCycleBanner(value)).toBeNull();
    expect(nextCycleBanner(null)).toBeNull();
  });
});

describe("acceptRows / nextStart", () => {
  it("marks a course met only when every lesson and goal is done", () => {
    const rows = acceptRows(ACCEPT, { "discrete-math-epp": "离散" });
    expect(rows.map((row) => [row.name, row.met])).toEqual([
      ["离散", true],
      ["CTM 7 周学习计划", false],
    ]);
    expect(rows[1]?.lessons).toBe("课次 10 / 14 · 还差 D11–D14");
    expect(rows[0]?.goals[0]?.text).toBe("最低：三种证明各一例");
  });

  it("starts a week later after a recovery week", () => {
    expect(nextStart(ACCEPT, "partial")).toBe("2026-12-30");
    expect(nextStart(ACCEPT, "recover")).toBe("2027-01-06");
  });
});

describe("mains and materials", () => {
  const subjects = [subject("arch", "体系结构"), subject("c", "C 与系统编程"), subject("dsa", "数据结构与算法")];

  it("lists the route's suggestions first", () => {
    expect(mainOptions(subjects, ["dsa", "c"], ["c"]).map((item) => [item.slug, item.suggested, item.guide])).toEqual([
      ["dsa", true, false],
      ["c", true, true],
      ["arch", false, false],
    ]);
  });

  it("allows at most two mains", () => {
    expect(toggleMain(["a", "b"], "c")).toEqual(["a", "b"]);
    expect(toggleMain(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleMain(["a"], "c")).toEqual(["a", "c"]);
  });

  it("pre-picks the 主线 material and drops articles and tools", () => {
    const books = subject("dsa", "数据结构", [
      { type: "书籍", mark: "none", status: "未制定计划", role: "参考", title: "CLRS（`raw/books/clrs.pdf`）", course: null },
      { type: "书籍", mark: "now", status: "学习中", role: "主线", title: "Sedgewick", course: "dsa-guide" },
      { type: "在线书籍", mark: "done", status: "已摄取", role: "主线", title: "Driving Compilers --- 第一章、第二章", course: null },
      { type: "文章", mark: "done", status: "已摄取", role: "参考", title: "maskray", course: null },
      { type: "代码与工具", mark: "none", status: "", role: "练习", title: "visualgo", course: null },
    ]);
    expect(materialOptions(books).map((item) => item.title)).toEqual(["CLRS", "Sedgewick", "Driving Compilers"]);
    expect(defaultMaterial(books)).toBe("Sedgewick");
    expect(defaultMaterial(subject("x", "x"))).toBeNull();
  });
});

describe("previewCells", () => {
  const day = (date: string, weekday: string, type: CyclePreviewDay["type"], extra: Partial<CyclePreviewDay> = {}): CyclePreviewDay => ({
    date,
    weekday,
    type,
    subject: null,
    name: null,
    aux: null,
    auxName: null,
    ...extra,
  });

  it("drops a 导读课 whose subject became a main", () => {
    const cells = previewCells(
      [
        day("2026-12-30", "周三", "深度", { subject: "dsa", name: "数据结构", aux: "c", auxName: "C" }),
        day("2026-12-31", "周四", "深度", { subject: "pl", name: "范式", aux: "arch", auxName: "体系", unchanged: true }),
        day("2027-01-01", "周五", "整合"),
      ],
      ["dsa", "c"],
    );
    expect(cells.map((cell) => [cell.label, cell.main, cell.aux])).toEqual([
      ["三 12-30", "数据结构", null],
      ["四 12-31", "范式（照旧）", "导读 体系"],
      ["五 01-01", "整合", null],
    ]);
  });
});

describe("nextCyclePrompt", () => {
  it("carries every answer and ends with the marker", () => {
    const rows = acceptRows(ACCEPT, { "discrete-math-epp": "离散", ctm: "CTM" });
    const text = nextCyclePrompt({
      accept: ACCEPT,
      rows,
      shortfall: "partial",
      start: "2026-12-30",
      mains: [
        { slug: "dsa", name: "数据结构与算法", material: "Sedgewick", from: "continue" },
        { slug: "c", name: "C 与系统编程", material: null, from: null },
      ],
      shelf: [{ title: "CLRS", subjectTitle: "数据结构与算法" }],
    });
    expect(text).toContain("先开 C2，CTM 剩下的转进书房自读");
    expect(text).toContain("数据结构与算法 用《Sedgewick》，接着导读课的进度往下讲");
    expect(text).toContain("C 与系统编程 的主资料先问我");
    expect(text).toContain("书房加：《CLRS》（数据结构与算法）");
    expect(text).toContain("从 2026-12-30 开始");
    expect(text.endsWith("⟦xuegen:next-cycle⟧")).toBe(true);
  });
});
