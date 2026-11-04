import { describe, expect, it } from "vitest";
import {
  assertNever,
  isDesktopSettings,
  isHostToAgentMessage,
  isTeachingStyle,
  normalizeCourseStyles,
  normalizeDesktopSettings,
  normalizeDisabledSkills,
  normalizeSkinOptions,
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
    ];
    for (const message of invalid) {
      expect(isHostToAgentMessage(message)).toBe(false);
    }
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

  it("normalizes disabledSkills, courseStyles and sessionStyle", () => {
    const normalized = normalizeDesktopSettings({
      skin: "bare",
      bodyScale: 1,
      disabledSkills: ["reading", "reading", 7, "  ", "calendar"],
      courseStyles: { ctm: "plain", bad: "loud", "": "deep" },
      sessionStyle: "detailed",
    });
    expect(normalized.disabledSkills).toEqual(["reading", "calendar"]);
    expect(normalized.courseStyles).toEqual({ ctm: "plain" });
    expect(normalized.sessionStyle).toBe("detailed");
  });

  it("defaults the new fields when absent and rejects an unknown style", () => {
    const normalized = normalizeDesktopSettings({ skin: "bare", bodyScale: 1 });
    expect(normalized.disabledSkills).toEqual([]);
    expect(normalized.courseStyles).toEqual({});
    expect(normalized.sessionStyle).toBe(DEFAULT_DESKTOP_SETTINGS.sessionStyle);
    expect(normalizeDesktopSettings({ skin: "bare", bodyScale: 1, sessionStyle: "loud" }).sessionStyle).toBe("plain");
  });
});

describe("normalizeDisabledSkills / normalizeCourseStyles / isTeachingStyle", () => {
  it("returns empty for non-array / non-object inputs", () => {
    expect(normalizeDisabledSkills("reading")).toEqual([]);
    expect(normalizeDisabledSkills(null)).toEqual([]);
    expect(normalizeCourseStyles(["plain"])).toEqual({});
  });

  it("recognizes only the three teaching styles", () => {
    for (const style of ["plain", "detailed", "deep"]) expect(isTeachingStyle(style)).toBe(true);
    for (const value of ["loud", "", null, 1]) expect(isTeachingStyle(value)).toBe(false);
  });
});
