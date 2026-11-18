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
import { basename, dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import type { SessionMeta } from "../../shared/data-protocol.js";
import { isOwnSessionFile } from "../../agent/session-file.js";
import { textFromContent } from "../../agent/event-mapper.js";

/** The timestamp a session file name carries (same shape as the renderer's `SESSION_STAMP`). */
export const SESSION_STAMP = /(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_/;

/** At most this many transcripts are summarized (newest file names first). */
const MAX_SESSIONS = 80;

/** The 「今日要点 · X」 title an assistant message announces (「离散 D2」). */
export const PIN_TITLE = /今日要点\s*·\s*([^\n\]]+)/;

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
export function isOwnSessionDir(home: string, dir: string): boolean {
  try {
    const root = realpathSync(resolve(home, "sessions"));
    const full = realpathSync(resolve(dir));
    return (full === root || full.startsWith(`${root}${sep}`)) && statSync(full).isDirectory();
  } catch {
    return false;
  }
}

/** The `.jsonl` transcripts in one directory, newest first, capped at MAX_SESSIONS. */
function listDir(dir: string): SessionMeta[] {
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

/** True when `current` is an own transcript or an unsaved session in an own folder. */
function currentAllowed(home: string, current: string): boolean {
  if (!current.endsWith(".jsonl")) return false;
  return isOwnSessionFile(home, current) || isOwnSessionDir(home, dirname(current));
}

export function listSessions(home: string, current: string): SessionMeta[] {
  // A session that has not been saved yet has no file, but its folder is still
  // the one to list: guard the folder (same realpath rule as isOwnSessionFile).
  if (!currentAllowed(home, current)) return [];
  return listDir(dirname(current));
}

/** The `cwd` in a transcript's first line (Pi's `session` header), or null when it has none. */
function headerCwd(file: string): string | null {
  try {
    const head: unknown = JSON.parse(readFileSync(file, "utf8").split("\n", 1)[0] ?? "");
    if (typeof head !== "object" || head === null) return null;
    const { type, cwd } = head as { type?: unknown; cwd?: unknown };
    return type === "session" && typeof cwd === "string" && cwd !== "" ? cwd : null;
  } catch {
    return null;
  }
}

/** 「主目录」 for the user's home, else the folder's last path segment (「pi-learning」). */
function placeLabel(cwd: string, userHome: string): string {
  if (resolve(cwd) === resolve(userHome)) return "主目录";
  return basename(resolve(cwd)) || cwd;
}

/**
 * Sessions in the other folders under `<home>/sessions/` (not `current`'s),
 * grouped by folder, groups sorted by their newest session first. `dir` is the
 * folder name (Pi names session folders after the cwd, like
 * `--Users-alice-projects-foo--`); `label` names the folder the sessions were
 * started in: 「主目录」 for the user's home, else the last segment of the newest
 * transcript's `cwd`; the folder name's last segment when no transcript has a
 * `session` header.
 * Folders that are not own session dirs (a symlink escaping `<home>/sessions`)
 * and empty folders are skipped.
 */
export function listOtherSessions(
  home: string,
  current: string,
  userHome: string = homedir(),
): { dir: string; label: string; sessions: SessionMeta[] }[] {
  if (!currentAllowed(home, current)) return [];
  const root = resolve(home, "sessions");
  let names: string[];
  try {
    names = readdirSync(root).filter((name) => isOwnSessionDir(home, join(root, name)));
  } catch {
    return [];
  }
  let currentDir: string;
  try {
    currentDir = realpathSync(dirname(current));
  } catch {
    return [];
  }
  const groups: { dir: string; label: string; sessions: SessionMeta[] }[] = [];
  for (const name of names) {
    const dir = join(root, name);
    let real: string;
    try {
      real = realpathSync(dir);
    } catch {
      // The folder passed isOwnSessionDir but vanished before this realpath.
      continue;
    }
    if (real === currentDir) continue;
    const sessions = listDir(dir);
    if (sessions.length === 0) continue;
    const cwd = headerCwd(sessions[0]?.file ?? "");
    const tail = name.replace(/^-+|-+$/g, "");
    const label = cwd === null ? (tail.split("-").pop() ?? name) : placeLabel(cwd, userHome);
    groups.push({ dir: name, label, sessions });
  }
  return groups.sort((a, b) => (b.sessions[0]?.startedAt ?? 0) - (a.sessions[0]?.startedAt ?? 0));
}
