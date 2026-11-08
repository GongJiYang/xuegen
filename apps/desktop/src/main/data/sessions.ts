/**
 * Session transcripts for the session list.
 *
 * The list reads the transcripts directly: each `.jsonl` under
 * `<home>/sessions/` is one session and the file name's timestamp is its start
 * time. `summarizeSession` is pure — file name plus file text in, meta out — so
 * the transcript shape is testable without the filesystem; `listSessions` is
 * the thin shell that walks the directory.
 */

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { SessionMeta } from "../../shared/data-protocol.js";
import { isOwnSessionFile } from "../../agent/session-file.js";
import { textFromContent } from "../../agent/event-mapper.js";

/** The timestamp a session file name carries (same shape as the renderer's `SESSION_STAMP`). */
const SESSION_STAMP = /(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_/;

/** At most this many transcripts are summarized (newest file names first). */
const MAX_SESSIONS = 80;

/** The 「今日要点 · X」 title an assistant message announces (「离散 D2」). */
const PIN_TITLE = /今日要点\s*·\s*([^\n\]]+)/;

/**
 * Summarize one transcript for the session list, or null when the file name
 * carries no timestamp. Bad lines are skipped; a record only counts when it is
 * a user/assistant `message` with text.
 */
export function summarizeSession(file: string, text: string): SessionMeta | null {
  const match = SESSION_STAMP.exec(file);
  if (!match) return null;
  // The regex matched, so all seven digit groups are present.
  const [, y, mo, d, h, mi, s, ms] = match.map(Number);
  const startedAt = Date.UTC(y!, mo! - 1, d!, h!, mi!, s!, ms!);
  let firstUser = "";
  let pin: string | null = null;
  let count = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = record as { type?: string; message?: { role?: string; content?: unknown } } | null;
    if (entry?.type !== "message") continue;
    const message = entry.message;
    if (!message || (message.role !== "user" && message.role !== "assistant")) continue;
    const body = textFromContent(message.content);
    if (!body) continue;
    count += 1;
    if (message.role === "user") {
      if (!firstUser) firstUser = body;
    } else if (pin === null) {
      const found = PIN_TITLE.exec(body);
      if (found?.[1]) pin = found[1].trim();
    }
  }
  return { file, startedAt, firstUser, pin, count };
}

/**
 * Every session in the directory `current` lives in, newest first.
 *
 * `current` must be an own transcript (the same guard `open-session` uses), so
 * the renderer can only ever list sessions under `<home>/sessions/`; anything
 * else, or an unreadable directory, yields an empty list.
 */
/** True for an existing directory physically inside `<home>/sessions`. */
function isOwnSessionDir(home: string, dir: string): boolean {
  try {
    const root = realpathSync(resolve(home, "sessions"));
    const full = realpathSync(resolve(dir));
    return (full === root || full.startsWith(`${root}${sep}`)) && statSync(full).isDirectory();
  } catch {
    return false;
  }
}

export function listSessions(home: string, current: string): SessionMeta[] {
  // A session that has not been saved yet has no file, but its folder is still
  // the one to list: guard the folder (same realpath rule as isOwnSessionFile).
  if (!current.endsWith(".jsonl") || !(isOwnSessionFile(home, current) || isOwnSessionDir(home, dirname(current)))) return [];
  const dir = dirname(current);
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const metas: SessionMeta[] = [];
  for (const name of names.sort().reverse().slice(0, MAX_SESSIONS)) {
    const file = join(dir, name);
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const meta = summarizeSession(file, text);
    if (meta) metas.push(meta);
  }
  return metas.sort((a, b) => b.startedAt - a.startedAt);
}
