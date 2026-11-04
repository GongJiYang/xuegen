/**
 * Builds the teaching-style prefix a user message carries to the agent.
 *
 * The `teach` skill routes on a `[风格：X]` prefix at the start of a message (see
 * `skills/teach/SKILL.md`). The renderer's core adds it at send time so the
 * transcript the user sees stays clean; the id -> label mapping comes from the
 * shared table so the marker and any UI label never diverge.
 */

import { TEACHING_STYLE_LABELS, type TeachingStyle } from "@shared/protocol.js";

/** The label shown for a style (single source: the shared label table). */
export function styleLabel(style: TeachingStyle): string {
  return TEACHING_STYLE_LABELS.find((entry) => entry.id === style)?.label ?? style;
}

/**
 * Prefix `text` with the style marker for `style`.
 *
 * Returns the text unchanged when it is empty, and never double-prefixes a
 * message that already starts with a `[风格：…]` marker.
 */
export function withStylePrefix(style: TeachingStyle, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/^\[风格[:：]/.test(trimmed)) return trimmed;
  const tag = `[风格：${styleLabel(style)}]`;
  // Pi only expands `/skill:<name>` when it is the very first token, so the tag
  // goes after the command, into the request text the skill receives.
  const skill = trimmed.match(/^(\/skill:\S+)\s*([\s\S]*)$/);
  if (skill) {
    const rest = skill[2] ?? "";
    if (/^\[风格[:：]/.test(rest)) return trimmed;
    return rest ? `${skill[1]} ${tag} ${rest}` : `${skill[1]} ${tag}`;
  }
  // Any other slash text is a command, not a message: never tag it.
  if (trimmed.startsWith("/")) return trimmed;
  return `${tag} ${trimmed}`;
}

/**
 * Split a leading `[风格：X]` marker off a message.
 *
 * The agent echoes the user's message verbatim, so a message sent with a style
 * prefix arrives back with it. The transcript shows the marker as a tag rather
 * than inline text, so the display body drops it: this returns the label and the
 * remaining text. A message without a marker returns an empty label and its text
 * unchanged.
 */
export function splitStyleTag(markdown: string): { styleTag: string | null; body: string } {
  // A `/skill:` message comes back expanded: the whole SKILL.md in a
  // `<skill name="…">…</skill>` block, then the user's request. Show it the way
  // the user typed it — `/skill:<name> request` — not the skill's full text.
  const skill = markdown.match(/^<skill name="([^"]+)"[^>]*>[\s\S]*?<\/skill>\s*([\s\S]*)$/);
  if (skill) {
    const inner = splitStyleTag(skill[2] ?? "");
    const body = inner.body.trim() ? `/skill:${skill[1]} ${inner.body.trim()}` : `/skill:${skill[1]}`;
    return { styleTag: inner.styleTag, body };
  }
  // The live echo is the text as sent: `/skill:<name> [风格：X] request`.
  const command = markdown.match(/^(\/skill:\S+)\s+\[风格[:：]\s*([^\]]*)\]\s*([\s\S]*)$/);
  if (command) {
    const label = command[2]?.trim() ?? "";
    const rest = command[3]?.trim() ?? "";
    return { styleTag: label || null, body: rest ? `${command[1]} ${rest}` : (command[1] ?? "") };
  }
  const match = markdown.match(/^\[风格[:：]\s*([^\]]*)\]\s*([\s\S]*)$/);
  if (!match) return { styleTag: null, body: markdown };
  const label = match[1]?.trim() ?? "";
  return { styleTag: label || null, body: match[2] ?? "" };
}
