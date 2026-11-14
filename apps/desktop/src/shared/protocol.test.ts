import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./protocol.js";
import {
  assertNever,
  isBodyFont,
  isRetryState,
  withValidRetry,
  isDesktopSettings,
  isHostToAgentMessage,
  isSessionRole,
  sessionRoleOrFree,
  isTeachingStyle,
  normalizeCourseStartedOn,
  normalizeDesktopSettings,
  normalizeDisabledSkills,
  normalizeSkinOptions,
  BODY_FONTS,
  BODY_SCALE_MAX,
  BODY_SCALE_MIN,
  DEFAULT_DESKTOP_SETTINGS,
} from "./protocol.js";

describe("isHostToAgentMessage", () => {
  it("accepts every valid request shape", () => {
    const valid = [
      { type: "init" },
      { type: "abort" },
      { type: "new-session" },
      { type: "continue-session" },
      { type: "list-models" },
      { type: "list-commands", disabledSkills: [] },
      { type: "list-commands", disabledSkills: ["reading"] },
      { type: "prompt", text: "hi" },
      { type: "set-model", provider: "anthropic", id: "claude" },
      { type: "new-session", role: { kind: "control" } },
      { type: "new-session", role: { kind: "course", slug: "discrete-math-epp" } },
      { type: "open-session", requestId: "r1", sessionFile: null, role: { kind: "free" } },
      { type: "open-session", requestId: "r1", sessionFile: "/home/sessions/a.jsonl" },
    ];
    for (const message of valid) {
      expect(isHostToAgentMessage(message)).toBe(true);
    }
  });

  it("rejects malformed and unknown messages", () => {
    const invalid: unknown[] = [
      null,
      undefined,
      42,
      "prompt",
      {},
      { type: "unknown" },
      { type: "prompt" },
      { type: "prompt", text: 7 },
      { type: "set-model", provider: "anthropic" },
      { type: "set-model", provider: 1, id: "x" },
      { type: "list-commands" },
      { type: "list-commands", disabledSkills: "reading" },
      { type: "list-commands", disabledSkills: [1] },
      { type: "ready", state: {} },
      // A role the guard cannot turn into a permission set is refused outright.
      { type: "new-session", role: { kind: "admin" } },
      { type: "new-session", role: { kind: "course" } },
      { type: "new-session", role: { kind: "course", slug: "Discrete Math" } },
      { type: "new-session", role: "free" },
      { type: "open-session", requestId: "r1", sessionFile: null, role: { kind: "course", slug: "../x" } },
      { type: "open-session", requestId: "r1" },
    ];
    for (const message of invalid) {
      expect(isHostToAgentMessage(message)).toBe(false);
    }
  });
});

describe("isHostToAgentMessage: sessionId", () => {
  it("accepts the three session-scoped requests with and without a session id", () => {
    const valid = [
      { type: "prompt", text: "hi" },
      { type: "prompt", text: "hi", sessionId: "session-1" },
      { type: "abort" },
      { type: "abort", sessionId: "session-1" },
      { type: "compact" },
      { type: "compact", sessionId: "session-1" },
    ];
    for (const message of valid) expect(isHostToAgentMessage(message)).toBe(true);
  });

  it("rejects a session id that is not a string", () => {
    const invalid: unknown[] = [
      { type: "prompt", text: "hi", sessionId: 7 },
      { type: "prompt", text: "hi", sessionId: null },
      { type: "prompt", text: "hi", sessionId: { id: "session-1" } },
      { type: "prompt", text: "hi", sessionId: ["session-1"] },
      { type: "abort", sessionId: 7 },
      { type: "abort", sessionId: null },
      { type: "abort", sessionId: { id: "session-1" } },
      { type: "compact", sessionId: 7 },
      { type: "compact", sessionId: null },
      { type: "compact", sessionId: { id: "session-1" } },
    ];
    for (const message of invalid) expect(isHostToAgentMessage(message)).toBe(false);
  });

  it("still requires the prompt text once a session id is present", () => {
    expect(isHostToAgentMessage({ type: "prompt", sessionId: "session-1" })).toBe(false);
    expect(isHostToAgentMessage({ type: "prompt", text: 7, sessionId: "session-1" })).toBe(false);
  });
});

describe("isSessionRole / sessionRoleOrFree", () => {
  it("accepts the three role shapes with a slug-shaped course id", () => {
    expect(isSessionRole({ kind: "control" })).toBe(true);
    expect(isSessionRole({ kind: "free" })).toBe(true);
    expect(isSessionRole({ kind: "course", slug: "discrete-math-epp" })).toBe(true);
  });

  it("rejects a malformed role: a role the guard cannot enforce must not arrive", () => {
    for (const value of [
      null,
      undefined,
      "control",
      {},
      { kind: "admin" },
      { kind: "course" },
      { kind: "course", slug: "" },
      { kind: "course", slug: "Discrete Math" },
      { kind: "course", slug: "../ctm" },
      { kind: "course", slug: 7 },
    ]) {
      expect(isSessionRole(value)).toBe(false);
    }
  });

  it("falls back to free instead of guessing a permission set", () => {
    expect(sessionRoleOrFree({ kind: "course", slug: "ctm" })).toEqual({ kind: "course", slug: "ctm" });
    expect(sessionRoleOrFree(undefined)).toEqual({ kind: "free" });
    expect(sessionRoleOrFree({ kind: "course" })).toEqual({ kind: "free" });
  });
});

describe("assertNever", () => {
  it("throws when reached, so an unhandled variant is loud", () => {
    expect(() => assertNever("oops" as never)).toThrow(/Unhandled variant/);
  });
});

describe("isDesktopSettings", () => {
  it("accepts a well-formed object and rejects other shapes", () => {
    expect(isDesktopSettings({ skin: "bare", bodyScale: 1 })).toBe(true);
    for (const value of [null, undefined, 1, "bare", {}, { skin: "bare" }, { skin: 1, bodyScale: 1 }]) {
      expect(isDesktopSettings(value)).toBe(false);
    }
  });
});

describe("normalizeDesktopSettings", () => {
  it("returns defaults for anything that is not a settings object", () => {
    expect(normalizeDesktopSettings(null)).toEqual(DEFAULT_DESKTOP_SETTINGS);
    expect(normalizeDesktopSettings({})).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });

  it("falls back to the default skin when the stored one is blank", () => {
    expect(normalizeDesktopSettings({ skin: "  ", bodyScale: 1 }).skin).toBe(
      DEFAULT_DESKTOP_SETTINGS.skin,
    );
  });

  it("defaults a missing or unknown bodyFont to pixel", () => {
    expect(normalizeDesktopSettings({ skin: "bare", bodyScale: 1 }).bodyFont).toBe("pixel");
    expect(normalizeDesktopSettings({ skin: "bare", bodyScale: 1, bodyFont: "comic" }).bodyFont).toBe(
      "pixel",
    );
    expect(normalizeDesktopSettings({ skin: "bare", bodyScale: 1, bodyFont: "kai" }).bodyFont).toBe(
      "kai",
    );
  });

  it("recognizes only the four body fonts", () => {
    for (const font of BODY_FONTS) expect(isBodyFont(font)).toBe(true);
    for (const value of ["comic", "", null, 1]) expect(isBodyFont(value)).toBe(false);
  });

  it("clamps bodyScale into the allowed range", () => {
    expect(normalizeDesktopSettings({ skin: "bare", bodyScale: 0.1 }).bodyScale).toBe(BODY_SCALE_MIN);
    expect(normalizeDesktopSettings({ skin: "bare", bodyScale: 99 }).bodyScale).toBe(BODY_SCALE_MAX);
    expect(normalizeDesktopSettings({ skin: "bare", bodyScale: 1.25 }).bodyScale).toBe(1.25);
  });

  it("keeps per-skin options and drops non-string leaves", () => {
    const normalized = normalizeDesktopSettings({
      skin: "chicago",
      bodyScale: 1,
      skinOptions: { chicago: { palette: "amber", bad: 3 }, bare: { "": "x" } },
      windowBackground: "#17130e",
    });
    expect(normalized.skinOptions).toEqual({ chicago: { palette: "amber" }, bare: { "": "x" } });
    expect(normalized.windowBackground).toBe("#17130e");
  });

  it("defaults an absent or non-object skinOptions to an empty map", () => {
    expect(normalizeDesktopSettings({ skin: "bare", bodyScale: 1 }).skinOptions).toEqual({});
    expect(normalizeSkinOptions("nope")).toEqual({});
    expect(normalizeSkinOptions({ chicago: 7 })).toEqual({});
  });

  it("drops a windowBackground that is not a hex colour", () => {
    expect(normalizeDesktopSettings({ skin: "bare", bodyScale: 1, windowBackground: "red" }).windowBackground).toBe("");
    expect(normalizeDesktopSettings({ skin: "bare", bodyScale: 1, windowBackground: "#fff" }).windowBackground).toBe("#fff");
  });

  it("normalizes disabledSkills and ignores the dropped style fields", () => {
    const normalized = normalizeDesktopSettings({
      skin: "bare",
      bodyFont: "song",
      bodyScale: 1,
      disabledSkills: ["reading", "reading", 7, "  ", "calendar"],
      courseStyles: { ctm: "deep" },
      sessionStyle: "deep",
    });
    expect(normalized.disabledSkills).toEqual(["reading", "calendar"]);
    // `courseStyles` / `sessionStyle` are no longer settings: style picks live
    // in memory only, so leftovers from an old desktop.json are dropped.
    expect(normalized).not.toHaveProperty("courseStyles");
    expect(normalized).not.toHaveProperty("sessionStyle");
  });

  it("defaults the new fields when absent", () => {
    const normalized = normalizeDesktopSettings({ skin: "bare", bodyScale: 1 });
    expect(normalized.disabledSkills).toEqual([]);
    expect(normalized.courseStartedOn).toEqual({});
    expect(normalized.verifiedOn).toEqual({});
  });

  it("keeps only real dates in courseStartedOn", () => {
    const normalized = normalizeDesktopSettings({
      skin: "bare",
      bodyScale: 1,
      courseStartedOn: {
        ctm: "2026-11-04",
        bad: "2026-13-40",
        short: "2026-1-4",
        empty: "",
        "": "2026-11-04",
        number: 20261104,
      },
    });
    expect(normalized.courseStartedOn).toEqual({ ctm: "2026-11-04" });
  });

  it("keeps only real dates in verifiedOn", () => {
    const normalized = normalizeDesktopSettings({
      skin: "bare",
      bodyScale: 1,
      verifiedOn: {
        ctm: "2026-11-04",
        bad: "2026-13-40",
        short: "2026-1-4",
        empty: "",
        "": "2026-11-04",
        number: 20261104,
      },
    });
    expect(normalized.verifiedOn).toEqual({ ctm: "2026-11-04" });
  });
});

describe("normalizeCourseStartedOn", () => {
  it("returns empty for non-objects and rejects malformed days", () => {
    expect(normalizeCourseStartedOn(null)).toEqual({});
    expect(normalizeCourseStartedOn(["2026-11-04"])).toEqual({});
    expect(normalizeCourseStartedOn({ ctm: "2024-02-30" })).toEqual({});
    expect(normalizeCourseStartedOn({ ctm: "today" })).toEqual({});
  });

  it("accepts a leap day", () => {
    expect(normalizeCourseStartedOn({ ctm: "2024-02-29" })).toEqual({ ctm: "2024-02-29" });
  });
});

describe("normalizeDisabledSkills / isTeachingStyle", () => {
  it("returns empty for non-array inputs", () => {
    expect(normalizeDisabledSkills("reading")).toEqual([]);
    expect(normalizeDisabledSkills(null)).toEqual([]);
  });

  it("recognizes the four teaching styles, including default", () => {
    for (const style of ["default", "plain", "detailed", "deep"]) expect(isTeachingStyle(style)).toBe(true);
    for (const value of ["loud", "", null, 1]) expect(isTeachingStyle(value)).toBe(false);
  });
});

describe("isRetryState / withValidRetry", () => {
  const failed: ChatMessage = {
    id: "a1",
    role: "assistant",
    markdown: "",
    streaming: false,
    toolCalls: [],
    errorMessage: "terminated",
  };

  it("accepts the two valid marker shapes and rejects others", () => {
    expect(isRetryState("recovered")).toBe(true);
    expect(isRetryState({ attempt: 1, maxAttempts: 3 })).toBe(true);
    expect(isRetryState({ attempt: "1", maxAttempts: 3 })).toBe(false);
    expect(isRetryState({ attempt: 1 })).toBe(false);
    expect(isRetryState(null)).toBe(false);
  });

  it("keeps a valid marker and drops only a malformed one", () => {
    expect(withValidRetry({ ...failed, retry: "recovered" }).retry).toBe("recovered");
    expect(withValidRetry({ ...failed, retry: { attempt: 2, maxAttempts: 3 } }).retry).toEqual({
      attempt: 2,
      maxAttempts: 3,
    });
    expect(withValidRetry(failed).retry).toBeUndefined();
    expect(withValidRetry({ ...failed, retry: "bogus" as never }).retry).toBeUndefined();
  });
});
