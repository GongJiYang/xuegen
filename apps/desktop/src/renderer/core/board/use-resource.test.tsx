/**
 * The shared board loading primitive: a background reload keeps the value
 * already on screen, while an empty or failed resource still shows loading.
 */

import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { AsyncState } from "./state.js";
import { useBoardResource, type BoardResource, type LoadResult } from "./use-resource.js";

let captured: BoardResource<string> | null = null;

function Harness({ loader }: { loader: () => Promise<LoadResult<string>> }) {
  const resource = useBoardResource(loader, []);
  useEffect(() => {
    captured = resource;
  });
  return null;
}

/** A loader whose response is released by the test, so the in-flight state is observable. */
function deferredLoader() {
  const pending: ((result: LoadResult<string>) => void)[] = [];
  const loader = (): Promise<LoadResult<string>> =>
    new Promise((resolve) => {
      pending.push(resolve);
    });
  return { loader, resolveNext: (result: LoadResult<string>): void => pending.shift()?.(result) };
}

function state(): AsyncState<string> | undefined {
  return captured?.state;
}

afterEach(() => {
  captured = null;
  vi.restoreAllMocks();
});

describe("useBoardResource — reload", () => {
  it("starts loading on the first load", () => {
    render(<Harness loader={() => new Promise(() => undefined)} />);
    expect(state()).toEqual({ status: "loading" });
  });

  it("keeps the ready value on screen while a reload is in flight, then swaps it", async () => {
    const { loader, resolveNext } = deferredLoader();
    render(<Harness loader={() => loader()} />);

    await act(async () => {
      resolveNext({ ok: true, data: "old" });
      await Promise.resolve();
    });
    expect(state()).toEqual({ status: "ready", value: "old" });

    act(() => {
      captured?.reload();
    });
    // Still the old value: a refresh must not blank a panel that already has data.
    expect(state()).toEqual({ status: "ready", value: "old" });

    await act(async () => {
      resolveNext({ ok: true, data: "new" });
      await Promise.resolve();
    });
    expect(state()).toEqual({ status: "ready", value: "new" });
  });

  it("shows loading when reloading from an error", async () => {
    const { loader, resolveNext } = deferredLoader();
    render(<Harness loader={() => loader()} />);

    await act(async () => {
      resolveNext({ ok: false, code: "script-failed", error: "boom" });
      await Promise.resolve();
    });
    expect(state()).toMatchObject({ status: "error", code: "script-failed" });

    act(() => {
      captured?.reload();
    });
    expect(state()).toEqual({ status: "loading" });
  });

  it("shows loading when reloading before the first load settled", () => {
    render(<Harness loader={() => new Promise(() => undefined)} />);
    expect(state()).toEqual({ status: "loading" });

    act(() => {
      captured?.reload();
    });
    expect(state()).toEqual({ status: "loading" });
  });

  it("keeps the old value visible even when a reload fails", async () => {
    const { loader, resolveNext } = deferredLoader();
    render(<Harness loader={() => loader()} />);

    await act(async () => {
      resolveNext({ ok: true, data: "old" });
      await Promise.resolve();
    });

    act(() => {
      captured?.reload();
    });
    expect(state()).toEqual({ status: "ready", value: "old" });

    await act(async () => {
      resolveNext({ ok: false, code: "unknown", error: "" });
      await Promise.resolve();
    });
    expect(state()).toMatchObject({ status: "error" });
  });
});
