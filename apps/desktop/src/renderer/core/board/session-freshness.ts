/**
 * Whether a course session is out of date: opened on an earlier day, or
 * started before the course file last changed. Pure: the caller passes today,
 * the time-zone offset, and what it has seen.
 */

const SESSION_STAMP = /(?:^|[\\/])(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_[^\\/]*$/;

/**
 * The local day (YYYY-MM-DD) an epoch-ms instant falls on.
 * @param tzOffsetMinutes `new Date().getTimezoneOffset()` (UTC − local, in minutes).
 */
export function localDayOf(epochMs: number, tzOffsetMinutes: number): string {
  const local = new Date(epochMs - tzOffsetMinutes * 60_000);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/**
 * The local day (YYYY-MM-DD) a session file was created, from its file name;
 * null when the name has no timestamp.
 * @param tzOffsetMinutes `new Date().getTimezoneOffset()` (UTC − local, in minutes).
 */
export function sessionDay(file: string | null, tzOffsetMinutes: number): string | null {
  if (!file) return null;
  const match = SESSION_STAMP.exec(file);
  if (!match) return null;
  // The regex matched, so all seven digit groups are present.
  const [, y, mo, d, h, mi, s, ms] = match.map(Number);
  return localDayOf(Date.UTC(y!, mo! - 1, d!, h!, mi!, s!, ms!), tzOffsetMinutes);
}

/**
 * The open session is a course's remembered session created before today:
 * returns that course and the session's day, else null.
 */
export function staleCourseSession(
  activeCourse: string | null,
  openSessionFile: string | null,
  courseSessions: Record<string, string>,
  today: string,
  tzOffsetMinutes: number,
): { slug: string; day: string } | null {
  if (!activeCourse || !openSessionFile) return null;
  if (courseSessions[activeCourse] !== openSessionFile) return null;
  const day = sessionDay(openSessionFile, tzOffsetMinutes);
  return day && day < today ? { slug: activeCourse, day } : null;
}

/** A course action should open a fresh session: none remembered, or the remembered one is from an earlier day. */
export function startsFresh(
  slug: string,
  courseSessions: Record<string, string>,
  today: string,
  tzOffsetMinutes: number,
): boolean {
  const day = sessionDay(courseSessions[slug] ?? null, tzOffsetMinutes);
  return day === null || day < today;
}

/**
 * The next message in this session should ask 学根 to re-read what it uses:
 * the course page (`isControl` false), or the skills it needs (`isControl`
 * true). Nothing seen yet in this app run, or the page changed since the last
 * answer ended. Empty (fresh) sessions never need it.
 */
export function needsRefresh(
  sessionFile: string | null,
  activeCourse: string | null,
  isControl: boolean,
  messageCount: number,
  changedAt: number | undefined,
  seen: Record<string, number>,
): boolean {
  if (!sessionFile || messageCount === 0) return false;
  // 总控会话 has no course page: a release or skill edit is invisible to it, so
  // the only signal is that this app run has not looked at the file yet.
  if (isControl) return seen[sessionFile] === undefined;
  if (!activeCourse) return false;
  const last = seen[sessionFile];
  if (last === undefined) return true;
  return changedAt !== undefined && changedAt > last;
}

/** At or above this context percent a course session offers 「先存档」. */
export const CHECKPOINT_PERCENT = 60;

export type CheckpointPhase = "none" | "offer" | "saving" | "saved";

/**
 * Where the open course session stands on the 存档 → 新会话 path. `sentFor` is
 * the session file the 存档 prompt went to; `doneFor` the file whose 存档 answer
 * has ended.
 */
export function checkpointPhase(
  activeCourse: string | null,
  sessionFile: string | null,
  percent: number | null,
  sentFor: string | null,
  doneFor: string | null,
): CheckpointPhase {
  if (!activeCourse || !sessionFile) return "none";
  if (doneFor === sessionFile) return "saved";
  if (sentFor === sessionFile) return "saving";
  return percent !== null && percent >= CHECKPOINT_PERCENT ? "offer" : "none";
}
