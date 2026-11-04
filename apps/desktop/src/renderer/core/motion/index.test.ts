import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { prefersReducedMotion, useMotion, type MotionPreset } from "./index.js";

/** Stub matchMedia to report the reduced-motion preference. */
function setReducedMotion(reduced: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const original = window.matchMedia;

afterEach(() => {
  window.matchMedia = original;
});

describe("prefersReducedMotion", () => {
  it("reflects the media query", () => {
    setReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    setReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("useMotion", () => {
  it("runs the preset when reduced motion is off", () => {
    setReducedMotion(false);
    const run = vi.fn(() => null);
    const preset: MotionPreset = { run };
    const element = document.createElement("div");
    renderHook(() => {
      const ref = useRef<Element | null>(element);
      useMotion(preset, "appear", ref);
      return ref;
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("appear", element, undefined);
  });

  it("does not run the preset when reduced motion is on", () => {
    setReducedMotion(true);
    const run = vi.fn(() => null);
    const element = document.createElement("div");
    renderHook(() => {
      const ref = useRef<Element | null>(element);
      useMotion({ run }, "appear", ref);
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("cancels the handle on unmount", () => {
    setReducedMotion(false);
    const cancel = vi.fn();
    const element = document.createElement("div");
    const { unmount } = renderHook(() => {
      const ref = useRef<Element | null>(element);
      useMotion({ run: () => ({ cancel }) }, "appear", ref);
    });
    unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
