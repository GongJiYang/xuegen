/**
 * The 总控「今天学过」row's data hook: `sessions.studied` for today, loaded
 * only while the 总控 session is open (and the setting is on), shaped by
 * `studiedEntries`. Switching back to the 总控 session re-reads it.
 *
 * The row is a derived hint, so a failure is silent: the hook returns [] and
 * the skin simply does not draw the row — never a notice.
 */

import type { CycleDay, StudiedSpan } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { studiedEntries, type StudiedEntry } from "./studied.js";
import { useBoardResource, type LoadResult } from "./use-resource.js";

const NEVER = new Promise<LoadResult<StudiedSpan[]>>(() => {});

/** null while loading; [] when disabled, on an error, or when nothing was studied. */
export function useStudied(enabled: boolean, today: string, day: CycleDay | null): StudiedEntry[] | null {
  const resource = useBoardResource(
    () => (enabled ? client.data({ kind: "sessions.studied", date: today }) : NEVER),
    [enabled, today],
  );
  if (!enabled) return [];
  if (resource.state.status === "error") return [];
  if (resource.state.status !== "ready") return null;
  return studiedEntries(resource.state.value, day);
}
