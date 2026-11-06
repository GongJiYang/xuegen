import { describe, expect, it } from "vitest";
import { resolveStyle, styleWriteTarget } from "./style.js";
import type { DesktopSettings } from "@shared/protocol.js";

const settings: DesktopSettings = {
  skin: "chicago",
  bodyFont: "pixel",
  bodyScale: 1,
  windowBackground: "",
  sessionStyle: "plain",
  courseSessions: {},
  courseStartedOn: {},
  controlSessions: {},
  controlBriefOn: {},
  courseStyles: { ctm: "detailed" },
  skinOptions: {},
  disabledSkills: [],
};

describe("resolveStyle", () => {
  it("prefers a course's remembered style, else the session default", () => {
    expect(resolveStyle(settings, "ctm")).toBe("detailed");
    expect(resolveStyle(settings, "unknown")).toBe("plain");
    expect(resolveStyle(settings, null)).toBe("plain");
  });
});

describe("styleWriteTarget", () => {
  it("writes to the course only when its session is running", () => {
    expect(styleWriteTarget("ctm")).toEqual({ kind: "course", slug: "ctm" });
    expect(styleWriteTarget(null)).toEqual({ kind: "session" });
  });
});
