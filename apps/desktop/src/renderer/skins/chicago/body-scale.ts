/**
 * Chicago body-scale ladders.
 *
 * The pixel font only stays crisp at whole multiples, so it renders body text at
 * 12px (scale 1) or 24px (scale 2). A smooth system font may use the finer
 * 15–24px ladder instead. The ladders themselves live in core, because the
 * shortcut hook and both skins' menus need them; this module is Chicago's entry
 * point to that data.
 */

import type { BodyFont } from "@shared/protocol.js";
import { bodyScaleStepsForFont } from "../../core/settings/body-font.js";

/** The two scales the pixel font can draw crisply. */
export const CHICAGO_SCALES = [1, 2] as const;

/** The ladder Chicago offers for a given body font. */
export function chicagoBodyScaleSteps(font: BodyFont): readonly number[] {
  return bodyScaleStepsForFont(font);
}
