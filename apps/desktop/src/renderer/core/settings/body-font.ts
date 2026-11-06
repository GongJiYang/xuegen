/**
 * Body-font scale ladders.
 *
 * The pixel font only stays crisp at whole multiples (12px / 24px). A system
 * font renders smoothly at any size, so it offers the 15–24px readout ladder
 * instead. These are pure lookups shared by the shortcut hook and the menus.
 */

import type { BodyFont } from "@shared/protocol.js";

/** The pixel font's two crisp sizes. */
export const PIXEL_BODY_SCALES = [1, 2] as const;

/** The smooth fonts' four sizes: 15 / 18 / 21 / 24px. */
export const SMOOTH_BODY_SCALES = [1.25, 1.5, 1.75, 2] as const;

/** The base body size the scale multiplies (Chicago's 12px pixel body). */
export const BODY_BASE_PX = 12;

/** The scales a font offers, ascending. */
export function bodyScaleStepsForFont(font: BodyFont): readonly number[] {
  return font === "pixel" ? PIXEL_BODY_SCALES : SMOOTH_BODY_SCALES;
}

/** ⌘0's target: the pixel font's large size, or 18px for a smooth font. */
export function defaultBodyScaleForFont(font: BodyFont): number {
  return font === "pixel" ? 2 : 1.5;
}

/** The rendered size in px, for menu labels such as `15px`. */
export function bodyScalePixels(scale: number): number {
  return Math.round(BODY_BASE_PX * scale);
}

/**
 * Snap a scale to the nearest rung of a font's ladder (ties go up).
 *
 * A non-finite value falls back to the font's default. Switching fonts uses
 * this so a pixel 2 (24px) survives as a smooth 2 (24px), while a smooth 1.25
 * becomes pixel 1 when 1.25 is not a size the pixel font can draw.
 */
export function coerceBodyScaleForFont(value: number, font: BodyFont): number {
  if (!Number.isFinite(value)) return defaultBodyScaleForFont(font);
  const steps = bodyScaleStepsForFont(font);
  const first = steps[0];
  const last = steps[steps.length - 1];
  if (first === undefined || last === undefined) return defaultBodyScaleForFont(font);
  if (value <= first) return first;
  if (value >= last) return last;
  return steps.reduce((best, step) =>
    Math.abs(step - value) <= Math.abs(best - value) ? step : best,
  );
}
