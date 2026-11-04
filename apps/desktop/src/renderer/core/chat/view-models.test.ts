import { describe, expect, it } from "vitest";
import { initialChatState } from "./chat-reducer.js";
import { isComposerDisabled, noticesFor } from "./view-models.js";
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
