import { describe, expect, it } from "vitest";
import { dayMarks, monthGrid, shiftMonth } from "./use-calendar.js";

describe("shiftMonth", () => {
  it("moves forward and backward across a year boundary", () => {
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", -1)).toBe("2026-10");
  });
});

describe("monthGrid", () => {
  it("starts every week on Monday", () => {
    // 2026-11-01 is a Sunday, so the first row pads six leading days.
    const cells = monthGrid("2026-11");
    expect(cells).toHaveLength(42);
    expect(cells[0]?.out).toBe(true);
    expect(cells[0]?.date).toBe("2026-10-26");
    const firstInMonth = cells.find((cell) => !cell.out);
    expect(firstInMonth?.date).toBe("2026-11-01");
    expect(cells.length % 7).toBe(0);
  });

  it("keeps the month's own days contiguous and non-out", () => {
    const cells = monthGrid("2026-11");
    const inMonth = cells.filter((cell) => !cell.out);
    expect(inMonth).toHaveLength(30);
    expect(inMonth[0]?.day).toBe(1);
    expect(inMonth[29]?.day).toBe(30);
  });
});

describe("dayMarks", () => {
  it("orders the marks ● ◆ ▲, excluding the top-right ✎", () => {
    expect(
      dayMarks({
        records: [{ course: "a", heading: "x" }],
        plans: [{ course: "a", label: "y" }],
        readingDue: [{ slug: "s", title: "t" }],
        log: [],
        note: "笔记",
      }),
    ).toBe("●◆▲");
    expect(
      dayMarks({ records: [], plans: [], readingDue: [], log: [], note: null }),
    ).toBe("");
  });
});
