// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { todayOverride } from "./today.js";

describe("todayOverride", () => {
  it("returns the day for a real YYYY-MM-DD", () => {
    expect(todayOverride({ XUEGEN_TODAY: "2026-11-12" })).toBe("2026-11-12");
    expect(todayOverride({ XUEGEN_TODAY: "2028-02-29" })).toBe("2028-02-29");
  });

  it("returns null when the variable is unset or empty", () => {
    expect(todayOverride({})).toBeNull();
    expect(todayOverride({ XUEGEN_TODAY: "" })).toBeNull();
  });

  it("returns null and warns for a malformed value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(todayOverride({ XUEGEN_TODAY: "tomorrow" })).toBeNull();
      expect(todayOverride({ XUEGEN_TODAY: "2026/11/12" })).toBeNull();
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  it("rejects days that do not exist, like 2026-02-30", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(todayOverride({ XUEGEN_TODAY: "2026-02-30" })).toBeNull();
      expect(todayOverride({ XUEGEN_TODAY: "2026-13-01" })).toBeNull();
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});
