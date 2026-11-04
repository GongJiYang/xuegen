/**
 * Flashcards view model.
 *
 * Wraps `cards.stats` (total, unsynced, per-deck sync ratio, pending extracts).
 * Storing a new card writes to the vault and refreshes the stats, so the 今天
 * window's 待同步 count and the 卡片 window agree.
 *
 * Anki connectivity is a separate resource ({@link useAnki}) so a slow or absent
 * Anki never blocks the local card statistics.
 */

import type { AnkiStatus, CardsStats } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { useBoardResource, type BoardResource, type LoadResult } from "./use-resource.js";

export interface CardsResource {
  stats: BoardResource<CardsStats>;
  add(deck: string, front: string, back: string): Promise<LoadResult<unknown>>;
  reload(): void;
}

export function useCards(): CardsResource {
  const stats = useBoardResource(() => client.data({ kind: "cards.stats" }), []);
  return {
    stats,
    reload: stats.reload,
    add: (deck, front, back) =>
      stats.mutate(() => client.data({ kind: "cards.add", deck, front, back })),
  };
}

/**
 * Read-only AnkiConnect status.
 *
 * `running: false` is a normal state (Anki closed), not an error: the card panel
 * shows "Anki 未打开" with a retry rather than a failure. Polls on mount only;
 * the panel's 重试 button calls `reload`.
 */
export function useAnki(): BoardResource<AnkiStatus> {
  return useBoardResource(() => client.data({ kind: "anki.status" }), []);
}
