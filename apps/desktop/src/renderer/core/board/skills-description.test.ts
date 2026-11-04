import { describe, expect, it } from "vitest";
import { firstSentence, hasMoreThanFirstSentence, DESCRIPTION_LINE_BUDGET } from "./skills-description.js";

describe("firstSentence", () => {
  it("keeps only the text before the first ；or 。", () => {
    expect(firstSentence("按课程计划讲解、出检验题；遵守风格。")).toBe("按课程计划讲解、出检验题");
    expect(firstSentence("第一句。第二句。")).toBe("第一句");
  });

  it("returns the whole text when there is no separator", () => {
    expect(firstSentence("短说明")).toBe("短说明");
  });

  it("clips an over-long sentence to the line budget", () => {
    const long = "甲".repeat(DESCRIPTION_LINE_BUDGET + 20);
    const out = firstSentence(long);
    expect(out.length).toBe(DESCRIPTION_LINE_BUDGET + 1);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("hasMoreThanFirstSentence", () => {
  it("is true only when there is more to reveal", () => {
    expect(hasMoreThanFirstSentence("第一句；第二句")).toBe(true);
    expect(hasMoreThanFirstSentence("（可展开）说明")).toBe(false);
  });
});
