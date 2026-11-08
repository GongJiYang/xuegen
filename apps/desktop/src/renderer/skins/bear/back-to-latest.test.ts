/**
 * The 「回到最新」 handoff between Thread and Composer.
 *
 * The store is module-level (one transcript per window), so each case publishes
 * what it needs and clears it again; the live value is read through the hook.
 * Publishes go through `act` because they drive a React re-render.
 */

import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { clearBackToLatest, publishBackToLatest, useBackToLatest } from "./back-to-latest.js";
import type { BackToLatest } from "./back-to-latest.js";

const jump = (): void => undefined;

/** Publish inside `act` and keep the handle the Thread would use for clearing. */
function publish(atBottom: boolean): BackToLatest {
  let published: BackToLatest | null = null;
  act(() => {
    published = publishBackToLatest(atBottom, jump);
  });
  if (published === null) throw new Error("publish must return the value it stored");
  return published;
}

/** Clear inside `act`, so subscribers see the update. */
function clear(published: BackToLatest): void {
  act(() => {
    clearBackToLatest(published);
  });
}

describe("back-to-latest store", () => {
  it("starts empty, then reports the published state", () => {
    const { result } = renderHook(() => useBackToLatest());
    expect(result.current).toBeNull();
    const published = publish(false);
    expect(result.current).toEqual({ atBottom: false, scrollToBottom: jump });
    clear(published);
    expect(result.current).toBeNull();
  });

  it("keeps one object while the values do not change", () => {
    const first = publish(true);
    let same: BackToLatest | null = null;
    act(() => {
      same = publishBackToLatest(true, jump);
    });
    expect(same).toBe(first);
    clear(first);
  });

  it("reports a flip of the scroll state", () => {
    const { result } = renderHook(() => useBackToLatest());
    const first = publish(true);
    expect(result.current?.atBottom).toBe(true);
    clear(first);
    const second = publish(false);
    expect(result.current?.atBottom).toBe(false);
    clear(second);
  });

  it("clears only its own published value", () => {
    const { result } = renderHook(() => useBackToLatest());
    const first = publish(true);
    const second = publish(false);
    // A late unmount of an older transcript must not silence the current one.
    clear(first);
    expect(result.current).toBe(second);
    clear(second);
    expect(result.current).toBeNull();
  });
});
