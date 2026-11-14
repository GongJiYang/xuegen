/**
 * The session list: transcript summaries folded into rows grouped by day.
 *
 * `sessionGroups` is pure — the main process reports `SessionMeta`s and the
 * caller supplies everything time- or settings-dependent in `ctx`, so the same
 * grouping feeds both the title popover and the calendar's 「这天的会话」.
 */

import type { CycleLesson, SessionMeta } from "@shared/data-protocol.js";
import type { SessionRole } from "@shared/protocol.js";
import { strings } from "../strings.js";
import { isoDate } from "../format.js";
import { splitActionMarker, type ActionKind } from "../chat/action-marker.js";
import { splitStyleTag } from "../chat/style-prefix.js";
import { localDayOf } from "./session-freshness.js";

/** One session row as the list shows it. */
export interface SessionRow {
  file: string;
  /** 「09:12」 local time. */
  time: string;
  kind: "course" | "control" | "free";
  /** Course slug when known (opening it switches to that course), else null. */
  slug: string | null;
  /** 「离散」 for a course, 「总控」 / 「自由」 otherwise. */
  tag: string;
  title: string;
  count: number;
  current: boolean;
}

export interface SessionGroup {
  date: string;
  label: string;
  rows: SessionRow[];
}

export interface SessionListContext {
  current: string | null;
  /** `YYYY-MM-DD` local. */
  today: string;
  /** `new Date().getTimezoneOffset()`. */
  tzOffsetMinutes: number;
  /** `Object.values(settings.controlSessions)`. */
  controlFiles: string[];
  /** `settings.courseSessions` (slug → file). */
  courseSessions: Record<string, string>;
  /** slug → 短名（cycle month 的 names；没有时用课程标题）. */
  courseNames: Record<string, string>;
  /** cycle month 的 lessons（可空对象）. */
  lessons: Record<string, CycleLesson[]>;
}

/** A row title is at most this long, with 「…」 past it. */
const TITLE_MAX = 30;

const pad = (value: number): string => String(value).padStart(2, "0");

/** Local `HH:MM` of an epoch-ms instant (same clock math as `localDayOf`). */
function localTimeOf(epochMs: number, tzOffsetMinutes: number): string {
  const local = new Date(epochMs - tzOffsetMinutes * 60_000);
  return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/** The day before a `YYYY-MM-DD`, or the input when it is not a date. */
function previousDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return isoDate(new Date(y, m - 1, d - 1));
}

/** The first line of a message body, without a leading `/skill:` command. */
function firstLine(body: string): string {
  const line = (body.split("\n", 1)[0] ?? "").replace(/^\/skill:\S+\s*/, "").trim();
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX)}…` : line;
}

/** The slug a transcript belongs to, remembered in settings or carried by its opening action marker. */
function slugOf(meta: SessionMeta, markerSlug: string | null, ctx: SessionListContext): string | null {
  if (markerSlug) return markerSlug;
  const remembered = Object.entries(ctx.courseSessions).find(([, file]) => file === meta.file)?.[0];
  // Sessions opened before the action marker existed still name their course file.
  if (remembered) return remembered;
  // Only an opening (开始今天的… / 继续 …) names its own course file; other prompts may mention others.
  const body = splitStyleTag(meta.firstUser).body;
  if (!body.startsWith("开始今天的") && !body.startsWith("继续 ")) return null;
  return /\/wiki\/courses\/([a-z0-9-]+)\.md/.exec(body)?.[1] ?? null;
}

/**
 * The pin split into its course short name and its lesson id.
 *
 * 「离散 D2」→ head「离散」, id「D2」; 「C 语言 D1」→ head「C 语言」, id「D1」 (a short
 * name may itself contain a space, so the id — not the first word — splits it).
 * A pin with no id at the end falls back to the first word as the short name.
 */
function pinParts(pin: string): { head: string; id: string } {
  // The id is the pin's tail: a lesson 「D1」 or a review 「R1-D2」.
  const tail = /(?:^|\s)((?:R\d+-)?D\d+)\s*$/.exec(pin);
  if (tail) {
    const id = tail[1] ?? pin;
    return { head: pin.slice(0, tail.index).trim() || id, id };
  }
  const [first = ""] = pin.split(/\s/, 1);
  return { head: first, id: pin.slice(first.length).trim() || pin };
}

/** The pin's course short name (「离散 D2」→「离散」). */
function pinHead(pin: string): string {
  return pinParts(pin).head;
}

/** The guard role a row's session opens with (see `SessionRole` in shared/protocol). */
export function roleOfRow(row: SessionRow | undefined): SessionRole {
  if (row?.kind === "control") return { kind: "control" };
  if (row?.kind === "course" && row.slug !== null) return { kind: "course", slug: row.slug };
  // A transcript nothing identifies (总控/course lists not loaded, or a plain
  // question) must not inherit 总控's permissions: everything unknown is free.
  return { kind: "free" };
}

/** The row title, per the list's rules: 总控 = 今日简报, course = 课次 + 内容, free = first line. */
function rowTitle(
  meta: SessionMeta,
  kind: SessionRow["kind"],
  slug: string | null,
  body: string,
  date: string,
  ctx: SessionListContext,
  action: ActionKind | null,
): string {
  if (kind === "control") return strings.sessions.controlTitle;
  if (kind === "course" && meta.pin !== null) {
    // 「离散 D2」→ the lesson id after the course's short name; a bare id keeps itself.
    const { id } = pinParts(meta.pin);
    const lesson =
      slug === null ? undefined : ctx.lessons[date]?.find((item) => item.course === slug && item.id === id);
    return lesson ? `${id} ${lesson.content}` : id;
  }
  if (kind === "course") {
    // No 今日要点 yet: name the opening action instead of echoing the prompt.
    if (action) return strings.actions[action];
    if (body.startsWith("开始今天的")) return strings.actions.open;
    if (body.startsWith("继续 ")) return strings.actions.resume;
  }
  return firstLine(body) || strings.sessions.empty;
}

function rowOf(meta: SessionMeta, ctx: SessionListContext): SessionRow {
  const date = localDayOf(meta.startedAt, ctx.tzOffsetMinutes);
  const marker = splitActionMarker(splitStyleTag(meta.firstUser).body);
  const control = ctx.controlFiles.includes(meta.file);
  const slug = control ? null : slugOf(meta, marker.slug, ctx);
  const kind: SessionRow["kind"] = control
    ? "control"
    : slug !== null || meta.pin !== null
      ? "course"
      : "free";
  const tag =
    kind === "control"
      ? strings.sessions.control
      : kind === "free"
        ? strings.sessions.free
        : slug !== null
          ? (ctx.courseNames[slug] ?? slug)
          : meta.pin !== null
            ? pinHead(meta.pin)
            : "";
  return {
    file: meta.file,
    time: localTimeOf(meta.startedAt, ctx.tzOffsetMinutes),
    kind,
    slug,
    tag,
    title: rowTitle(meta, kind, slug, marker.body, date, ctx, marker.action),
    count: meta.count,
    current: meta.file === ctx.current,
  };
}

/** 「今天 · 11-08 周日」 / 「昨天 · …」 / 「11-06 周五」, weekday from the shared table. */
function groupLabel(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday =
    strings.calendar.weekday[(new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1).getDay() + 6) % 7] ?? "";
  const base = `${date.slice(5)} 周${weekday}`;
  if (date === today) return `${strings.sessions.today} · ${base}`;
  if (date === previousDay(today)) return `${strings.sessions.yesterday} · ${base}`;
  return base;
}

/**
 * Rows grouped by local day, newest first inside and across groups.
 *
 * A transcript is 总控 when it is a remembered control session; otherwise a
 * course session when its opening marker or the remembered map names a course,
 * or when an assistant pin gives it a 「今日要点 · X」 title; otherwise free.
 */
export function sessionGroups(metas: SessionMeta[], ctx: SessionListContext): SessionGroup[] {
  const sorted = [...metas].sort((a, b) => b.startedAt - a.startedAt);
  const groups: SessionGroup[] = [];
  for (const meta of sorted) {
    const date = localDayOf(meta.startedAt, ctx.tzOffsetMinutes);
    let group = groups[groups.length - 1];
    if (!group || group.date !== date) {
      group = { date, label: groupLabel(date, ctx.today), rows: [] };
      groups.push(group);
    }
    group.rows.push(rowOf(meta, ctx));
  }
  return groups;
}
