/**
 * useDark follows the system appearance live: the test stubs matchMedia with a
 * query list whose `matches` and `change` listeners it controls by hand (jsdom's
 * stub never fires).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDark } from "./use-dark.js";

/** Stub matchMedia; `set(dark)` flips `matches` and fires the change listeners. */
function fakeMatchMedia(initial: boolean): { set(dark: boolean): void } {
  let matches = initial;
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return {
    set(dark: boolean): void {
      matches = dark;
      for (const listener of listeners) listener();
    },
  };
}

const original = window.matchMedia;

afterEach(() => {
  window.matchMedia = original;
});

describe("useDark", () => {
  it("reports true when the system appearance is dark", () => {
    fakeMatchMedia(true);
    const { result } = renderHook(() => useDark());
    expect(result.current).toBe(true);
  });

  it("reports false when the system appearance is light", () => {
    fakeMatchMedia(false);
    const { result } = renderHook(() => useDark());
    expect(result.current).toBe(false);
  });

  it("updates when the system appearance changes", () => {
    const media = fakeMatchMedia(false);
    const { result } = renderHook(() => useDark());
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);

    act(() => media.set(false));
    expect(result.current).toBe(false);
  });
});
