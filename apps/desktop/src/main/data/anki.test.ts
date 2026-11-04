import { describe, expect, it } from "vitest";
import { ALLOWED_ANKI_ACTIONS, buildAnkiRequest, dueQuery, isAllowedAnkiAction } from "./anki.js";

describe("AnkiConnect read-only whitelist", () => {
  it("allows the read-only actions the status probe uses", () => {
    for (const action of ["version", "deckNames", "getNumCardsReviewedToday", "findCards"]) {
      expect(isAllowedAnkiAction(action)).toBe(true);
    }
  });

  it("refuses every writing action", () => {
    // A representative set of AnkiConnect's mutating actions.
    const writes = [
      "addNote",
      "addNotes",
      "updateNoteFields",
      "deleteNotes",
      "sync",
      "importPackage",
      "createDeck",
      "changeDeck",
      "storeMediaFile",
      "forgetCards",
      "answerCards",
    ];
    for (const action of writes) {
      expect(isAllowedAnkiAction(action)).toBe(false);
      expect(() => buildAnkiRequest(action)).toThrow(/只读/);
    }
    expect(ALLOWED_ANKI_ACTIONS).toHaveLength(4);
  });

  it("builds a v6 request body for allowed actions", () => {
    const body = JSON.parse(buildAnkiRequest("findCards", { query: "deck:X is:due" }));
    expect(body).toEqual({ action: "findCards", params: { query: "deck:X is:due" }, version: 6 });
  });

  it("counts a parent deck's own due cards without its subdecks", () => {
    expect(dueQuery("Link")).toBe('deck:"Link" -deck:"Link::*" is:due');
    expect(dueQuery('Say "hi"')).toBe('deck:"Say \\"hi\\"" -deck:"Say \\"hi\\"::*" is:due');
  });
});
