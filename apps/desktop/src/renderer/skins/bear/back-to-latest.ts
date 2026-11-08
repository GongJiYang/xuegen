/**
 * The 「回到最新」 handoff between the Thread and the Composer slots.
 *
 * The design hangs the button on the composer's top edge (`?d=bearv3`), so it
 * never covers the transcript. Whether it shows is decided inside the Thread
 * (core's `useFollowBottom` owns the scroll container), and the button has to be
 * drawn by the Composer — both slots live in this skin, so the Thread publishes
 * the two values here and the Composer subscribes. The skin contract stays
 * untouched, and no other skin sees this module.
 *
 * A module-level value is enough for the same reason core's scroll memory is: one
 * transcript per window. `useSyncExternalStore` needs a stable reference for an
 * unchanged state, so the snapshot object is replaced only by an actual publish.
 */

import { useSyncExternalStore } from "react";

/** What the composer needs to draw the button. */
export interface BackToLatest {
  /** True when the transcript sits at its bottom, so nothing is hidden below. */
  atBottom: boolean;
  /** Jump to the bottom and resume following. */
  scrollToBottom(): void;
}

/** The live value; null before the Thread mounts (or after it unmounts). */
let snapshot: BackToLatest | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BackToLatest | null {
  return snapshot;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Publish the Thread's scroll state for the Composer; returns the value to keep for clearing. */
export function publishBackToLatest(atBottom: boolean, scrollToBottom: () => void): BackToLatest {
  if (snapshot !== null && snapshot.atBottom === atBottom && snapshot.scrollToBottom === scrollToBottom) {
    return snapshot;
  }
  const next = { atBottom, scrollToBottom };
  snapshot = next;
  notify();
  return next;
}

/**
 * Forget a published value, but only while it is still the current one.
 *
 * Guarded by identity so a second transcript mounting later is not silenced by
 * the first one unmounting.
 */
export function clearBackToLatest(published: BackToLatest): void {
  if (snapshot !== published) return;
  snapshot = null;
  notify();
}

/** Subscribe to the Thread's scroll state (null while there is no transcript). */
export function useBackToLatest(): BackToLatest | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
