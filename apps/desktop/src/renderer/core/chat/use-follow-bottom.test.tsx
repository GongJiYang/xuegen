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
import { useRef, type RefObject } from "react";
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
  resize(next: { scrollHeight?: number; clientHeight?: number }): void;
  fireScroll(): void;
} {
  const element = document.createElement("div");
  let top = 0;
  // Mutable metrics: a shorter session replaces both sizes at once.
  const size = { scrollHeight: metrics.scrollHeight, clientHeight: metrics.clientHeight };
  Object.defineProperty(element, "scrollHeight", { get: () => size.scrollHeight, configurable: true });
  Object.defineProperty(element, "clientHeight", { get: () => size.clientHeight, configurable: true });
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
      size.scrollHeight += by;
    },
    resize: (next) => {
      size.scrollHeight = next.scrollHeight ?? size.scrollHeight;
      size.clientHeight = next.clientHeight ?? size.clientHeight;
    },
    fireScroll: () => element.dispatchEvent(new Event("scroll")),
  };
}

function useFollowOn(element: HTMLElement) {
  const ref = useRef<HTMLElement | null>(element);
  return useFollowBottom(ref);
}

/** Give an element a viewport position, which jsdom does not compute. */
function place(element: HTMLElement, top: number): void {
  element.getBoundingClientRect = () =>
    ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
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

  it("pins a new answer's opening line to the top, then stops following", () => {
    const pane = fakePane({ scrollHeight: 1000, clientHeight: 300 });
    place(pane.element, 100);
    const anchor = document.createElement("div");
    place(anchor, 400);
    const anchorRef: RefObject<HTMLElement | null> = { current: anchor };

    const { result } = renderHook(() =>
      useFollowBottom(useRef<HTMLElement | null>(pane.element), {
        answer: { key: "a1", elementRef: anchorRef },
        answerStreaming: true,
      }),
    );

    // 400 - 100 = 300: the answer's start is now at the viewport top.
    expect(pane.get()).toBe(300);
    expect(result.current.atBottom).toBe(false);

    // Subsequent growth does not chase the bottom.
    pane.grow(400);
    act(() => grow());
    expect(pane.get()).toBe(300);
  });

  it("resumes bottom-following after scrollToBottom", () => {
    const pane = fakePane({ scrollHeight: 1000, clientHeight: 300 });
    place(pane.element, 100);
    const anchor = document.createElement("div");
    place(anchor, 400);
    const anchorRef: RefObject<HTMLElement | null> = { current: anchor };

    const { result } = renderHook(() =>
      useFollowBottom(useRef<HTMLElement | null>(pane.element), {
        answer: { key: "a1", elementRef: anchorRef },
        answerStreaming: true,
      }),
    );

    act(() => result.current.scrollToBottom());
    expect(result.current.atBottom).toBe(true);
    expect(pane.get()).toBe(1000);

    pane.grow(100);
    act(() => grow());
    expect(pane.get()).toBe(1100);
  });

  it("does not yank a reader who already scrolled up", () => {
    const pane = fakePane({ scrollHeight: 300, clientHeight: 100 });
    place(pane.element, 0);
    const anchor = document.createElement("div");
    place(anchor, 120);
    const anchorRef: RefObject<HTMLElement | null> = { current: anchor };

    const { result, rerender } = renderHook(
      ({ streaming, key }: { streaming: boolean; key: string | null }) =>
        useFollowBottom(useRef<HTMLElement | null>(pane.element), {
          answer: key ? { key, elementRef: anchorRef } : null,
          answerStreaming: streaming,
        }),
      { initialProps: { streaming: false, key: null } as { streaming: boolean; key: string | null } },
    );

    pane.element.scrollTop = 10;
    act(() => pane.fireScroll());
    expect(result.current.atBottom).toBe(false);

    rerender({ streaming: true, key: "a1" });
    expect(pane.get()).toBe(10);
  });

  it("treats a small offset (within the threshold) as still following", () => {
    const pane = fakePane({ scrollHeight: 300, clientHeight: 100 });
    const { result } = renderHook(() => useFollowOn(pane.element));

    // 300 - (300 - 100 - 20) - 100 = 20px from the bottom, inside NEAR_BOTTOM_PX.
    pane.element.scrollTop = 300 - 100 - (NEAR_BOTTOM_PX - 20);
    act(() => pane.fireScroll());
    expect(result.current.atBottom).toBe(true);
  });

  it("notices when new content fits the pane again (a shorter session)", () => {
    const pane = fakePane({ scrollHeight: 300, clientHeight: 100 });
    const { result } = renderHook(() => useFollowOn(pane.element));

    // A long transcript the reader scrolled up through: 200px below the fold.
    pane.element.scrollTop = 0;
    act(() => pane.fireScroll());
    expect(result.current.atBottom).toBe(false);

    // Switching to a session that fits: the offset stays, the content shrinks
    // to the viewport, so the bottom is in view. No scroll event fires for this,
    // only the observers do.
    pane.resize({ scrollHeight: 400, clientHeight: 500 });
    act(() => grow());
    expect(result.current.atBottom).toBe(true);
  });
});
