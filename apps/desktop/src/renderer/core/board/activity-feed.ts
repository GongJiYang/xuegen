/**
 * The 总控 right column as a feed (user 11-14): one card per turn — what the
 * user said, then what came of it. A turn that moved lessons lists the moves;
 * any other turn shows the answer's first sentence. The full answer opens in
 * the reader on demand.
 */

import type { ChatMessage } from "@shared/protocol.js";
import { actionLabel, legacyCommandLabel, splitActionMarker } from "../chat/action-marker.js";
import { splitStyleTag } from "../chat/style-prefix.js";
import { activityOf } from "../chat/activity.js";
import { strings } from "../strings.js";
import { changeLine, type PlanChange } from "./plan-diff.js";

/** How many change lines a card lists before 「还有 N 处」. */
export const CARD_CHANGES = 4;

/** A turn whose 计划 commits can be (or were) undone. */
export interface UndoState {
  status: "available" | "undoing" | "undone";
  error: string | null;
}

export interface ActivityCard {
  /** The turn's user message id (or the first assistant id for a turn without one). */
  id: string;
  /** One line of what the user said; "" for a turn that opens with an answer. */
  ask: string;
  /** The answer's first sentence; null while nothing was said yet. */
  summary: string | null;
  /** Every change this turn made to the schedule, worded; null when not compared. */
  changes: string[] | null;
  /** null when this turn committed nothing undoable. */
  undo: UndoState | null;
  /** Tool calls made so far. */
  steps: number;
  /** 「正在查资料：cat …」 / 「正在动手：…」 while the turn is running (the transcript's activity line). */
  doing: string | null;
  busy: boolean;
  failed: boolean;
  /** The turn's messages (user first), for the reader. */
  messages: ChatMessage[];
}

const ASK_MAX = 60;
const SUMMARY_MAX = 80;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** The refresh notes are instructions to 学根, not something the user wrote. */
const NOTES = [strings.chat.refreshNote, strings.chat.controlRefreshNote, strings.chat.undoneNote];

function askLine(markdown: string): string {
  const { body: styled } = splitStyleTag(markdown);
  const note = NOTES.find((candidate) => styled.startsWith(candidate));
  const marked = splitActionMarker(note ? styled.slice(note.length).trimStart() : styled);
  if (marked.action !== null) return actionLabel(marked.action, marked.courseTitle);
  const legacy = legacyCommandLabel(marked.body);
  if (legacy !== null) return legacy;
  const line = marked.body.split("\n").find((part) => part.trim() !== "") ?? "";
  return clip(line.trim(), ASK_MAX);
}

/** The first sentence of the answer, Markdown marks dropped. */
export function firstSentence(markdown: string): string | null {
  let fenced = false;
  const prose = markdown.split("\n").filter((line) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced;
  });
  const plain = prose
    .map((line) => line.replace(/^\s*(#+|>|[-*+]|\d+\.)\s+/, "").trim())
    .filter((line) => line !== "" && !/^(\||---|\$\$)/.test(line))
    .join(" ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "");
  if (plain === "") return null;
  const end = plain.search(/[。！？!?]/);
  return clip(end === -1 ? plain : plain.slice(0, end + 1), SUMMARY_MAX);
}

function groupTurns(messages: readonly ChatMessage[]): ChatMessage[][] {
  const turns: ChatMessage[][] = [];
  for (const message of messages) {
    const last = turns[turns.length - 1];
    if (message.role === "user" || last === undefined) turns.push([message]);
    else last.push(message);
  }
  return turns;
}

export function activityCards(input: {
  messages: readonly ChatMessage[];
  /** Turn id → what that turn changed (only turns compared this run). */
  changes: Readonly<Record<string, PlanChange[]>>;
  /** Turn id → its undo state (only turns with 计划 commits this run). */
  undo?: Readonly<Record<string, UndoState>>;
  names: Readonly<Record<string, string>>;
  streaming: boolean;
}): ActivityCard[] {
  const turns = groupTurns(input.messages);
  return turns.map((turn, index) => {
    const head = turn[0] as ChatMessage;
    const answers = turn.filter((message) => message.role === "assistant");
    const calls = answers.flatMap((message) => message.toolCalls);
    const busy = input.streaming && index === turns.length - 1;
    const changes = input.changes[head.id];
    return {
      id: head.id,
      ask: head.role === "user" ? askLine(head.markdown) : "",
      summary: firstSentence(answers.map((message) => message.markdown).join("\n")),
      changes: changes === undefined ? null : changes.map((change) => changeLine(change, input.names)),
      undo: input.undo?.[head.id] ?? null,
      steps: calls.length,
      doing:
        busy && answers.length > 0
          ? (activityOf(answers[answers.length - 1] as ChatMessage, false)?.label ?? null)
          : null,
      busy,
      failed: answers.some((message) => message.errorMessage !== undefined && message.retry !== "recovered"),
      messages: turn,
    };
  });
}
