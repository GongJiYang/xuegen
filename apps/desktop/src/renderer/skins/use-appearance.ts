/**
 * Appearance settings shared by the gallery and the Shell: the skin list, the
 * active skin's own options, the body scale, and the window background.
 *
 * Lives in `skins/` because it enumerates the registry; `core` must not import a
 * skin. All writes go through the settings store so a switch is instant and
 * persisted in the background.
 */

import { useCallback, useMemo } from "react";
import type { DesktopSettings } from "@shared/protocol.js";
import { SKINS } from "./registry.js";

/** Shared empty options, so a skin without options keeps a stable reference. */
const EMPTY_SKIN_OPTIONS: Record<string, string> = {};

export interface SkinAppearance {
  skinChoices: { id: string; name: string }[];
  skinOptions: Record<string, string>;
  onSelectSkin(id: string): void;
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

  return { skinChoices, skinOptions, onSelectSkin, onBodyScale, onSkinOption, onWindowBackground };
}
