import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_ANKI_ACTIONS,
  ANKI_ENDPOINT,
  ankiEndpoint,
  buildAnkiRequest,
  dueQuery,
  isAllowedAnkiAction,
} from "./anki.js";

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

describe("ankiEndpoint / XUEGEN_ANKI_URL", () => {
  it("uses a valid loopback override", () => {
    expect(ankiEndpoint({ XUEGEN_ANKI_URL: "http://127.0.0.1:9876" })).toBe("http://127.0.0.1:9876");
    expect(ankiEndpoint({ XUEGEN_ANKI_URL: "http://localhost:9876" })).toBe("http://localhost:9876");
  });

  it("falls back to the default when unset", () => {
    expect(ankiEndpoint({})).toBe(ANKI_ENDPOINT);
  });

  it("warns and falls back on a malformed value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(ankiEndpoint({ XUEGEN_ANKI_URL: "8765" })).toBe(ANKI_ENDPOINT);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("refuses a non-local address", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(ankiEndpoint({ XUEGEN_ANKI_URL: "http://example.com:8765" })).toBe(ANKI_ENDPOINT);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
