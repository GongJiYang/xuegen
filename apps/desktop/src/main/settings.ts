/**
 * Desktop settings persistence.
 *
 * The main process is the only writer of `~/.xuegen/desktop.json`; the renderer
 * goes through IPC. Writes are atomic (temp file + rename) so a crash mid-write
 * can never leave a half-written settings file, and reads fall back to defaults
 * on a missing, unreadable, or invalid file.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_DESKTOP_SETTINGS,
  normalizeDesktopSettings,
  type DesktopSettings,
} from "../shared/protocol.js";
import { resolveHome } from "../agent/environment.js";

/** Absolute path to the settings file inside the shared Xuegen home. */
export function settingsPath(): string {
  return join(resolveHome(), "desktop.json");
}

/** Read the stored settings, or defaults when the file is missing or invalid. */
export function readSettings(): DesktopSettings {
  try {
    const raw = readFileSync(settingsPath(), "utf8");
    return normalizeDesktopSettings(JSON.parse(raw));
  } catch {
    // Missing file, unreadable file, or invalid JSON all mean "use defaults".
    return { ...DEFAULT_DESKTOP_SETTINGS };
  }
}

/** Merge a partial update into the stored settings and write it atomically. */
export function writeSettings(patch: Partial<DesktopSettings>): DesktopSettings {
  const next = normalizeDesktopSettings({ ...readSettings(), ...patch });
  const home = resolveHome();
  mkdirSync(home, { recursive: true, mode: 0o700 });

  const target = settingsPath();
  const temp = `${target}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, target);
  return next;
}
