/**
 * Appearance settings shared by the gallery and the Shell: the skin list, the
 * active skin's own options, the body scale, and the window background.
 *
 * Lives in `skins/` because it enumerates the registry; `core` must not import a
 * skin. All writes go through the settings store so a switch is instant and
 * persisted in the background.
 */

import { useCallback, useEffect, useMemo } from "react";
import type { BodyFont, DesktopSettings } from "@shared/protocol.js";
import { coerceBodyScaleForFont } from "../core/settings/body-font.js";
import { SKINS, skinIds } from "./registry.js";

/** Shared empty options, so a skin without options keeps a stable reference. */
const EMPTY_SKIN_OPTIONS: Record<string, string> = {};

export interface SkinAppearance {
  skinChoices: { id: string; name: string }[];
  skinOptions: Record<string, string>;
  onSelectSkin(id: string): void;
  onBodyFont(font: BodyFont): void;
  onBodyScale(value: number): void;
  onSkinOption(key: string, value: string): void;
  onWindowBackground(color: string): void;
}

/** Derive appearance props for the active skin and bind their writes. */
export function useSkinAppearance(
  settings: DesktopSettings,
  update: (patch: Partial<DesktopSettings>) => void,
  loadedId: string,
): SkinAppearance {
  const skinChoices = SKINS.map((entry) => ({ id: entry.id, name: entry.name }));

  const skinOptions = useMemo(
    () => settings.skinOptions[loadedId] ?? EMPTY_SKIN_OPTIONS,
    [settings.skinOptions, loadedId],
  );

  const onSelectSkin = useCallback(
    (id: string) => {
      update({ skin: id });
    },
    [update],
  );

  const onBodyFont = useCallback(
    (font: BodyFont) => {
      // Snap the current size onto the new font's ladder so switching fonts
      // never lands on a scale the skin cannot render.
      update({ bodyFont: font, bodyScale: coerceBodyScaleForFont(settings.bodyScale, font) });
    },
    [update, settings.bodyScale],
  );

  const onBodyScale = useCallback(
    (value: number) => {
      update({ bodyScale: value });
    },
    [update],
  );

  const onSkinOption = useCallback(
    (key: string, value: string) => {
      update({ skinOptions: { ...settings.skinOptions, [loadedId]: { ...skinOptions, [key]: value } } });
    },
    [update, settings.skinOptions, loadedId, skinOptions],
  );

  const onWindowBackground = useCallback(
    (color: string) => {
      if (color === settings.windowBackground) return;
      update({ windowBackground: color });
    },
    [update, settings.windowBackground],
  );

  return {
    skinChoices,
    skinOptions,
    onSelectSkin,
    onBodyFont,
    onBodyScale,
    onSkinOption,
    onWindowBackground,
  };
}

/** Development only: ⌘⇧K cycles through the registered skins. */
export function useSkinCycleShortcut(
  loadedId: string,
  update: (patch: Partial<DesktopSettings>) => void,
): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const ids = skinIds();
    function onKeyDown(event: KeyboardEvent): void {
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const index = ids.indexOf(loadedId);
        const next = ids[(index + 1) % ids.length];
        if (next) update({ skin: next });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loadedId, update]);
}
