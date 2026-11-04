/**
 * Chicago body-scale coercion.
 *
 * The pixel font only stays crisp at whole multiples, so Chicago renders body
 * text at 12px (scale 1) or 24px (scale 2) — nothing in between. The persisted
 * `bodyScale` is global and shared with other skins (bare offers a 0.75–2
 * slider), so Chicago must map a stored fractional value to the nearest whole
 * multiple *at read time*, without writing the mapped value back. That keeps a
 * user's `0.9` intact for a skin that can actually use it.
 */

/** The two scales Chicago renders at, smallest first. */
export const CHICAGO_SCALES = [1, 2] as const;

/** A scale Chicago can render at. */
export type ChicagoScale = (typeof CHICAGO_SCALES)[number];

/**
 * Map any requested body scale to the nearest Chicago scale (1 or 2).
 *
 * Ties round up (1.5 → 2). Non-finite input falls back to 1.
 */
export function coerceBodyScale(value: number): ChicagoScale {
  if (!Number.isFinite(value)) return 1;
  return value < 1.5 ? 1 : 2;
}

/** True when the coerced scale is the enlarged one. */
export function isBigScale(value: number): boolean {
  return coerceBodyScale(value) === 2;
}
