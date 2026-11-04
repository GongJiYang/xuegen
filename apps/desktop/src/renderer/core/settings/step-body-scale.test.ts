import { describe, expect, it } from "vitest";
import {
  DEFAULT_BODY_SCALE_STEPS,
  bodyScaleDirection,
  stepBodyScale,
} from "./step-body-scale.js";

const CHICAGO_STEPS = [1, 2] as const;

describe("bodyScaleDirection", () => {
  it("maps the zoom-in keys", () => {
    expect(bodyScaleDirection("+")).toBe("in");
    expect(bodyScaleDirection("=")).toBe("in");
  });

  it("maps the zoom-out keys", () => {
    expect(bodyScaleDirection("-")).toBe("out");
    expect(bodyScaleDirection("_")).toBe("out");
  });

  it("maps zero to reset", () => {
    expect(bodyScaleDirection("0")).toBe("reset");
  });

  it("ignores other keys", () => {
    expect(bodyScaleDirection("1")).toBeNull();
    expect(bodyScaleDirection("k")).toBeNull();
    expect(bodyScaleDirection("")).toBeNull();
  });
});

describe("stepBodyScale", () => {
  it("steps up to the next larger rung and clamps at the top", () => {
    expect(stepBodyScale(1, "in", CHICAGO_STEPS)).toBe(2);
    expect(stepBodyScale(2, "in", CHICAGO_STEPS)).toBe(2);
  });

  it("steps down to the next smaller rung and clamps at the bottom", () => {
    expect(stepBodyScale(2, "out", CHICAGO_STEPS)).toBe(1);
    expect(stepBodyScale(1, "out", CHICAGO_STEPS)).toBe(1);
  });

  it("resets to the rung nearest 1", () => {
    expect(stepBodyScale(2, "reset", CHICAGO_STEPS)).toBe(1);
    expect(stepBodyScale(1.5, "reset", [0.5, 1.5])).toBe(0.5);
  });

  it("treats an off-ladder value by magnitude", () => {
    expect(stepBodyScale(1.4, "in", CHICAGO_STEPS)).toBe(2);
    expect(stepBodyScale(1.6, "out", CHICAGO_STEPS)).toBe(1);
    expect(stepBodyScale(0.9, "in", CHICAGO_STEPS)).toBe(1);
    expect(stepBodyScale(1.1, "out", CHICAGO_STEPS)).toBe(1);
  });

  it("sorts and de-duplicates an unordered ladder", () => {
    expect(stepBodyScale(1, "in", [2, 1, 1])).toBe(2);
    expect(stepBodyScale(2, "out", [2, 1, 1])).toBe(1);
  });

  it("skips non-finite ladder values", () => {
    expect(stepBodyScale(1, "in", [Number.NaN, 1, 2])).toBe(2);
    expect(stepBodyScale(1, "in", [Number.POSITIVE_INFINITY, 2])).toBe(2);
  });

  it("leaves the value untouched for an empty ladder", () => {
    expect(stepBodyScale(1.3, "in", [])).toBe(1.3);
  });

  it("steps through the default 0.75–2 ladder in 0.05 increments", () => {
    expect(stepBodyScale(1, "in", DEFAULT_BODY_SCALE_STEPS)).toBe(1.05);
    expect(stepBodyScale(1, "out", DEFAULT_BODY_SCALE_STEPS)).toBe(0.95);
    expect(stepBodyScale(0.75, "out", DEFAULT_BODY_SCALE_STEPS)).toBe(0.75);
    expect(stepBodyScale(2, "in", DEFAULT_BODY_SCALE_STEPS)).toBe(2);
    expect(stepBodyScale(1.9, "reset", DEFAULT_BODY_SCALE_STEPS)).toBe(1);
  });
});
