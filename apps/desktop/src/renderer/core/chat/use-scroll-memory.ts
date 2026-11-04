/**
 * Transcript scroll memory.
 *
 * Switching a skin replaces the whole presentation tree, so the transcript's
 * scroll container is unmounted and remounted — and a fresh element starts at
 * the top. The reading position is conversation state, not styling, so core
 * remembers it: the container's `scrollTop` survives a skin switch, exactly as
 * the messages do.
 *
 * A single module-level value is enough: there is one transcript per window, and
 * the value is only read when a new container mounts.
 */

import { useLayoutEffect, useRef, type RefObject } from "react";

/** The last known scroll offset, shared across skin mounts. */
let rememberedOffset = 0;

/**
 * Keep a scroll container's offset in sync with the shared memory.
 *
 * On mount the remembered offset is restored (in a layout effect, before paint,
 * so there is no visible jump); on scroll it is written back; on unmount the last
 * offset is captured one final time.
 */
export function useScrollMemory(ref: RefObject<HTMLElement | null>): void {
  const restored = useRef(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!restored.current) {
      element.scrollTop = rememberedOffset;
      restored.current = true;
    }
    const onScroll = (): void => {
      rememberedOffset = element.scrollTop;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      rememberedOffset = element.scrollTop;
      element.removeEventListener("scroll", onScroll);
    };
  }, [ref]);
}

/** Forget the remembered offset (e.g. when the transcript is cleared). */
export function resetScrollMemory(): void {
  rememberedOffset = 0;
}
