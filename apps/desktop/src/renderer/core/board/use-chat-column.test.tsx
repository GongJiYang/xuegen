// useChatColumn：宽窗默认开、窄窗默认关、手动切过之后不再跟随窗口宽度。
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChatColumn } from "./use-chat-column.js";

type Listener = (event: MediaQueryListEvent) => void;

/** Install a controllable matchMedia; returns a function that fires `change`. */
function stubMedia(narrow: boolean): (next: boolean) => void {
  let matches = narrow;
  let listener: Listener | null = null;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: (_type: string, fn: Listener) => {
      listener = fn;
    },
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return (next: boolean) => {
    matches = next;
    act(() => listener?.({ matches: next } as MediaQueryListEvent));
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useChatColumn", () => {
  it("宽窗默认打开聊天栏", () => {
    stubMedia(false);
    const { result } = renderHook(() => useChatColumn());
    expect(result.current.open).toBe(true);
  });

  it("窄窗默认收起聊天栏", () => {
    stubMedia(true);
    const { result } = renderHook(() => useChatColumn());
    expect(result.current.open).toBe(false);
  });

  it("没手动切过时跟着窗口宽度变", () => {
    const resize = stubMedia(false);
    const { result } = renderHook(() => useChatColumn());
    resize(true);
    expect(result.current.open).toBe(false);
    resize(false);
    expect(result.current.open).toBe(true);
  });

  it("手动切过之后不再跟随窗口宽度", () => {
    const resize = stubMedia(false);
    const { result } = renderHook(() => useChatColumn());
    resize(true);
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    // The user asked for the chat: shrinking further no longer hides it.
    resize(false);
    expect(result.current.open).toBe(true);
    resize(true);
    expect(result.current.open).toBe(true);
  });
});
