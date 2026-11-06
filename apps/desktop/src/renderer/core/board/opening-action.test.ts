import { describe, expect, it } from "vitest";
import { openingAction, startedTodayMap } from "./opening-action.js";

describe("openingAction", () => {
  const today = "2026-11-04";

  it("sends when the course has not been opened today", () => {
    expect(openingAction("ctm", today, {}, null)).toBe("send-opening");
    expect(openingAction("ctm", today, { ctm: "2026-11-03" }, "ctm")).toBe("send-opening");
  });

  it("switches without sending when the course was opened today", () => {
    expect(openingAction("ctm", today, { ctm: today }, null)).toBe("switch-only");
    expect(openingAction("ctm", today, { ctm: today }, "other")).toBe("switch-only");
  });

  it("only focuses when the course is already active", () => {
    expect(openingAction("ctm", today, { ctm: today }, "ctm")).toBe("focus-only");
  });
});

describe("startedTodayMap", () => {
  it("keeps only the courses whose day is today", () => {
    expect(
      startedTodayMap({ ctm: "2026-11-04", algebra: "2026-11-03" }, "2026-11-04"),
    ).toEqual({ ctm: true });
  });

  it("is empty when nothing was started", () => {
    expect(startedTodayMap({}, "2026-11-04")).toEqual({});
  });
});
