import { describe, expect, it } from "vitest";
import {
  PIXEL_BODY_SCALES,
  SMOOTH_BODY_SCALES,
  bodyScalePixels,
  bodyScaleStepsForFont,
  coerceBodyScaleForFont,
  defaultBodyScaleForFont,
} from "./body-font.js";

describe("bodyScaleStepsForFont", () => {
  it("keeps the pixel font on whole multiples", () => {
    expect(bodyScaleStepsForFont("pixel")).toBe(PIXEL_BODY_SCALES);
  });

  it("gives every smooth font the 15–24px ladder", () => {
    for (const font of ["hei", "kai", "song"] as const) {
      expect(bodyScaleStepsForFont(font)).toBe(SMOOTH_BODY_SCALES);
    }
  });
});

describe("defaultBodyScaleForFont", () => {
  it("returns 24px for pixel and 18px for smooth fonts", () => {
    expect(defaultBodyScaleForFont("pixel")).toBe(2);
    expect(defaultBodyScaleForFont("hei")).toBe(1.5);
    expect(defaultBodyScaleForFont("kai")).toBe(1.5);
    expect(defaultBodyScaleForFont("song")).toBe(1.5);
  });
});

describe("bodyScalePixels", () => {
  it("maps the ladders to their pixel labels", () => {
    expect([1, 1.25, 1.5, 1.75, 2].map(bodyScalePixels)).toEqual([12, 15, 18, 21, 24]);
  });
});

describe("coerceBodyScaleForFont", () => {
  it("leaves a scale that is already on the ladder", () => {
    expect(coerceBodyScaleForFont(1, "pixel")).toBe(1);
    expect(coerceBodyScaleForFont(2, "pixel")).toBe(2);
    expect(coerceBodyScaleForFont(1.75, "kai")).toBe(1.75);
  });

  it("snaps a smooth scale onto the pixel font's whole multiples", () => {
    expect(coerceBodyScaleForFont(1.25, "pixel")).toBe(1);
    expect(coerceBodyScaleForFont(1.5, "pixel")).toBe(2);
    expect(coerceBodyScaleForFont(1.75, "pixel")).toBe(2);
  });

  it("snaps a pixel scale onto the smooth ladder", () => {
    expect(coerceBodyScaleForFont(1, "hei")).toBe(1.25);
    expect(coerceBodyScaleForFont(1.4, "hei")).toBe(1.5);
    expect(coerceBodyScaleForFont(2, "hei")).toBe(2);
  });

  it("rounds ties up and clamps out-of-range values", () => {
    expect(coerceBodyScaleForFont(1.375, "song")).toBe(1.5);
    expect(coerceBodyScaleForFont(0, "song")).toBe(1.25);
    expect(coerceBodyScaleForFont(9, "song")).toBe(2);
  });

  it("falls back to the font default for non-finite input", () => {
    expect(coerceBodyScaleForFont(Number.NaN, "pixel")).toBe(2);
    expect(coerceBodyScaleForFont(Number.POSITIVE_INFINITY, "kai")).toBe(1.5);
  });
});
