/**
 * Chicago motion preset.
 *
 * The skin's answer to core's `MotionIntent`s. Every animation is a stepped or
 * instantaneous change — a 1-bit screen has no half-tones, so no fades, no
 * smooth easing. core decides reduced motion and never calls `run` when it is
 * on, so this module assumes it may animate.
 *
 * Built on the platform's Web Animations API (`Element.animate`) with a `steps`
 * easing, which keeps the timings exact and adds no dependency. Each intent
 * returns a `MotionHandle` whose `cancel` tears down its animation, so an
 * interrupted appearance leaves nothing running.
 */

import type { MotionDetail, MotionHandle, MotionIntent, MotionPreset } from "../../core/motion/index.js";
import {
  MENU_FLASH_CYCLES,
  MENU_FLASH_HALF_MS,
  MENUBAR_ALERT_MS,
  PRINT_MAX_STEPS,
  PRINT_LINE_PX,
  PRINT_STEP_MS,
  TRIANGLE_STEP_MS,
  ZOOM_RECT_STEP_MS,
  ZOOM_RECT_STEPS,
} from "./motion-constants.js";

/** A stepped CSS keyframe track (instant jumps, never a tween). */
function stepsEase(steps: number): string {
  return `steps(${Math.max(1, steps)}, jump-none)`;
}

/**
 * Run a Web Animations keyframe track, tolerating a runtime without it.
 *
 * `Element.animate` is absent in jsdom (the contract test's environment) and in
 * a few embedded runtimes; when it is missing the element is simply left in its
 * final state — the same result reduced motion produces, and never an error.
 */
function animate(
  target: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (typeof target.animate !== "function") return null;
  return target.animate(keyframes, options);
}

/** A handle that cancels an animation when it exists, and is a no-op otherwise. */
function handleOf(animation: Animation | null): MotionHandle {
  return { cancel: () => animation?.cancel() };
}

/** An element's attribute that opts it into the zoom-rectangle origin. */
export const APPEAR_ORIGIN_ATTRIBUTE = "data-appear-origin";

/** An element's attribute naming the intent it wants on the next appear. */
export const INTENT_ATTRIBUTE = "data-motion-intent";

/**
 * A synthetic gesture element to zoom from, or null for the window's own origin.
 *
 * `appear` on a window/dialog draws its expansion from the widget that spawned
 * it (the design zooms from the send button or the clock). We read that element
 * from the target's `data-appear-origin` selector so the component stays a plain
 * element with an attribute, not a callback.
 */
function originOf(target: Element): Element | null {
  const selector = target.getAttribute(APPEAR_ORIGIN_ATTRIBUTE);
  if (!selector) return null;
  try {
    return target.ownerDocument.querySelector(selector);
  } catch {
    return null;
  }
}

/** One dashed rectangle of the zoom-rectangle animation, appended to `<body>`. */
function zoomRectangle(document: Document, rect: DOMRect, color: string): HTMLElement {
  const node = document.createElement("div");
  node.className = "chicago-zoomrect";
  node.style.left = `${rect.left}px`;
  node.style.top = `${rect.top}px`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
  node.style.borderColor = color;
  return node;
}

/**
 * The zoom-rectangle appearance: 6 dashed rects interpolated from the origin to
 * the target, one per step, then the target is revealed. The target is hidden
 * until the last step. Returns a handle that cancels the sequence and restores
 * the target's visibility.
 */
function runZoomAppear(target: Element, detail: MotionDetail | undefined): MotionHandle {
  const document = target.ownerDocument;
  const stepped = detail?.value === 0; // value 0 opts out of the zoom (plain appear)
  const origin = stepped ? null : originOf(target);
  const reduced = !origin;
  const started = target.getBoundingClientRect();
  target.setAttribute("data-appear-hidden", "");

  const timers: number[] = [];
  const rects: HTMLElement[] = [];
  let cancelled = false;

  const finish = (): void => {
    target.removeAttribute("data-appear-hidden");
  };

  if (reduced) {
    // No usable origin (e.g. a content block): reveal immediately.
    finish();
    return { cancel: () => finish() };
  }

  const start = origin.getBoundingClientRect();
  const color = document.defaultView?.getComputedStyle(target).color ?? "currentColor";
  for (let step = 1; step <= ZOOM_RECT_STEPS; step += 1) {
    const ratio = step / ZOOM_RECT_STEPS;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const rect = new DOMRect(
        start.left + (started.left - start.left) * ratio,
        start.top + (started.top - start.top) * ratio,
        start.width + (started.width - start.width) * ratio,
        start.height + (started.height - start.height) * ratio,
      );
      const node = zoomRectangle(document, rect, color);
      rects.push(node);
      document.body.append(node);
      if (step === ZOOM_RECT_STEPS) {
        finish();
        for (const drawn of rects) drawn.remove();
      }
    }, step * ZOOM_RECT_STEP_MS);
    timers.push(timer);
  }

  return {
    cancel(): void {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
      for (const node of rects) node.remove();
      finish();
    },
  };
}

/**
 * The "print" reveal: a message block is unmasked top-to-bottom one pixel row at
 * a time, like a line printer. Stepped clip-path, capped at `PRINT_MAX_STEPS` so
 * a tall block does not drag.
 */
function runPrintAppear(target: Element): MotionHandle {
  const height = target.getBoundingClientRect().height;
  const steps = Math.min(PRINT_MAX_STEPS, Math.max(1, Math.ceil(height / PRINT_LINE_PX)));
  const animation = animate(
    target,
    [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)" }],
    { duration: steps * PRINT_STEP_MS, easing: stepsEase(steps), fill: "none" },
  );
  return handleOf(animation);
}

/** A confirmation flash on a menu item: `cycles` inversions, then restore. */
function runMenuFlash(target: Element): MotionHandle {
  const animation = animate(
    target,
    [
      { backgroundColor: "transparent", color: "inherit" },
      { backgroundColor: "var(--ink)", color: "var(--paper)" },
    ],
    {
      duration: MENU_FLASH_HALF_MS * 2,
      iterations: MENU_FLASH_CYCLES,
      easing: stepsEase(2),
      fill: "none",
    },
  );
  return handleOf(animation);
}

/** The barber-pole stripe travel: the background position steps one tile. */
function runBusy(target: Element): MotionHandle {
  const animation = animate(
    target,
    [{ backgroundPosition: "0 0" }, { backgroundPosition: "16px 0" }],
    { duration: 960, iterations: Infinity, easing: stepsEase(8) },
  );
  return handleOf(animation);
}

/** The two-step disclosure-triangle rotation. */
function runTriangle(target: Element, direction: "expand" | "collapse"): MotionHandle {
  const from = direction === "expand" ? "0deg" : "90deg";
  const to = direction === "expand" ? "90deg" : "0deg";
  const animation = animate(target, [{ rotate: from }, { rotate: to }], {
    duration: TRIANGLE_STEP_MS * 2,
    easing: stepsEase(2),
    fill: "forwards",
  });
  return handleOf(animation);
}

/** A menu-bar alert: the bar inverts and restores once (System 6 visual beep). */
function runMenubarAlert(target: Element): MotionHandle {
  const animation = animate(
    target,
    [
      { backgroundColor: "var(--paper)" },
      { backgroundColor: "var(--ink)" },
      { backgroundColor: "var(--paper)" },
    ],
    { duration: MENUBAR_ALERT_MS * 2, easing: stepsEase(2), fill: "none" },
  );
  return handleOf(animation);
}

/** Resolve one intent to its animation. */
function run(intent: MotionIntent, target: Element, detail?: MotionDetail): MotionHandle | null {
  switch (intent) {
    case "appear": {
      // A window/dialog zooms from its origin; a plain content block prints in.
      const kind = target.getAttribute(INTENT_ATTRIBUTE);
      if (kind === "print") return runPrintAppear(target);
      return runZoomAppear(target, detail);
    }
    case "confirm":
      return runMenuFlash(target);
    case "busy":
      return runBusy(target);
    case "expand":
      return runTriangle(target, "expand");
    case "collapse":
      return runTriangle(target, "collapse");
    case "progress":
      return null;
    case "alert":
      return runMenubarAlert(target);
    default:
      return null;
  }
}

/** The Chicago motion preset. */
export const chicagoMotion: MotionPreset = { run };
