import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useActiveTool } from "./use-active-tool.js";

describe("useActiveTool", () => {
  it("bumps the request number on every open, even for the tool already open", () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() => useActiveTool("progress", onOpen));

    expect(result.current.activeTool).toBe("progress");
    expect(result.current.toolRequest).toBe(0);

    act(() => result.current.openTool("reading"));
    expect(result.current.activeTool).toBe("reading");
    expect(result.current.toolRequest).toBe(1);
    expect(onOpen).toHaveBeenCalledTimes(1);

    // A second click on the same tool is a fresh request too: React would not
    // see a state change otherwise, so a closed dialog could never reopen.
    act(() => result.current.openTool("reading"));
    expect(result.current.activeTool).toBe("reading");
    expect(result.current.toolRequest).toBe(2);
    expect(onOpen).toHaveBeenCalledTimes(2);

    act(() => result.current.setActiveTool(null));
    expect(result.current.activeTool).toBeNull();
    expect(result.current.toolRequest).toBe(3);
  });
});
