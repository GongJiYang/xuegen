import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/protocol.js";
import type { ThreadNote } from "../../skins/contract.js";
import { foldEarlier } from "./control-fold.js";

const TODAY = "2026-11-08";
/** Tests use the ISO date part as the local day. */
const localDay = (iso: string): string => iso.slice(0, 10);

function message(id: string, at?: string): ChatMessage {
  return { id, role: "user", markdown: id, streaming: false, toolCalls: [], ...(at ? { at } : {}) };
}

const NOTE_AT_2: ThreadNote = { beforeIndex: 2, text: "note" };
const NOTE_AT_5: ThreadNote = { beforeIndex: 5, text: "note" };

describe("foldEarlier", () => {
  it("leaves a transcript of only today's messages untouched", () => {
    const messages = [message("a", "2026-11-08T09:00:00Z"), message("b", "2026-11-08T10:00:00Z"), message("c")];
    const systemNotes = [NOTE_AT_2];
    expect(foldEarlier({ messages, systemNotes, today: TODAY, localDay, open: false })).toEqual({
      messages,
      systemNotes,
      older: null,
    });
  });

  it("folds the three yesterday messages and shifts the notes past them", () => {
    const messages = [
      message("a", "2026-11-05T09:00:00Z"),
      message("b", "2026-11-06T09:00:00Z"),
      message("c", "2026-11-07T09:00:00Z"),
      message("d", "2026-11-08T09:00:00Z"),
      message("e"),
    ];
    const systemNotes = [NOTE_AT_2, NOTE_AT_5];
    expect(foldEarlier({ messages, systemNotes, today: TODAY, localDay, open: false })).toEqual({
      messages: messages.slice(3),
      systemNotes: [{ beforeIndex: 2, text: "note" }],
      older: { count: 3, since: "2026-11-05" },
    });
  });

  it("keeps the whole transcript when the fold row is opened", () => {
    const messages = [message("a", "2026-11-07T09:00:00Z"), message("b", "2026-11-08T09:00:00Z")];
    const systemNotes = [NOTE_AT_2];
    const fold = foldEarlier({ messages, systemNotes, today: TODAY, localDay, open: true });
    expect(fold.messages).toBe(messages);
    expect(fold.systemNotes).toBe(systemNotes);
    expect(fold.older).toEqual({ count: 1, since: "2026-11-07" });
  });

  it("shows no messages when everything is older than today", () => {
    const messages = [message("a", "2026-11-05T09:00:00Z"), message("b", "2026-11-06T09:00:00Z")];
    const fold = foldEarlier({ messages, systemNotes: [], today: TODAY, localDay, open: false });
    expect(fold.messages).toEqual([]);
    expect(fold.older).toEqual({ count: 2, since: "2026-11-05" });
  });
});
