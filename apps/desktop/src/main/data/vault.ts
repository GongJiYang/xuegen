/**
 * Locates the user's vault root from `$XUEGEN_HOME/wiki.json`.
 *
 * The vault is read-only configuration: the app only reads `wiki.json` to learn
 * where the wiki lives. Nothing under the vault is written except the paths the
 * individual skills own (e.g. `wiki/calendar/`), and only via those scripts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveHome } from "../../agent/environment.js";

/**
 * The configured vault root, or null when `wiki.json` is missing/invalid.
 *
 * Returns null rather than throwing so data handlers can surface a single,
 * user-facing "库未配置" message instead of crashing the IPC layer.
 */
export function readVaultRoot(): string | null {
  try {
    const raw = readFileSync(join(resolveHome(), "wiki.json"), "utf8");
    const parsed = JSON.parse(raw) as { root?: unknown };
    if (typeof parsed.root === "string" && parsed.root.trim() !== "") return parsed.root.trim();
    return null;
  } catch {
    return null;
  }
}
