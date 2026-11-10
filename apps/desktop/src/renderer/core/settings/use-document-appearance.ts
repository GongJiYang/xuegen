/**
 * The two `<html>` side effects the renderer owns.
 *
 * The window background is a plain inline style; the skin's `data-*` attributes
 * scope its CSS. Both are DOM-only, so they live in one hook instead of being
 * spelled out inside `App.tsx`, which stays a wiring file.
 */

import { useEffect } from "react";
import type { BodyFont } from "@shared/protocol.js";
import { coerceBodyScaleForFont } from "./body-font.js";

export interface DocumentAppearanceOptions {
  /** The user's window colour, or empty/undefined to leave the CSS default. */
  windowBackground: string | undefined;
  /** Whether the skin module has loaded; the `data-*` attributes wait for it. */
  skinLoaded: boolean;
  /** The id of the loaded skin, written to `data-skin`. */
  skinId: string;
  bodyFont: BodyFont;
  bodyScale: number;
}

/** Mark `<html>` with the window background and the active skin's appearance. */
export function useDocumentAppearance(options: DocumentAppearanceOptions): void {
  const { windowBackground, skinLoaded, skinId, bodyFont, bodyScale } = options;

  useEffect(() => {
    if (windowBackground) {
      document.documentElement.style.backgroundColor = windowBackground;
    }
  }, [windowBackground]);

  useEffect(() => {
    if (!skinLoaded) return;
    document.documentElement.dataset.skin = skinId;
    document.documentElement.dataset.bodyFont = bodyFont;
    document.documentElement.dataset.bodyScale = String(coerceBodyScaleForFont(bodyScale, bodyFont));
    return () => {
      delete document.documentElement.dataset.skin;
      delete document.documentElement.dataset.bodyFont;
      delete document.documentElement.dataset.bodyScale;
    };
  }, [skinLoaded, skinId, bodyFont, bodyScale]);
}
