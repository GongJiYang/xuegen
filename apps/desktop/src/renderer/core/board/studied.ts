/**
 * The 总控「今天学过」row's view model (batch 6a): one line per main course
 * that ran today — its label (the pinned 今日要点 title, a 周核实 tag, or the
 * course's short name) plus an HH:MM–HH:MM span. It is derived view data, not
 * a new state: the main process reads it back from the session transcripts.
 */

import type { CycleDay, StudiedSpan } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

export interface StudiedEntry {
  slug: string;
  label: string;
  time: string;
}

/** Local HH:MM, zero-padded. */
function clock(epoch: number): string {
  const date = new Date(epoch);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * The row's entries, in input order (the data channel already sorts by `from`).
 * Only the day's main courses count; a 导读课 or anything else the main process
 * somehow reported drops out here.
 */
export function studiedEntries(spans: StudiedSpan[], day: CycleDay | null): StudiedEntry[] {
  if (day === null) return [];
  const entries: StudiedEntry[] = [];
  for (const span of spans) {
    if (day.roles[span.slug] !== "main") continue;
    const short = day.names[span.slug] ?? span.slug;
    const label =
      span.action === "lesson" && span.pin !== null
        ? span.pin
        : span.action === "verify"
          ? strings.control.card.studiedVerify(short)
          : short;
    const from = clock(span.from);
    const to = clock(span.to);
    entries.push({ slug: span.slug, label, time: from === to ? from : `${from}–${to}` });
  }
  return entries;
}
