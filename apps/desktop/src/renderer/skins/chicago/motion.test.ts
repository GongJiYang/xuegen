/**
 * Chicago motion preset.
 *
 * core guarantees reduced motion never reaches a preset, so every intent must
 * return a usable handle against a real element — including in jsdom, which has
 * no Web Animations API. These tests pin that contract and the per-intent
 * behaviour (zoom rectangles append to the body, confirm is a no-op off-screen).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chicagoMotion } from "./motion.js";

/** jsdom has no `Element.animate`; give it a stub that returns a cancellable. */
function stubAnimate(): void {
  Element.prototype.animate = vi.fn(() => ({ cancel: vi.fn() })) as unknown as Element["animate"];
}

describe("chicagoMotion", () => {
  beforeEach(() => {
    if (typeof Element.prototype.animate !== "function") stubAnimate();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("returns a cancellable handle for every intent", () => {
    const element = document.createElement("div");
    document.body.append(element);
    for (const intent of ["appear", "confirm", "busy", "expand", "collapse", "alert"] as const) {
      const handle = chicagoMotion.run(intent, element);
      expect(handle).not.toBeNull();
      expect(() => handle?.cancel()).not.toThrow();
    }
  });

  it("draws zoom rectangles from an origin for an appear with one", () => {
    vi.useFakeTimers();
    const origin = document.createElement("button");
    origin.id = "origin";
    const target = document.createElement("div");
    target.setAttribute("data-appear-origin", "#origin");
    document.body.append(origin, target);

    const handle = chicagoMotion.run("appear", target);
    vi.advanceTimersByTime(200);
    // The dashed rects are appended and then removed once the sequence ends.
    expect(document.querySelectorAll(".chicago-zoomrect").length).toBe(0);
    expect(target.hasAttribute("data-appear-hidden")).toBe(false);
    handle?.cancel();
    vi.useRealTimers();
  });

  it("runs a stepped print reveal for a print-marked appear", () => {
    const element = document.createElement("div");
    element.setAttribute("data-motion-intent", "print");
    document.body.append(element);
    const handle = chicagoMotion.run("appear", element);
    expect(handle).not.toBeNull();
    handle?.cancel();
  });

  it("ignores progress (no animation for it)", () => {
    const element = document.createElement("div");
    expect(chicagoMotion.run("progress", element)).toBeNull();
  });
});
