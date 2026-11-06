/**
 * Assistant turns: the run of assistant messages between two user messages.
 *
 * One answer arrives as several assistant messages (one per tool step). Skins
 * fold a turn's tool rows into a single line and show one copy button per turn,
 * so they need to know, for each message, which turn it belongs to and whether
 * it opens or closes that turn. Pure, so it is tested.
 */

import type { ChatMessage } from "@shared/protocol.js";

export interface TurnInfo {
  /** Stable key for the turn: the id of its first assistant message. */
  key: string;
  /** True for the turn's first assistant message. */
  first: boolean;
  /** True for the turn's last assistant message. */
  last: boolean;
  /** Tool calls across the whole turn. */
  toolCount: number;
}

/** For each message, its turn (assistant messages) or null (user messages). */
export function assistantTurns(messages: readonly ChatMessage[]): (TurnInfo | null)[] {
  const result: (TurnInfo | null)[] = messages.map(() => null);
  let index = 0;
  while (index < messages.length) {
    if (messages[index]?.role !== "assistant") {
      index += 1;
      continue;
    }
    let end = index;
    while (messages[end + 1]?.role === "assistant") end += 1;
    const key = messages[index]?.id ?? String(index);
    let toolCount = 0;
    for (let i = index; i <= end; i += 1) toolCount += messages[i]?.toolCalls.length ?? 0;
    for (let i = index; i <= end; i += 1) {
      result[i] = { key, first: i === index, last: i === end, toolCount };
    }
    index = end + 1;
  }
  return result;
}
