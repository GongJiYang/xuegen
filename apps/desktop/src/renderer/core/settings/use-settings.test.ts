import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_DESKTOP_SETTINGS } from "@shared/protocol.js";
import { useSettings } from "./use-settings.js";
import * as client from "../client.js";

describe("useSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads settings from the client and normalizes them", async () => {
    vi.spyOn(client, "getSettings").mockResolvedValue({
      skin: "chicago",
      bodyFont: "pixel",
      bodyScale: 1.5,
      skinOptions: { chicago: { palette: "amber" } },
      windowBackground: "#17130e",
      disabledSkills: [],
      courseSessions: {},
      courseStartedOn: {},
      controlSessions: {},
      controlBriefOn: {},
    });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual({
      skin: "chicago",
      bodyFont: "pixel",
      bodyScale: 1.5,
      skinOptions: { chicago: { palette: "amber" } },
      windowBackground: "#17130e",
      disabledSkills: [],
      courseSessions: {},
      courseStartedOn: {},
      controlSessions: {},
      controlBriefOn: {},
    });
  });

  it("falls back to defaults when the client rejects", async () => {
    vi.spyOn(client, "getSettings").mockRejectedValue(new Error("no bridge"));
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });

  it("updates optimistically and persists through the client", async () => {
    vi.spyOn(client, "getSettings").mockResolvedValue({ ...DEFAULT_DESKTOP_SETTINGS });
    const setSettings = vi
      .spyOn(client, "setSettings")
      .mockResolvedValue({ ...DEFAULT_DESKTOP_SETTINGS, skin: "chicago" });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.update({ skin: "chicago" }));
    expect(result.current.settings.skin).toBe("chicago");
    expect(setSettings).toHaveBeenCalledWith({ skin: "chicago" });
  });

  it("clamps an out-of-range bodyScale on update", async () => {
    vi.spyOn(client, "getSettings").mockResolvedValue({ ...DEFAULT_DESKTOP_SETTINGS });
    vi.spyOn(client, "setSettings").mockResolvedValue({ ...DEFAULT_DESKTOP_SETTINGS, bodyScale: 2 });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.update({ bodyScale: 99 }));
    expect(result.current.settings.bodyScale).toBe(2);
  });
});
