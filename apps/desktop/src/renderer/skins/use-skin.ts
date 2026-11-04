/**
 * Skin loading, with fallback.
 *
 * Resolves a skin id to its loaded module, applying the stylesheet and reporting
 * failures. An unknown id or a load error falls back to `bare` and surfaces a
 * notice, so a broken skin never blanks the window.
 */

import { useEffect, useState } from "react";
import { strings } from "../core/strings.js";
import type { NoticeItem } from "./contract.js";
import type { SkinModule } from "./contract.js";
import { FALLBACK_SKIN_ID, findSkin } from "./registry.js";

export interface SkinLoadResult {
  module: SkinModule | null;
  /** The id actually loaded (may differ from the requested one on fallback). */
  loadedId: string;
  /** Set when the requested id was unknown or failed to load. */
  notice: NoticeItem | null;
}

/**
 * Load a skin module for the given id.
 *
 * Returns null while loading. Unknown ids and load errors produce a notice and
 * the fallback module. The stylesheet, when present, is imported before the
 * module is handed back so a skin is never shown unstyled.
 */
export function useSkin(skinId: string): SkinLoadResult {
  const [result, setResult] = useState<SkinLoadResult>({
    module: null,
    loadedId: skinId,
    notice: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load(id: string, notice: NoticeItem | null): Promise<void> {
      const definition = findSkin(id);
      if (!definition) {
        if (id !== FALLBACK_SKIN_ID) {
          // Requested an unregistered skin: fall back and tell the user.
          await load(FALLBACK_SKIN_ID, { tone: "error", text: strings.notice.unknownSkin });
        }
        return;
      }
      try {
        const module = await definition.load();
        await module.stylesheet?.();
        if (!cancelled) setResult({ module, loadedId: definition.id, notice });
      } catch {
        if (id !== FALLBACK_SKIN_ID) {
          await load(FALLBACK_SKIN_ID, { tone: "error", text: strings.notice.skinFallback });
        }
      }
    }

    void load(skinId, null);
    return () => {
      cancelled = true;
    };
  }, [skinId]);

  return result;
}
