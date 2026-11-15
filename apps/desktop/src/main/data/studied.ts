/**
 * The 总控「今天学过」row's data: each course's study span on one day, read
 * back from the session transcripts (`sessions.studied`).
 *
 * `studiedInTranscript` is pure — transcript text plus the day's bounds in, one
 * `StudiedSpan` (or null) out — so the transcript shape is testable without the
 * filesystem; `listStudied` is the thin shell that walks `<home>/sessions/` and
 * its direct subdirectories. A file only counts when some user message in it
 * carries a `⟦xuegen:open|resume|verify|<slug>|…⟧` marker: every other session
 * (自由, 陪读, 领域, 总控) is not a course's study time.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { StudiedSpan } from "../../shared/data-protocol.js";
import { textFromContent } from "../../agent/event-mapper.js";
import { isOwnSessionDir, PIN_TITLE, SESSION_STAMP } from "./sessions.js";

/** The course marker an interface-sent opening/verify message ends with. */
const COURSE_MARKER = /⟦xuegen:(open|resume|verify)\|([a-z0-9-]+)\|/;

/** A same-day open/resume marker makes the span a lesson (rather than a bare visit). */
const LESSON_MARKER = /⟦xuegen:(?:open|resume)\|[a-z0-9-]+\|/;

/** A same-day verify marker: no lesson that day, but the 周核实 did run. */
const VERIFY_MARKER = /⟦xuegen:verify\|[a-z0-9-]+\|/;

/**
 * One transcript's contribution to a day's study spans, or null.
 *
 * The slug is identified by the first user message *anywhere in the file*
 * carrying a course marker (a course session persists across days, so the
 * opening message may sit on an earlier day); the span itself only counts the
 * day's records: `from` is that day's first user message, `to` its last
 * assistant message — or its last user message when nothing was answered.
 */
export function studiedInTranscript(text: string, dayStart: number, dayEnd: number): StudiedSpan | null {
  let slug: string | null = null;
  let lesson = false;
  let verify = false;
  let firstUser: number | null = null;
  let lastUser: number | null = null;
  let lastAssistant: number | null = null;
  let pin: string | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = record as {
      type?: string;
      timestamp?: unknown;
      message?: { role?: string; content?: unknown };
    } | null;
    if (entry?.type !== "message") continue;
    const message = entry.message;
    if (!message || (message.role !== "user" && message.role !== "assistant")) continue;
    const body = textFromContent(message.content);
    if (!body) continue;
    if (slug === null && message.role === "user") {
      const marker = COURSE_MARKER.exec(body);
      if (marker?.[2] !== undefined) slug = marker[2];
    }
    const at = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : NaN;
    if (Number.isNaN(at) || at < dayStart || at >= dayEnd) continue;
    if (message.role === "user") {
      if (firstUser === null) firstUser = at;
      lastUser = at;
      if (LESSON_MARKER.test(body)) lesson = true;
      else if (VERIFY_MARKER.test(body)) verify = true;
    } else {
      lastAssistant = at;
      if (pin === null) {
        const found = PIN_TITLE.exec(body);
        if (found?.[1]) pin = found[1].trim();
      }
    }
  }
  if (slug === null || firstUser === null) return null;
  return {
    slug,
    action: lesson ? "lesson" : verify ? "verify" : "other",
    pin,
    from: firstUser,
    to: lastAssistant ?? lastUser ?? firstUser,
  };
}

/**
 * Merge one course's several sessions of the day into a single span: earliest
 * `from`, latest `to`, lesson > verify > other for the action, and the pin of
 * the first lesson span that has one (else any non-null pin). Sorted by `from`.
 */
export function mergeStudied(spans: StudiedSpan[]): StudiedSpan[] {
  const bySlug = new Map<string, StudiedSpan[]>();
  for (const span of spans) {
    const group = bySlug.get(span.slug);
    if (group === undefined) bySlug.set(span.slug, [span]);
    else group.push(span);
  }
  const merged: StudiedSpan[] = [];
  for (const [slug, group] of bySlug) {
    merged.push({
      slug,
      action: group.some((span) => span.action === "lesson")
        ? "lesson"
        : group.some((span) => span.action === "verify")
          ? "verify"
          : "other",
      pin:
        group.find((span) => span.action === "lesson" && span.pin !== null)?.pin ??
        group.find((span) => span.pin !== null)?.pin ??
        null,
      from: Math.min(...group.map((span) => span.from)),
      to: Math.max(...group.map((span) => span.to)),
    });
  }
  return merged.sort((a, b) => a.from - b.from);
}

/**
 * Every course's study span on `date` (`YYYY-MM-DD`, local time).
 *
 * `<home>/sessions/` itself and its direct subdirectories hold transcripts;
 * directories are confirmed inside `<home>/sessions` with the same realpath
 * rule `listSessions` uses. A file whose name-stamped start (UTC) is at or past
 * the day's end cannot hold a record of the day, and a file not modified on
 * the day was not touched by it — both are skipped without reading.
 */
export function listStudied(home: string, date: string): StudiedSpan[] {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const dayStart = new Date(year, month - 1, day).getTime();
  const dayEnd = new Date(year, month - 1, day + 1).getTime();
  const root = join(home, "sessions");
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  const dirs = [root];
  for (const name of names) {
    const dir = join(root, name);
    if (isOwnSessionDir(home, dir)) dirs.push(dir);
  }
  const spans: StudiedSpan[] = [];
  for (const dir of dirs) {
    let files: string[];
    try {
      files = readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const name of files) {
      const file = join(dir, name);
      const stamp = SESSION_STAMP.exec(file);
      if (stamp !== null) {
        // The regex matched, so all seven digit groups are present.
        const [, y, mo, d, h, mi, s, ms] = stamp.map(Number);
        if (Date.UTC(y!, mo! - 1, d!, h!, mi!, s!, ms!) >= dayEnd) continue;
      }
      try {
        if (statSync(file).mtimeMs < dayStart) continue;
      } catch {
        continue;
      }
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const span = studiedInTranscript(text, dayStart, dayEnd);
      if (span !== null) spans.push(span);
    }
  }
  return mergeStudied(spans);
}
