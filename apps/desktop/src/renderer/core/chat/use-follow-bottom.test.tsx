/**
 * Follow-bottom behaviour.
 *
 * jsdom does not lay out, so the pane's scroll metrics are faked and the two
 * observers are stubbed into a manual trigger. The test drives the state machine:
 * growing content follows while near the bottom, stops when the user scrolls up,
 * and resumes on `scrollToBottom`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { NEAR_BOTTOM_PX, useFollowBottom } from "./use-follow-bottom.js";

/** A manual ResizeObserver/MutationObserver: the test fires `trigger()`. */
class ManualObserver {
  static instances: ManualObserver[] = [];
  callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    ManualObserver.instances.push(this);
  }
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
  takeRecords(): [] {
    return [];
  }
  trigger(): void {
    this.callback();
  }
}

/** Fire every registered observer callback (content grew). */
function grow(): void {
  for (const observer of ManualObserver.instances) observer.trigger();
}

/** A scrollable element whose metrics the test controls. */
function fakePane(metrics: { scrollHeight: number; clientHeight: number }): {
  element: HTMLElement;
  get(): number;
  grow(by: number): void;
  fireScroll(): void;
} {
  const element = document.createElement("div");
  let top = 0;
  let scrollHeight = metrics.scrollHeight;
  Object.defineProperty(element, "scrollHeight", { get: () => scrollHeight, configurable: true });
  Object.defineProperty(element, "clientHeight", { get: () => metrics.clientHeight, configurable: true });
  Object.defineProperty(element, "scrollTop", {
    get: () => top,
    set: (next: number) => {
      top = next;
    },
    configurable: true,
  });
  return {
    element,
    get: () => top,
    grow: (by) => {
      scrollHeight += by;
    },
    fireScroll: () => element.dispatchEvent(new Event("scroll")),
  };
}

function useFollowOn(element: HTMLElement) {
  const ref = useRef<HTMLElement | null>(element);
  return useFollowBottom(ref);
}

describe("useFollowBottom", () => {
  beforeEach(() => {
    ManualObserver.instances = [];
    vi.stubGlobal("ResizeObserver", ManualObserver);
    vi.stubGlobal("MutationObserver", ManualObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows content growth while at the bottom", () => {
    const pane = fakePane({ scrollHeight: 100, clientHeight: 100 });
    const { result } = renderHook(() => useFollowOn(pane.element));
    expect(result.current.atBottom).toBe(true);

    // The content grows by 200px; following pins scrollTop to the new height.
    pane.grow(200);
    act(() => grow());
    expect(pane.get()).toBe(300);
    expect(result.current.atBottom).toBe(true);
  });

  it("pauses following after the user scrolls up", () => {
    const pane = fakePane({ scrollHeight: 300, clientHeight: 100 });
    const { result } = renderHook(() => useFollowOn(pane.element));

    // The user scrolls up: 300 - 10 - 100 = 190px from the bottom, well past 48.
    pane.element.scrollTop = 10;
    act(() => pane.fireScroll());
    expect(result.current.atBottom).toBe(false);

    // Growth no longer moves the pane.
    pane.grow(100);
    act(() => grow());
    expect(pane.get()).toBe(10);
  });

  it("resumes following from scrollToBottom", () => {
    const pane = fakePane({ scrollHeight: 300, clientHeight: 100 });
    const { result } = renderHook(() => useFollowOn(pane.element));

    pane.element.scrollTop = 0;
    act(() => pane.fireScroll());
    expect(result.current.atBottom).toBe(false);

    act(() => result.current.scrollToBottom());
    expect(result.current.atBottom).toBe(true);
    expect(pane.get()).toBe(300);

    pane.grow(50);
    act(() => grow());
    expect(pane.get()).toBe(350);
  });

  it("treats a small offset (within the threshold) as still following", () => {
    const pane = fakePane({ scrollHeight: 300, clientHeight: 100 });
    const { result } = renderHook(() => useFollowOn(pane.element));

    // 300 - (300 - 100 - 20) - 100 = 20px from the bottom, inside NEAR_BOTTOM_PX.
    pane.element.scrollTop = 300 - 100 - (NEAR_BOTTOM_PX - 20);
    act(() => pane.fireScroll());
    expect(result.current.atBottom).toBe(true);
  });
});
