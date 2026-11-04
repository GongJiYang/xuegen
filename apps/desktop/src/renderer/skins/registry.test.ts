import { describe, expect, it } from "vitest";
import { DEFAULT_DESKTOP_SETTINGS, normalizeDesktopSettings } from "@shared/protocol.js";
import { FALLBACK_SKIN_ID, findSkin, SKINS, skinIds } from "./registry.js";

describe("skin registry", () => {
  it("defaults a fresh install to chicago, a registered skin", () => {
    expect(DEFAULT_DESKTOP_SETTINGS.skin).toBe("chicago");
    expect(findSkin(DEFAULT_DESKTOP_SETTINGS.skin)).toBeTruthy();
  });

  it("keeps a stored skin and falls back to chicago only for a blank value", () => {
    expect(normalizeDesktopSettings({ skin: "bare", bodyScale: 1 }).skin).toBe("bare");
    expect(normalizeDesktopSettings({ skin: "  ", bodyScale: 1 }).skin).toBe("chicago");
  });

  it("still registers bare as the fallback and names it clearly", () => {
    expect(skinIds()).toContain(FALLBACK_SKIN_ID);
    const bare = findSkin("bare");
    expect(bare?.name).toContain("Bare");
    expect(bare?.name).toContain("参照");
  });

  it("registers chicago with the id used as the default", () => {
    expect(SKINS.map((skin) => skin.id)).toEqual(["bare", "chicago"]);
  });
});
