/**
 * ⌘+ / ⌘= / ⌘- / ⌘0 (Ctrl on Windows/Linux) step the body text along the active
 * skin's ladder for the active body font.
 *
 * Not DEV-gated: this replaces the page zoom the app menu used to offer, and a
 * fractional page zoom blurs the pixel fonts. A window-level listener also fires
 * while a field is focused, and the ⌘/Ctrl combination does not type a character
 * there. A key another shortcut already handled (Bear's ⌘0 → 总控) is skipped.
 */

import { useEffect } from "react";
import type { BodyFont } from "@shared/protocol.js";
import { defaultBodyScaleForFont } from "./body-font.js";
import { DEFAULT_BODY_SCALE_STEPS, bodyScaleDirection, stepBodyScale } from "./step-body-scale.js";

/** The part of a skin this hook needs: its optional text-size ladder. */
export interface BodyScaleSkin {
  bodyScaleSteps?: readonly number[] | ((font: BodyFont) => readonly number[]);
}

/** Install the body-scale keyboard shortcuts while `skin` is loaded. */
export function useBodyScaleShortcuts(
  skin: BodyScaleSkin | null,
  bodyFont: BodyFont,
  bodyScale: number,
  update: (patch: { bodyScale: number }) => void,
): void {
  const source = skin?.bodyScaleSteps;
  const fontAware = typeof source === "function";
  const steps = typeof source === "function" ? source(bodyFont) : (source ?? DEFAULT_BODY_SCALE_STEPS);
  // ⌘0 returns to the font's default rung, not always the legacy nearest-to-1.
  const resetTo = fontAware ? defaultBodyScaleForFont(bodyFont) : 1;

  useEffect(() => {
    if (!skin) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      const direction = bodyScaleDirection(event.key);
      if (!direction) return;
      event.preventDefault();
      const next = stepBodyScale(bodyScale, direction, steps, resetTo);
      if (next !== bodyScale) update({ bodyScale: next });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skin, bodyScale, steps, resetTo, update]);
}
