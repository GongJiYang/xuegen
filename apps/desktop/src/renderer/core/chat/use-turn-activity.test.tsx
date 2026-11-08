import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ChatMessage } from "@shared/protocol.js";
import { useTurnActivity } from "./use-turn-activity.js";

const USER: ChatMessage = { id: "u1", role: "user", markdown: "问题", streaming: false, toolCalls: [] };

describe("useTurnActivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the elapsed seconds in the meta after they tick by", () => {
    const { result } = renderHook(({ streaming }) => useTurnActivity([USER], streaming, false), {
      initialProps: { streaming: true },
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current?.meta).toBe("2 秒");
  });

  it("returns null once the answer stops", () => {
    const { result, rerender } = renderHook(({ streaming }) => useTurnActivity([USER], streaming, false), {
      initialProps: { streaming: true },
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).not.toBeNull();
    rerender({ streaming: false });
    expect(result.current).toBeNull();
  });
});
