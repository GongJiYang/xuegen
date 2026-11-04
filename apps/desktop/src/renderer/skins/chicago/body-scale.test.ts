import { describe, expect, it } from "vitest";
import { coerceBodyScale, isBigScale } from "./body-scale.js";

describe("coerceBodyScale", () => {
  it("rounds a value to the nearest whole multiple", () => {
    expect(coerceBodyScale(1)).toBe(1);
    expect(coerceBodyScale(2)).toBe(2);
    expect(coerceBodyScale(0.9)).toBe(1);
    expect(coerceBodyScale(0.75)).toBe(1);
    expect(coerceBodyScale(1.4)).toBe(1);
    expect(coerceBodyScale(1.6)).toBe(2);
  });

  it("rounds a tie up to the enlarged scale", () => {
    expect(coerceBodyScale(1.5)).toBe(2);
  });

  it("clamps out-of-range values to the two scales it can render", () => {
    expect(coerceBodyScale(0)).toBe(1);
    expect(coerceBodyScale(-3)).toBe(1);
    expect(coerceBodyScale(9)).toBe(2);
  });

  it("falls back to 1 for non-finite input", () => {
    expect(coerceBodyScale(Number.NaN)).toBe(1);
    expect(coerceBodyScale(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("isBigScale", () => {
  it("is true only once the coerced scale is 2", () => {
    for (const value of [0.9, 1, 1.4, 1.5, 2, 5]) {
      expect(isBigScale(value)).toBe(coerceBodyScale(value) === 2);
    }
  });
});
