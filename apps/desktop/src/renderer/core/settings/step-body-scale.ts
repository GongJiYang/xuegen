/**
 * Body-scale stepping for the ⌘+ / ⌘- / ⌘0 shortcuts.
 *
 * A skin declares the exact scales it can render at, so stepping never lands on
 * a fractional size the pixel fonts cannot draw crisply. The result is written
 * to `bodyScale`; it is a text-size setting, not the page zoom.
 */

/** Which way a shortcut moves the body scale. */
export type BodyScaleDirection = "in" | "out" | "reset";

/**
 * The reference ladder: bare's 0.75–2 range in 0.05 steps.
 *
 * Used when a skin does not declare its own `bodyScaleSteps`.
 */
export const DEFAULT_BODY_SCALE_STEPS: readonly number[] = buildDefaultSteps();

function buildDefaultSteps(): number[] {
  const steps: number[] = [];
  // Integer hundredths avoid drift over 26 additions.
  for (let hundredths = 75; hundredths <= 200; hundredths += 5) {
    steps.push(hundredths / 100);
  }
  return steps;
}

/** Map a keydown's `key` to a direction, or null when it is not a zoom key. */
export function bodyScaleDirection(key: string): BodyScaleDirection | null {
  switch (key) {
    case "+":
    case "=":
      return "in";
    case "-":
    case "_":
      return "out";
    case "0":
      return "reset";
    default:
      return null;
  }
}

/** Drop non-finite values, de-duplicate, and sort a skin's ladder ascending. */
function orderedSteps(steps: readonly number[]): number[] {
  const finite = steps.filter((value) => Number.isFinite(value));
  return Array.from(new Set(finite)).sort((left, right) => left - right);
}

/**
 * Move `current` one step along the skin's ladder.
 *
 * `in` picks the next larger step (clamped at the top), `out` the next smaller
 * (clamped at the bottom), and `reset` the step nearest 1 (ties pick the
 * smaller). Values that are not on the ladder are treated by magnitude, so a
 * legacy fractional scale still steps to a real step. An empty ladder leaves the
 * value untouched.
 */
export function stepBodyScale(
  current: number,
  direction: BodyScaleDirection,
  skinSteps: readonly number[],
): number {
  const steps = orderedSteps(skinSteps);
  const first = steps[0];
  const last = steps[steps.length - 1];
  if (first === undefined || last === undefined) return current;

  if (direction === "reset") {
    return steps.reduce((best, step) => (Math.abs(step - 1) < Math.abs(best - 1) ? step : best));
  }

  if (direction === "in") {
    const next = steps.find((step) => step > current);
    return next ?? last;
  }

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step !== undefined && step < current) return step;
  }
  return first;
}
