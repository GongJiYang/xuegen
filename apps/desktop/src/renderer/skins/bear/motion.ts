/**
 * Bear motion preset.
 *
 * The skin's answer to core's `MotionIntent`s — micro-interactions only
 * (bear.md §5): a short opacity fade for `appear`, a colour flash to `--accent`
 * for `confirm`, a gentle breathing loop for `busy`, a width tween for
 * `progress`, and a single opacity dip for `alert`. `expand`/`collapse` are left
 * to the Animate UI primitives (accordion/dialog springs), so the preset
 * returns null for them.
 *
 * Implemented with `motion`'s `animate()`; every intent returns a `MotionHandle`
 * whose `cancel` stops the animation. core decides reduced motion and never
 * calls `run` when it is on. In runtimes without animation support (jsdom)
 * `animate` still resolves, so the handle is always usable.
 */

import { animate } from "motion";
import type { MotionDetail, MotionHandle, MotionIntent, MotionPreset } from "../../core/motion/index.js";

/** The one accent colour (bear.md §2), read for the `confirm` flash. */
const ACCENT = "#1aa3ff";

/** Wrap playback controls in the contract's cancellable handle. */
function handleOf(controls: { cancel(): void } | null): MotionHandle {
  return { cancel: () => controls?.cancel() };
}

/** Run one `animate()` call, tolerating a runtime that cannot animate. */
function run(intent: MotionIntent, target: Element, detail?: MotionDetail): MotionHandle | null {
  switch (intent) {
    case "appear":
      return handleOf(animate(target, { opacity: [0, 1] }, { duration: 0.12, ease: "easeOut" }));
    case "confirm": {
      const original = target.ownerDocument.defaultView?.getComputedStyle(target).color ?? "inherit";
      return handleOf(animate(target, { color: [ACCENT, original] }, { duration: 0.2, ease: "easeOut" }));
    }
    case "busy":
      return handleOf(
        animate(target, { opacity: [1, 0.55] }, { duration: 0.9, repeat: Infinity, repeatType: "reverse" }),
      );
    case "progress": {
      const value = detail?.value;
      if (typeof value !== "number") return null;
      const from = typeof detail?.from === "number" ? detail.from : value;
      return handleOf(
        animate(target, { width: [`${from}%`, `${value}%`] }, { duration: 0.24, ease: "easeOut" }),
      );
    }
    case "alert":
      return handleOf(animate(target, { opacity: [1, 0.35, 1] }, { duration: 0.15, ease: "easeOut" }));
    case "expand":
    case "collapse":
      // The Animate UI accordion/dialog own these springs.
      return null;
    default:
      return null;
  }
}

/** The Bear motion preset. */
export const bearMotion: MotionPreset = { run };
