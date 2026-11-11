/**
 * The buttons a course session shows beside the composer (总结 · 制卡 · 收课).
 *
 * Each text is the same prompt the matching `/` command sends, carrying its
 * action marker so the transcript folds it into a one-line label; `hint` says
 * what the click changes, and `options` is the 「收课 ▾」 menu (empty for the
 * other buttons). Pure: the active course slug is an argument, and the list is
 * empty outside a course or before 学根 has answered anything in the session
 * (nothing to sum up yet). After a 收课 answer the buttons switch to
 * 「撤销这次收课 · 制卡」 — the checks just went down, so the undo is offered
 * while it still applies.
 */

import type { ChatMessage } from "@shared/protocol.js";
import { strings } from "../strings.js";
import { splitActionMarker, withActionMarker } from "./action-marker.js";
import { hasAnswer } from "./has-answer.js";

export interface LessonAction {
  label: string;
  hint: string;
  text: string;
  /** The ▾ menu entries; empty means the button runs its own text directly. */
  options: { label: string; text: string }[];
}

/** The buttons a course session shows beside the composer (none outside a course). */
export function lessonActions(activeCourse: string | null, messages: readonly ChatMessage[]): LessonAction[] {
  if (!activeCourse) return [];
  if (!hasAnswer(messages)) return [];

  const cards: LessonAction = {
    label: strings.lesson.cards,
    hint: strings.lesson.cardsHint,
    text: withActionMarker(strings.cards.draftPrompt, "cards"),
    options: [],
  };

  // Just closed: the last thing the learner asked was 收课 and 学根 answered.
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  const closed =
    lastUserIndex !== -1 &&
    splitActionMarker(messages[lastUserIndex]?.markdown ?? "").action === "close" &&
    hasAnswer(messages.slice(lastUserIndex + 1));
  if (closed) {
    return [
      {
        label: strings.lesson.undoClose,
        hint: strings.lesson.undoCloseHint,
        text: withActionMarker(strings.lesson.undoClosePrompt, "undo-close"),
        options: [],
      },
      cards,
    ];
  }

  const closeText = withActionMarker(strings.commands.endTodayPrompt, "close");
  return [
    {
      label: strings.lesson.summary,
      hint: strings.lesson.summaryHint,
      text: withActionMarker(strings.commands.summarizePrompt, "summary"),
      options: [],
    },
    cards,
    {
      label: strings.lesson.close,
      hint: strings.lesson.closeHint,
      text: closeText,
      options: [
        { label: strings.lesson.closePlain, text: closeText },
        {
          label: strings.lesson.closeNoWiki,
          text: withActionMarker(strings.commands.endTodayPrompt + strings.lesson.closeNoWikiSuffix, "close"),
        },
        { label: strings.lesson.closeNoRecord, text: withActionMarker(strings.lesson.noRecordPrompt, "close-skip") },
      ],
    },
  ];
}
