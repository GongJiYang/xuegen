// @vitest-environment node
// The settings file lives under XUEGEN_HOME; each test points it at a fresh
// temporary directory so the real `~/.xuegen/desktop.json` is never touched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_DESKTOP_SETTINGS } from "../shared/protocol.js";
import { readSettingsForRenderer, writeSettings } from "./settings.js";

describe("settings", () => {
  let home: string;
  const originalHome = process.env.XUEGEN_HOME;
  const originalToday = process.env.XUEGEN_TODAY;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "xuegen-settings-home-"));
    process.env.XUEGEN_HOME = home;
    delete process.env.XUEGEN_TODAY;
  });

  afterEach(() => {
    process.env.XUEGEN_HOME = originalHome;
    if (originalToday === undefined) delete process.env.XUEGEN_TODAY;
    else process.env.XUEGEN_TODAY = originalToday;
    rmSync(home, { recursive: true, force: true });
  });

  it("readSettingsForRenderer reports todayOverride only when XUEGEN_TODAY is set", () => {
    expect(readSettingsForRenderer().todayOverride).toBeNull();
    process.env.XUEGEN_TODAY = "2026-11-12";
    expect(readSettingsForRenderer().todayOverride).toBe("2026-11-12");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      process.env.XUEGEN_TODAY = "not-a-day";
      expect(readSettingsForRenderer().todayOverride).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it("readSettingsForRenderer keeps the stored fields alongside the override", () => {
    writeFileSync(
      join(home, "desktop.json"),
      JSON.stringify({ ...DEFAULT_DESKTOP_SETTINGS, skin: "bare", bodyScale: 1.5 }),
      "utf8",
    );
    process.env.XUEGEN_TODAY = "2026-11-12";
    const settings = readSettingsForRenderer();
    expect(settings.skin).toBe("bare");
    expect(settings.bodyScale).toBe(1.5);
    expect(settings.todayOverride).toBe("2026-11-12");
  });

  it("a set carrying todayOverride never reaches the file", () => {
    const stored = writeSettings({ todayOverride: "2030-01-01" });
    expect(stored.todayOverride).toBeUndefined();
    expect(readFileSync(join(home, "desktop.json"), "utf8")).not.toContain("todayOverride");
    expect(readFileSync(join(home, "desktop.json"), "utf8")).not.toContain("2030-01-01");
  });
});
