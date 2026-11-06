/**
 * Bear body-text size ladder.
 *
 * The design's five rungs on a 16px base: 14 / 16 / 18 / 20 / 24px, independent
 * of the body font. Settings may hold a value off the ladder (e.g. Chicago's 2);
 * it snaps to the nearest rung for display only — the stored value is never
 * rewritten (bear.md §3).
 */

/** The five scale rungs, ascending (also the module's `bodyScaleSteps`). */
export const BEAR_BODY_SCALE_STEPS = [0.875, 1, 1.125, 1.25, 1.5] as const;

/** The base size a rung multiplies. */
export const BEAR_BODY_BASE_PX = 16;

/**
 * Snap an arbitrary scale to the nearest rung (ties go up), for display only.
 * Non-finite values fall back to the middle rung (16px).
 */
export function bearBodyScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const first = BEAR_BODY_SCALE_STEPS[0];
  const last = BEAR_BODY_SCALE_STEPS[BEAR_BODY_SCALE_STEPS.length - 1] ?? first;
  if (value <= first) return first;
  if (value >= last) return last;
  return BEAR_BODY_SCALE_STEPS.reduce((best, step) =>
    Math.abs(step - value) <= Math.abs(best - value) ? step : best,
  );
}

/** The rendered body size in px for a rung (14 / 16 / 18 / 20 / 24). */
export function bearBodyPx(step: number): number {
  return Math.round(BEAR_BODY_BASE_PX * bearBodyScale(step));
}
