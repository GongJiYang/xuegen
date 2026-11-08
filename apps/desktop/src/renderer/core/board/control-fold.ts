/**
 * The 总控 fold: only today's conversation stays open by default.
 *
 * Restored history messages carry `at` (the session file's timestamp); a live
 * message leaves it unset and counts as today. Everything before the first
 * today-or-live message folds behind a 「更早的对话」 row that reports how many
 * messages it hides and the day the older part starts on. Pure: `today` and
 * the ISO → local-day mapping are arguments, so the hook owns the clock.
 */

import type { ChatMessage } from "@shared/protocol.js";
import type { ThreadNote } from "../../skins/contract.js";

export interface ControlFold {
  messages: ChatMessage[];
  systemNotes: ThreadNote[];
  /** The 「更早的对话」 row, or null when nothing is earlier than today. */
  older: { count: number; since: string } | null;
}

export function foldEarlier(input: {
  messages: ChatMessage[];
  systemNotes: ThreadNote[];
  /** `YYYY-MM-DD` of today, local. */
  today: string;
  /** ISO timestamp → local `YYYY-MM-DD`. */
  localDay(iso: string): string;
  /** True once the learner has unfolded the earlier messages. */
  open: boolean;
}): ControlFold {
  const { messages, systemNotes, today, localDay, open } = input;
  let k = messages.length;
  for (let index = 0; index < messages.length; index += 1) {
    const at = messages[index]?.at;
    if (at === undefined || localDay(at) >= today) {
      k = index;
      break;
    }
  }
  if (k === 0) return { messages, systemNotes, older: null };
  // k > 0 means messages[0] failed the today test, so it carries `at`.
  const older = { count: k, since: localDay(messages[0]?.at ?? today) };
  if (open) return { messages, systemNotes, older };
  return {
    messages: messages.slice(k),
    systemNotes: systemNotes
      .filter((note) => note.beforeIndex >= k)
      .map((note) => ({ ...note, beforeIndex: note.beforeIndex - k })),
    older,
  };
}
