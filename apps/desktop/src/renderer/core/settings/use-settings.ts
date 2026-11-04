/**
 * Desktop settings, from the renderer's point of view.
 *
 * Reads and writes go through the preload client; the main process owns the file
 * (`~/.xuegen/desktop.json`) and validates it. The read is normalized here so the
 * renderer never sees a hand-edited or out-of-range value.
 */

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_DESKTOP_SETTINGS,
  normalizeDesktopSettings,
  type DesktopSettings,
} from "@shared/protocol.js";
import * as client from "../client.js";

export interface SettingsController {
  settings: DesktopSettings;
  /** True until the first read resolves. */
  loading: boolean;
  update(patch: Partial<DesktopSettings>): void;
  /** Replace the store with an authoritative settings object (e.g. one a data
   *  write returned), so callers that write through another channel stay in sync. */
  apply(settings: DesktopSettings): void;
}

/**
 * Load settings once on mount and expose an optimistic updater.
 *
 * The update writes to the local state immediately (so a skin switch is instant)
 * and persists in the background; the store's authoritative value replaces the
 * optimistic one when the write resolves.
 */
export function useSettings(): SettingsController {
  const [settings, setState] = useState<DesktopSettings>(DEFAULT_DESKTOP_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    client
      .getSettings()
      .then((loaded) => {
        if (!cancelled) setState(normalizeDesktopSettings(loaded));
      })
      .catch(() => {
        // The bridge is unavailable (e.g. a test harness); keep the defaults.
        if (!cancelled) setState(DEFAULT_DESKTOP_SETTINGS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<DesktopSettings>) => {
    setState((current) => normalizeDesktopSettings({ ...current, ...patch }));
    void client
      .setSettings(patch)
      .then((stored) => setState(normalizeDesktopSettings(stored)))
      .catch(() => {
        // Persisting failed; the optimistic value stays for this session.
      });
  }, []);

  const apply = useCallback((next: DesktopSettings) => {
    setState(normalizeDesktopSettings(next));
  }, []);

  return { settings, loading, update, apply };
}
