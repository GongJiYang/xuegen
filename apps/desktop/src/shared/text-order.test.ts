import { describe, expect, it } from "vitest";
import { compareText } from "./text-order.js";

describe("compareText", () => {
  it("sorts Chinese by pinyin whatever the machine's language", () => {
    expect(["乙", "甲", "丙"].sort(compareText)).toEqual(["丙", "甲", "乙"]);
  });

  it("keeps ISO dates and ASCII slugs in their natural order", () => {
    expect(["2026-11-17", "2026-11-09", "2026-11-10"].sort(compareText)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-17",
    ]);
    expect(["ctm", "c-language", "algorithms"].sort(compareText)).toEqual(["algorithms", "c-language", "ctm"]);
  });
});
