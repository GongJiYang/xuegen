/**
 * The title bar's session tabs (design `docs/desktop/mockups/tabs.html`).
 *
 * 「总控」 stays first; after it come the course sessions opened today, in the
 * order they were opened (session files are named by their start instant, so
 * the file name sorts them). A transcript opened from 「＋」 that is neither gets
 * a tab of its own while it is open and loses it once the learner switches away.
 * Only the open session can be answering, so only its tab carries the dot.
 */

import type { CycleDay } from "@shared/data-protocol.js";
import type { SessionRow } from "./session-list.js";
import { strings } from "../strings.js";

export type SessionTabKind = "control" | "course" | "other";

export interface SessionTab {
  /** `control`, `course:<slug>` or `file:<file>`. */
  key: string;
  kind: SessionTabKind;
  label: string;
  /** The transcript the tab opens; null for 总控 before its session exists. */
  file: string | null;
  slug: string | null;
  active: boolean;
  busy: boolean;
}

export interface SessionTabsInput {
  /** The cycle id (「C1」); null outside every cycle, where there are no tabs. */
  cycleId: string | null;
  isControl: boolean;
  currentFile: string | null;
  /** `YYYY-MM-DD` local. */
  today: string;
  courseSessions: Record<string, string>;
  courseStartedOn: Record<string, string>;
  /** Every row of the session list (any day); matched by file. */
  rows: SessionRow[];
  /** Course slug → short name (「离散」). */
  names: Record<string, string>;
  /** Today's cycle day, for a lesson id before the session has a pin. */
  day: CycleDay | null;
  /** The open session's title, for a tab opened from 「＋」. */
  currentTitle: string | null;
  streaming: boolean;
}

const LESSON_ID = /^(?:R\d+-)?D\d+\b/;

const baseName = (file: string): string => file.slice(file.lastIndexOf("/") + 1);

/**
 * Action names that say what the session is about better than a guessed lesson
 * id (a 周核实 session is not 「D1」); the lesson openings are left out, since
 * there the lesson id is the better name.
 */
const ACTION_TITLES = new Set<string>([
  strings.actions.verify,
  strings.actions.plan,
  strings.actions.checkpoint,
  strings.actions.accompany,
]);

/**
 * What a course tab shows after the course name: the row's pinned lesson id,
 * else the row's action name when it is one of {@link ACTION_TITLES}, else
 * today's first open lesson of that course.
 */
function lessonId(slug: string, row: SessionRow | undefined, day: CycleDay | null): string | null {
  const pinned = row ? LESSON_ID.exec(row.title)?.[0] : undefined;
  if (pinned) return pinned;
  if (row && ACTION_TITLES.has(row.title)) return row.title;
  const lessons =
    day === null ? [] : [...day.lessons, ...day.overdue].filter((lesson) => lesson.course === slug);
  return (lessons.find((item) => item.done !== true) ?? lessons[0])?.id ?? null;
}

export function sessionTabs(input: SessionTabsInput): SessionTab[] {
  if (input.cycleId === null) return [];
  const byFile = new Map(input.rows.map((row) => [row.file, row]));
  const tab = (partial: Omit<SessionTab, "active" | "busy">, active: boolean): SessionTab => ({
    ...partial,
    active,
    busy: active && input.streaming,
  });

  const tabs: SessionTab[] = [
    tab(
      {
        key: "control",
        kind: "control",
        label: strings.control.title(input.cycleId),
        file: null,
        slug: null,
      },
      input.isControl,
    ),
  ];

  const courses = Object.entries(input.courseSessions)
    .filter(([slug]) => input.courseStartedOn[slug] === input.today)
    .sort(([, a], [, b]) => baseName(a).localeCompare(baseName(b)));
  for (const [slug, file] of courses) {
    const name = input.names[slug] ?? byFile.get(file)?.tag ?? slug;
    const id = lessonId(slug, byFile.get(file), input.day);
    tabs.push(
      tab(
        { key: `course:${slug}`, kind: "course", label: id ? `${name} ${id}` : name, file, slug },
        !input.isControl && input.currentFile === file,
      ),
    );
  }

  const file = input.currentFile;
  if (!input.isControl && file !== null && !tabs.some((item) => item.file === file)) {
    const row = byFile.get(file);
    const label = row
      ? row.kind === "course"
        ? `${row.tag} ${LESSON_ID.exec(row.title)?.[0] ?? row.title}`
        : row.title
      : input.currentTitle;
    tabs.push(
      tab(
        {
          key: `file:${file}`,
          kind: "other",
          label: label ?? strings.chat.freeSession,
          file,
          slug: row?.slug ?? null,
        },
        true,
      ),
    );
  }
  return tabs;
}

/** The tab `step` places after (or before, with -1) the active one, wrapping around. */
export function neighbourTab<T extends { active: boolean }>(tabs: T[], step: 1 | -1): T | null {
  if (tabs.length < 2) return null;
  const at = tabs.findIndex((item) => item.active);
  const from = at === -1 ? 0 : at;
  return tabs[(from + step + tabs.length) % tabs.length] ?? null;
}

/**
 * The keys of the tabs that do not fit in `available` pixels and fold into
 * 「＋」 (tabs.html: 不设上限，多出来的收进「＋」). 总控 (the first tab) and the
 * open tab always stay; the rest keep their order and fill what room is left.
 */
export function fitTabs(
  tabs: readonly { key: string; active: boolean }[],
  widths: readonly number[],
  available: number,
  moreWidth: number,
): string[] {
  const total = widths.reduce((sum, width) => sum + width, moreWidth);
  if (total <= available) return [];
  const kept = (index: number): boolean => index === 0 || tabs[index]!.active;
  let room = available - moreWidth;
  tabs.forEach((_, index) => {
    if (kept(index)) room -= widths[index] ?? 0;
  });
  const hidden: string[] = [];
  tabs.forEach((tab, index) => {
    if (kept(index)) return;
    const width = widths[index] ?? 0;
    if (hidden.length === 0 && width <= room) room -= width;
    else hidden.push(tab.key);
  });
  return hidden;
}
