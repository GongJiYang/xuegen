/**
 * Motion: intent and preset, kept apart.
 *
 * core only declares *what happened* (`MotionIntent`); a skin decides *how it
 * moves* (`MotionPreset`). Components call `useMotion(intent, ref, deps)` and
 * never import an animation library or write CSS keyframes. Reduced-motion is
 * decided once, here: when it is on, core does not call the preset at all and
 * the element is left in its final state.
 */

import { useEffect, useRef, type RefObject } from "react";

/** What happened. core emits these; skins translate them into motion. */
export type MotionIntent =
  | "appear" // a new element appears (message, window, dialog)
  | "confirm" // an action is acknowledged (button press, menu selection)
  | "busy" // work in progress (thinking, tool running)
  | "expand"
  | "collapse"
  | "progress" // a value changes (progress, counter)
  | "alert"; // an error

/** Extra, intent-specific data a preset may use (never required). */
export interface MotionDetail {
  /** Numeric value for a `progress` intent (e.g. 0–100). */
  value?: number;
  /** Prior value for a `progress` intent, when a preset wants to tween from it. */
  from?: number;
}

/** A running animation, cancellable by the caller or on unmount. */
export interface MotionHandle {
  cancel(): void;
}

/** How a skin animates an intent. A no-op preset is valid (returns null). */
export interface MotionPreset {
  run(intent: MotionIntent, target: Element, detail?: MotionDetail): MotionHandle | null;
}

/** The media query `prefers-reduced-motion` uses. Single source of truth. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the user has asked for reduced motion (false when unsupported). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * A preset that never animates. Skins fall back to this when they have nothing
 * to say about an intent, and the reduced-motion path uses it implicitly.
 */
export const NOOP_MOTION_PRESET: MotionPreset = {
  run: () => null,
};

/**
 * Run a preset for an intent against a ref's element.
 *
 * @param preset the active skin's preset; when null, nothing runs.
 * @param intent what just happened.
 * @param ref the element to animate.
 * @param deps the preset re-runs when these change (like any effect deps).
 */
export function useMotion(
  preset: MotionPreset | null,
  intent: MotionIntent,
  ref: RefObject<Element | null>,
  deps: readonly unknown[] = [],
  detail?: MotionDetail,
): void {
  // Keep the latest preset/detail in refs so a skin's preset (which may be a new
  // object every render) never becomes a trigger to re-run the animation. The
  // refs are written in effects, never during render.
  const presetRef = useRef(preset);
  const detailRef = useRef(detail);

  useEffect(() => {
    presetRef.current = preset;
    detailRef.current = detail;
  });

  useEffect(() => {
    const active = presetRef.current;
    const target = ref.current;
    if (!active || !target) return;
    // Reduced motion: leave the element in its final state; run nothing.
    if (prefersReducedMotion()) return;

    const handle = active.run(intent, target, detailRef.current);
    return () => handle?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, ref, ...deps]);
}
