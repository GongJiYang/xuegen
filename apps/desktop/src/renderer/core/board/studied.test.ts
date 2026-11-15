// 「今天学过」行：只留主课、三种 label、同一分钟只写一次、没有当天周期数据时为 []。
import { describe, expect, it } from "vitest";
import type { CycleDay, StudiedSpan } from "@shared/data-protocol.js";
import { studiedEntries } from "./studied.js";

function at(h: number, min = 0): number {
  return new Date(2026, 10, 15, h, min).getTime();
}

function span(over: Partial<StudiedSpan>): StudiedSpan {
  return { slug: "epp", action: "lesson", pin: "离散 D3", from: at(9), to: at(10), ...over };
}

const DAY: CycleDay = {
  date: "2026-11-15",
  weekday: "周日",
  cycle: "C1",
  week: 2,
  type: "深度",
  subject: "discrete-math",
  course: "epp",
  aux: "pl",
  auxCourse: "pl-course",
  auxBook: null,
  names: { epp: "离散", "pl-course": "范式导读", ctm: "CTM" },
  subjects: {},
  roles: { epp: "main", "pl-course": "aux", ctm: "main" },
  lessons: [],
  overdue: [],
};

describe("studiedEntries", () => {
  it("returns [] without a cycle day", () => {
    expect(studiedEntries([span({})], null)).toEqual([]);
  });

  it("keeps only the day's main courses; a 导读课 (aux) drops out", () => {
    const entries = studiedEntries([span({ slug: "pl-course" }), span({ slug: "epp" })], DAY);
    expect(entries.map((entry) => entry.slug)).toEqual(["epp"]);
  });

  it("labels a lesson by its pin, a verify as 「短名 周核实」, the rest by short name", () => {
    const entries = studiedEntries(
      [
        span({ slug: "epp", action: "lesson", pin: "离散 D3" }),
        span({ slug: "ctm", action: "verify", pin: null }),
        // A course the day does not name falls back to its slug.
        span({ slug: "algo", action: "other", pin: null }),
      ],
      { ...DAY, roles: { ...DAY.roles, algo: "main" } },
    );
    expect(entries.map((entry) => entry.label)).toEqual(["离散 D3", "CTM 周核实", "algo"]);
  });

  it("writes the span as HH:MM–HH:MM, collapsing to one time within the same minute", () => {
    const [entry] = studiedEntries([span({ from: at(8, 10), to: at(9, 40) })], DAY);
    expect(entry?.time).toBe("08:10–09:40");
    const [same] = studiedEntries([span({ from: at(8, 10), to: at(8, 10) + 30_000 })], DAY);
    expect(same?.time).toBe("08:10");
  });
});
