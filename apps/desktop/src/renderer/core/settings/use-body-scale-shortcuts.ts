/**
 * ⌘+ / ⌘= / ⌘- / ⌘0 (Ctrl on Windows/Linux) step the body text along the active
 * skin's ladder.
 *
 * Not DEV-gated: this replaces the page zoom the app menu used to offer, and a
 * fractional page zoom blurs the pixel fonts. A window-level listener also fires
 * while a field is focused, and the ⌘/Ctrl combination does not type a character
 * there.
 */

import { useEffect } from "react";
import { DEFAULT_BODY_SCALE_STEPS, bodyScaleDirection, stepBodyScale } from "./step-body-scale.js";

/** The part of a skin this hook needs: its optional text-size ladder. */
export interface BodyScaleSkin {
  bodyScaleSteps?: readonly number[];
}

/** Install the body-scale keyboard shortcuts while `skin` is loaded. */
export function useBodyScaleShortcuts(
  skin: BodyScaleSkin | null,
  bodyScale: number,
  update: (patch: { bodyScale: number }) => void,
): void {
  useEffect(() => {
    if (!skin) return;
    const steps = skin.bodyScaleSteps ?? DEFAULT_BODY_SCALE_STEPS;
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const direction = bodyScaleDirection(event.key);
      if (!direction) return;
      event.preventDefault();
      const next = stepBodyScale(bodyScale, direction, steps);
      if (next !== bodyScale) update({ bodyScale: next });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skin, bodyScale, update]);
}
