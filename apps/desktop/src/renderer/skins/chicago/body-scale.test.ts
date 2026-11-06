import { describe, expect, it } from "vitest";
import { CHICAGO_SCALES, chicagoBodyScaleSteps } from "./body-scale.js";

describe("chicagoBodyScaleSteps", () => {
  it("keeps the pixel font on whole multiples", () => {
    expect(chicagoBodyScaleSteps("pixel")).toEqual([1, 2]);
    expect(CHICAGO_SCALES).toEqual([1, 2]);
  });

  it("offers the four smooth sizes for every non-pixel font", () => {
    for (const font of ["hei", "kai", "song"] as const) {
      expect(chicagoBodyScaleSteps(font)).toEqual([1.25, 1.5, 1.75, 2]);
    }
  });
});
