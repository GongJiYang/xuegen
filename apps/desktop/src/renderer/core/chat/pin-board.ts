/**
 * What the chat pins beside the transcript during a lesson: the latest
 * 「今日要点」 box (`> [!abstract] …` with `- **术语**：定义` lines) and the
 * latest round of 检查理解 questions (`> [!question]` callouts, one per
 * question). Pure: derived from the messages on every render.
 */

import type { ChatMessage } from "@shared/protocol.js";
import { parseContent } from "../content/parse-content.js";

export interface PinDefinition {
  /** The bold term, or "" for a plain line. */
  term: string;
  /** The definition (inline Markdown). */
  body: string;
}

export interface PinBoard {
  /** The latest 今日要点 box and the message it came from, or null. */
  defs: { title: string; items: PinDefinition[]; messageId: string } | null;
  /** The latest round of questions (inline Markdown, one per callout) and its message, or null. */
  questions: { items: string[]; messageId: string } | null;
}

const ABSTRACT_OPENER = /^>\s*\[!abstract\][+-]?\s*(.*)$/i;
const TERM_LINE = /^[-*]\s+\*\*(.+?)\*\*\s*[:：]\s*(.+)$/;
const PLAIN_LINE = /^[-*]\s+(.+)$/;

/** The last `> [!abstract]` box in one message, or null when it has none or no list lines. */
export function abstractBox(markdown: string): { title: string; items: PinDefinition[] } | null {
  const lines = markdown.split("\n");
  let found: { title: string; items: PinDefinition[] } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const opener = ABSTRACT_OPENER.exec(lines[index] ?? "");
    if (!opener) continue;
    const items: PinDefinition[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next] ?? "";
      if (!line.startsWith(">")) break;
      const body = line.replace(/^>\s?/, "").trim();
      const term = TERM_LINE.exec(body);
      if (term) {
        items.push({ term: (term[1] ?? "").trim(), body: (term[2] ?? "").trim() });
        continue;
      }
      const plain = PLAIN_LINE.exec(body);
      if (plain) items.push({ term: "", body: (plain[1] ?? "").trim() });
    }
    if (items.length > 0) found = { title: (opener[1] ?? "").trim(), items };
  }
  return found;
}

/** A question callout's body as one line of inline Markdown. */
function questionText(body: string): string {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");
}

/** The pin board for a transcript, or null when there is nothing to pin. */
export function pinBoard(messages: ChatMessage[]): PinBoard | null {
  let defs: PinBoard["defs"] = null;
  let questions: PinBoard["questions"] = null;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const box = abstractBox(message.markdown);
    if (box) defs = { ...box, messageId: message.id };
    const items = parseContent(message.markdown).flatMap((node) =>
      node.kind === "callout" && node.calloutType === "question" ? [questionText(node.body)] : [],
    );
    if (items.length > 0) questions = { items, messageId: message.id };
  }
  return defs || questions ? { defs, questions } : null;
}
