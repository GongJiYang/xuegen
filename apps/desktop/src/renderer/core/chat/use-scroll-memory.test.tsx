/**
 * Scroll memory across skin switches.
 *
 * The transcript pane is remounted when the active skin changes; this module is
 * what keeps the reading position. The test drives two mounts through the same
 * shared memory and asserts the offset is restored.
 */

import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { resetScrollMemory, useScrollMemory } from "./use-scroll-memory.js";

/** A hook that attaches the memory to a fixed element. */
function useMemoryOn(element: HTMLElement) {
  const ref = useRef<HTMLElement | null>(element);
  useScrollMemory(ref);
  return ref;
}

/**
 * A scroll-top property that records writes (jsdom clamps the real one to 0 on
 * a non-scrollable element, so the restore cannot be observed through it).
 */
function fakeScrollTop(initial: number): { element: HTMLElement; get(): number } {
  const element = document.createElement("div");
  let value = initial;
  Object.defineProperty(element, "scrollTop", {
    get: () => value,
    set: (next: number) => {
      value = next;
    },
    configurable: true,
  });
  return { element, get: () => value };
}

describe("useScrollMemory", () => {
  afterEach(() => {
    resetScrollMemory();
  });

  it("restores the offset when the container remounts", () => {
    const first = fakeScrollTop(0);
    const { unmount } = renderHook(() => useMemoryOn(first.element));
    // The user scrolls: set the offset, then fire the scroll event so the
    // listener captures it.
    first.element.scrollTop = 120;
    first.element.dispatchEvent(new Event("scroll"));
    unmount();

    const second = fakeScrollTop(0);
    renderHook(() => useMemoryOn(second.element));
    expect(second.get()).toBe(120);
  });

  it("resetScrollMemory forgets the stored offset", () => {
    const first = fakeScrollTop(0);
    const { unmount } = renderHook(() => useMemoryOn(first.element));
    first.element.scrollTop = 88;
    first.element.dispatchEvent(new Event("scroll"));
    unmount();
    resetScrollMemory();

    const second = fakeScrollTop(0);
    renderHook(() => useMemoryOn(second.element));
    expect(second.get()).toBe(0);
  });

  it("writes the offset back on scroll", () => {
    const element = fakeScrollTop(0);
    renderHook(() => useMemoryOn(element.element));
    element.element.scrollTop = 42;
    element.element.dispatchEvent(new Event("scroll"));
    // A fresh mount restores the written value.
    const next = fakeScrollTop(0);
    renderHook(() => useMemoryOn(next.element));
    expect(next.get()).toBe(42);
  });
});
