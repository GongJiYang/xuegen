import { describe, expect, it } from "vitest";
import { initialChatState } from "./chat-reducer.js";
import { isComposerDisabled, noticesFor, routeDismiss } from "./view-models.js";
import { MODEL_ERROR_SUMMARIES } from "./model-error.js";

describe("noticesFor", () => {
  it("surfaces a real error as an alert notice with its detail", () => {
    const notices = noticesFor({ ...initialChatState, errors: ["429 Too Many Requests"] });
    expect(notices).toContainEqual({
      tone: "error",
      text: MODEL_ERROR_SUMMARIES.rate,
      detail: "429 Too Many Requests",
    });
  });

  it("does not raise an alert for a user stop", () => {
    const stopped = noticesFor({ ...initialChatState, agentStatus: "ready", errors: ["已中止"] });
    expect(stopped.some((notice) => notice.tone === "error")).toBe(false);
  });
});

describe("isComposerDisabled", () => {
  it("is true only without a model", () => {
    expect(isComposerDisabled(initialChatState)).toBe(true);
    expect(
      isComposerDisabled({ ...initialChatState, models: [{ provider: "anthropic", id: "x", name: "X" }] }),
    ).toBe(false);
  });
});

describe("routeDismiss", () => {
  it("maps a list index past the skin notices to the right target", () => {
    expect(routeDismiss(0, 1, 2, true)).toEqual({ kind: "none" });
    expect(routeDismiss(1, 1, 2, true)).toEqual({ kind: "chat", index: 0 });
    expect(routeDismiss(2, 1, 2, true)).toEqual({ kind: "chat", index: 1 });
    expect(routeDismiss(3, 1, 2, true)).toEqual({ kind: "freshness" });
    expect(routeDismiss(3, 1, 2, false)).toEqual({ kind: "none" });
    expect(routeDismiss(0, 0, 1, false)).toEqual({ kind: "chat", index: 0 });
  });
});
