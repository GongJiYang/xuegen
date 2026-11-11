/**
 * Skin loading and fallback.
 *
 * An unknown id or a load failure must resolve to the `bare` reference skin and
 * report a notice, so a broken skin never blanks the window.
 */

import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSkin } from "./use-skin.js";
import { SKINS } from "./registry.js";
import { strings } from "../core/strings.js";

describe("useSkin", () => {
  it("loads a registered skin", async () => {
    const { result } = renderHook(() => useSkin("bare"));
    await waitFor(() => expect(result.current.module).not.toBeNull(), {
      timeout: 5000,
    });
    expect(result.current.loadedId).toBe("bare");
    expect(result.current.notice).toBeNull();
  });

  it("falls back to bare with a notice for an unknown id", async () => {
    const { result } = renderHook(() => useSkin("no-such-skin"));
    await waitFor(() => expect(result.current.module).not.toBeNull(), {
      timeout: 5000,
    });
    expect(result.current.loadedId).toBe("bare");
    expect(result.current.notice?.text).toBe(strings.notice.unknownSkin);
  });

  it("registry exposes unique ids and the bare fallback", () => {
    const ids = SKINS.map((skin) => skin.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("bare");
  });
});
