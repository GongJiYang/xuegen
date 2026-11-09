/**
 * Deriving a session's role when the interface did not name one.
 *
 * The role normally arrives on the `open-session`/`new-session` message, but a
 * session restored at agent start (or via `continue-session`) has no such
 * message. The transcript itself says what it is: the opening user message
 * carries the 开课 marker `⟦xuegen:open|<slug>|…⟧`, and `desktop.json`
 * remembers which transcript belongs to which course or cycle. Anything that
 * cannot be identified is `free`.
 *
 * `roleFromHints` is the pure decision; `inferSessionRole` is the thin shell
 * that reads the transcript's head and the settings maps.
 */

import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";
import type { SessionRole } from "../../shared/protocol.js";
import { textFromContent } from "../event-mapper.js";

/** The action marker a UI-sent message ends with: `⟦xuegen:<action>|<slug>|<title>⟧`. */
const MARKER = /⟦xuegen:([a-z-]+)(?:\|([a-z0-9-]+)\|[^⟧\n]*)?⟧/;
/** Session slugs are always this shape (same rule the protocol applies). */
const SLUG = /^[a-z0-9-]+$/;
/**
 * Pre-marker sessions named their course file in the opening prompt, either as
 * an absolute path (`/wiki/courses/epp.md`) or vault-relative (`wiki/courses/…`).
 */
const LEGACY_COURSE_FILE = /(?:^|[^a-z0-9-])wiki\/courses\/([a-z0-9-]+)\.md/;
/** A `[风格：x]` prefix the composer puts in front of the visible body. */
const STYLE_PREFIX = /^\[风格：[^\]]*\]\s*/;

/** How much of a transcript to scan: the opening message sits at the top. */
const SCAN_BYTES = 256 * 1024;
/** The first few user messages are enough to find an opening marker. */
const MAX_USER_TEXTS = 20;

export interface SessionRoleHints {
  sessionFile: string | null;
  /** User message bodies in transcript order; a handful is enough. */
  userTexts: string[];
  /** `desktop.json`'s `courseSessions` (slug → file). */
  courseSessions: Record<string, string>;
  /** `desktop.json`'s `controlSessions` values (the 总控 files). */
  controlFiles: string[];
}

/**
 * The role a restored session plays, mirroring the session list's rules: a
 * remembered 总控 file is 总控; an opening/plan/resume marker or the remembered
 * course map names the course; the pre-marker opening text is the last hint.
 */
export function roleFromHints(hints: SessionRoleHints): SessionRole {
  const { sessionFile, userTexts, courseSessions, controlFiles } = hints;
  if (sessionFile !== null && controlFiles.includes(sessionFile)) return { kind: "control" };
  for (const raw of userTexts) {
    const text = raw.replace(STYLE_PREFIX, "");
    const marker = MARKER.exec(text);
    if (!marker) continue;
    if (marker[2] !== undefined) return { kind: "course", slug: marker[2] };
    // The 今日简报 only ever goes to the 总控 session.
    if (marker[1] === "brief") return { kind: "control" };
  }
  if (sessionFile !== null) {
    const slug = Object.entries(courseSessions).find(([, file]) => file === sessionFile)?.[0];
    if (slug !== undefined && SLUG.test(slug)) return { kind: "course", slug };
  }
  const first = userTexts[0]?.replace(STYLE_PREFIX, "") ?? "";
  if (first.startsWith("开始今天的") || first.startsWith("继续 ")) {
    const slug = LEGACY_COURSE_FILE.exec(first)?.[1];
    if (slug !== undefined) return { kind: "course", slug };
  }
  return { kind: "free" };
}

/** The role of a session file, or `free` when nothing identifies it. */
export function inferSessionRole(home: string, sessionFile: string | null): SessionRole {
  const { courseSessions, controlFiles } = sessionMaps(home);
  return roleFromHints({
    sessionFile,
    userTexts: sessionFile === null ? [] : firstUserTexts(sessionFile),
    courseSessions,
    controlFiles,
  });
}

/** Read `desktop.json`'s session maps, tolerating a missing or hand-edited file. */
function sessionMaps(home: string): { courseSessions: Record<string, string>; controlFiles: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(home, "desktop.json"), "utf8"));
  } catch {
    return { courseSessions: {}, controlFiles: [] };
  }
  const record = parsed as Record<string, unknown> | null;
  return {
    courseSessions: stringMap(record?.courseSessions),
    controlFiles: Object.values(stringMap(record?.controlSessions)),
  };
}

/** Keep only `slug -> *.jsonl` string entries from a settings map. */
function stringMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.trim() !== "" && typeof entry === "string" && entry.endsWith(".jsonl")) result[key] = entry;
  }
  return result;
}

/** The first few user message bodies in a transcript, scanning only its head. */
function firstUserTexts(sessionFile: string): string[] {
  let head: string;
  try {
    const fd = openSync(sessionFile, "r");
    try {
      const buffer = Buffer.alloc(SCAN_BYTES);
      const read = readSync(fd, buffer, 0, SCAN_BYTES, 0);
      head = buffer.toString("utf8", 0, read);
    } finally {
      closeSync(fd);
    }
  } catch {
    return [];
  }
  const texts: string[] = [];
  for (const line of head.split("\n")) {
    if (texts.length >= MAX_USER_TEXTS) break;
    if (!line.includes('"role":"user"') && !line.includes('"role": "user"')) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // a truncated tail line is expected on a mid-file cut
    }
    const message = (entry as { type?: string; message?: { role?: string; content?: unknown } }).message;
    if (message?.role !== "user") continue;
    const body = textFromContent(message.content);
    if (body) texts.push(body);
  }
  return texts;
}
