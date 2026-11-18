/**
 * 「其他位置的会话」: the sessions in the other folders under <数据根>/sessions,
 * merged and grouped by day like the main list, with each row's folder name.
 */
import type { SessionMeta } from "@shared/data-protocol.js";
import { sessionGroups, type SessionGroup, type SessionListContext } from "../board/session-list.js";

export interface OtherSessionsView {
  /** Rows in all groups (the toggle's N). */
  count: number;
  groups: SessionGroup[];
  /** file → folder label (「pi-learning」/「主目录」). */
  places: Record<string, string>;
}

export function otherSessions(
  folders: { label: string; sessions: SessionMeta[] }[],
  ctx: SessionListContext,
): OtherSessionsView {
  const places: Record<string, string> = {};
  for (const folder of folders) {
    for (const meta of folder.sessions) places[meta.file] = folder.label;
  }
  const groups = sessionGroups(
    folders.flatMap((folder) => folder.sessions),
    ctx,
  );
  return { count: groups.reduce((sum, group) => sum + group.rows.length, 0), groups, places };
}
