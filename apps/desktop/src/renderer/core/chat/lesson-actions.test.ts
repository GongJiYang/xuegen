import { describe, expect, it } from "vitest";
import { strings } from "../strings.js";
import { lessonActions } from "./lesson-actions.js";
import { splitActionMarker, withActionMarker } from "./action-marker.js";
import type { ChatMessage } from "@shared/protocol.js";

const answered: ChatMessage[] = [{ id: "a1", role: "assistant", markdown: "讲解", streaming: false, toolCalls: [] }];

function user(text: string): ChatMessage {
  return { id: "u1", role: "user", markdown: text, streaming: false, toolCalls: [] };
}

describe("lessonActions", () => {
  it("is empty outside a course session", () => {
    expect(lessonActions(null, answered)).toEqual([]);
  });

  it("is empty before 学根 has answered anything", () => {
    expect(lessonActions("ctm", [])).toEqual([]);
    expect(lessonActions("ctm", [{ ...answered[0]!, markdown: "  " }])).toEqual([]);
  });

  it("offers 总结 · 制卡 · 收课 with the same prompts the slash commands send", () => {
    const actions = lessonActions("ctm", answered);
    expect(actions.map((action) => action.label)).toEqual([strings.lesson.summary, strings.lesson.cards, strings.lesson.close]);
    const [summary, cards, close] = actions;
    expect(splitActionMarker(summary!.text)).toMatchObject({ action: "summary", body: strings.commands.summarizePrompt });
    expect(splitActionMarker(cards!.text)).toMatchObject({ action: "cards", body: strings.cards.draftPrompt });
    expect(splitActionMarker(close!.text)).toMatchObject({ action: "close", body: strings.commands.endTodayPrompt });
  });

  it("carries a hint per button and a 「收课 ▾」 menu on 收课 only", () => {
    const [summary, cards, close] = lessonActions("ctm", answered);
    expect(summary?.hint).toBe(strings.lesson.summaryHint);
    expect(cards?.hint).toBe(strings.lesson.cardsHint);
    expect(close?.hint).toBe(strings.lesson.closeHint);
    expect(summary?.options).toEqual([]);
    expect(close?.options.map((option) => option.label)).toEqual([
      strings.lesson.closePlain,
      strings.lesson.closeNoWiki,
      strings.lesson.closeNoRecord,
    ]);
    expect(splitActionMarker(close?.options[2]?.text ?? "")).toMatchObject({ action: "close-skip", body: strings.lesson.noRecordPrompt });
  });

  it("offers 撤销这次收课 · 制卡 right after a 收课 answer", () => {
    const messages: ChatMessage[] = [user(withActionMarker("今天学到这里", "close")), ...answered];
    const actions = lessonActions("ctm", messages);
    expect(actions.map((action) => action.label)).toEqual([strings.lesson.undoClose, strings.lesson.cards]);
    expect(splitActionMarker(actions[0]!.text)).toMatchObject({ action: "undo-close", body: strings.lesson.undoClosePrompt });
    expect(actions[0]?.hint).toBe(strings.lesson.undoCloseHint);
  });

  it("sends 撤销这次收课 through course_close undo, not the old 「抵消」 step", () => {
    const messages: ChatMessage[] = [user(withActionMarker("今天学到这里", "close")), ...answered];
    const body = splitActionMarker(lessonActions("ctm", messages)[0]!.text).body;
    expect(body).toContain("course_close");
    expect(body).toContain("undo");
    expect(body).not.toContain("抵消");
    expect(body).not.toContain("退回 [ ]");
  });

  it("stays on the regular buttons after 「不记录，直接结束」 (nothing was recorded, so nothing to undo)", () => {
    const noRecord = lessonActions("ctm", answered)[2]!.options[2]!;
    expect(noRecord.label).toBe(strings.lesson.closeNoRecord);
    expect(splitActionMarker(noRecord.text).action).toBe("close-skip");
    const messages: ChatMessage[] = [user(noRecord.text), ...answered];
    expect(lessonActions("ctm", messages).map((action) => action.label)).toEqual([
      strings.lesson.summary,
      strings.lesson.cards,
      strings.lesson.close,
    ]);
  });

  it("still offers 撤销这次收课 after 「收课，不写概念页」", () => {
    const noWiki = lessonActions("ctm", answered)[2]!.options[1]!;
    expect(splitActionMarker(noWiki.text).action).toBe("close");
    const messages: ChatMessage[] = [user(noWiki.text), ...answered];
    expect(lessonActions("ctm", messages).map((action) => action.label)).toEqual([
      strings.lesson.undoClose,
      strings.lesson.cards,
    ]);
  });

  it("stays on the regular buttons when the last user message was not 收课", () => {
    const messages: ChatMessage[] = [
      user(withActionMarker("今天学到这里", "close")),
      ...answered,
      user("再问一个"),
      { id: "a2", role: "assistant", markdown: "继续讲", streaming: false, toolCalls: [] },
    ];
    expect(lessonActions("ctm", messages).map((action) => action.label)).toEqual([
      strings.lesson.summary,
      strings.lesson.cards,
      strings.lesson.close,
    ]);
  });
});
