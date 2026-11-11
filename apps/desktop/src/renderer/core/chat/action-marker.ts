/**
 * A marker on the last line of a message the interface sends for the user
 * (开课, 收课 …): `⟦xuegen:<action>⟧` or `⟦xuegen:<action>|<slug>|<course title>⟧`.
 * The transcript folds such a message into a one-line label (see message-renderer).
 */

import { strings } from "../strings.js";

export const ACTION_KINDS = ["open", "resume", "plan", "summary", "cards", "close", "close-skip", "checkpoint", "continue", "brief", "undo-close"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export function withActionMarker(text: string, action: ActionKind, course?: { slug: string; title: string }): string {
  const tail = course ? `|${course.slug}|${course.title.replace(/[|⟧\n]/g, " ")}` : "";
  return `${text}\n⟦xuegen:${action}${tail}⟧`;
}

const MARKER = /\n?⟦xuegen:([a-z-]+)(?:\|([^|⟧\n]+)\|([^⟧\n]+))?⟧\s*$/;

export function splitActionMarker(body: string): { action: ActionKind | null; slug: string | null; courseTitle: string | null; body: string } {
  const match = MARKER.exec(body);
  const action = match?.[1] as ActionKind | undefined;
  if (!match || !action || !(ACTION_KINDS as readonly string[]).includes(action)) {
    return { action: null, slug: null, courseTitle: null, body };
  }
  return { action, slug: match[2] ?? null, courseTitle: match[3] ?? null, body: body.slice(0, match.index).trimEnd() };
}

/** The folded label: 「开今天的课 · 离散数学（Epp, 5th ed）」, or just the action name. */
export function actionLabel(action: ActionKind, courseTitle: string | null): string {
  const name = strings.actions[action];
  return courseTitle ? `${name} · ${courseTitle}` : name;
}

/** A pre-marker command the UI sent before action markers existed (`/skill:<name> …`): fold it too. */
export function legacyCommandLabel(body: string): string | null {
  const match = /^\/skill:([a-z0-9-]*)/.exec(body.trimStart());
  if (!match) return null;
  return match[1] ? `${strings.actions.legacy} · ${match[1]}` : strings.actions.legacy;
}
