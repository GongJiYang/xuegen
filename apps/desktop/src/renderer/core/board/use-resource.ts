/**
 * The shared loading primitive every board hook builds on.
 *
 * A board hook needs the same three things: load a value through the data
 * channel, expose it as an {@link AsyncState}, and reload it after a write. This
 * module owns exactly that, so `use-courses`, `use-reading`, and the rest only
 * describe *what* to load and how a write refreshes it.
 *
 * The loader is a function of a dependency tuple (a month, a slug list, …): when
 * any part changes the load re-runs. All effects are cancelled on unmount so a
 * late response never sets state on a gone component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DataErrorCode } from "@shared/data-protocol.js";
import type { AsyncState } from "./state.js";
import { errorState } from "./state.js";

/** The result shape a loader returns: the data-channel result narrowed by kind. */
export type LoadResult<T> = { ok: true; data: T } | { ok: false; code: DataErrorCode; error: string };

/** A function that loads one value from the data channel. */
export type Loader<T> = () => Promise<LoadResult<T>>;

/** What a board hook returns: the state, a reload, and a way to run a write. */
export interface BoardResource<T> {
  state: AsyncState<T>;
  /**
   * Reload the value in the background.
   *
   * A value already on screen stays on screen until the new one arrives, so a
   * refresh never blanks a panel (or drops the day's cycle to "no cycle").
   */
  reload(): void;
  /**
   * Run a write, then reload on success.
   *
   * Returns the write's result so a caller can show a Notice on failure; the
   * reload only happens when the write succeeded.
   */
  mutate<R>(write: () => Promise<LoadResult<R>>): Promise<LoadResult<R>>;
}

/**
 * Load `loader` into an {@link AsyncState}, reloading when `deps` change.
 *
 * `loader` is captured in a ref so an inline arrow (a new identity each render)
 * does not re-trigger the load; the effect keys on `deps` only.
 */
export function useBoardResource<T>(loader: Loader<T>, deps: readonly unknown[]): BoardResource<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const loaderRef = useRef(loader);
  const runIdRef = useRef(0);

  useEffect(() => {
    loaderRef.current = loader;
  });

  // Start one load without touching the loading flag; used by the effect, whose
  // initial state is already `loading`.
  const begin = useCallback(() => {
    const runId = ++runIdRef.current;
    void loaderRef.current().then((result) => {
      // Ignore a stale response: a newer load (or an unmount) supersedes it.
      if (runId !== runIdRef.current) return;
      setState(result.ok ? { status: "ready", value: result.data } : errorState(result.code, result.error));
    });
  }, []);

  // A user-triggered reload keeps a value we already have visible; only an
  // empty (still loading) or failed resource shows loading again.
  const load = useCallback(() => {
    setState((current) => (current.status === "ready" ? current : { status: "loading" }));
    begin();
  }, [begin]);

  useEffect(() => {
    begin();
    return () => {
      // Invalidate the in-flight load on unmount / dep change.
      runIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const mutate = useCallback(
    async <R,>(write: () => Promise<LoadResult<R>>): Promise<LoadResult<R>> => {
      const result = await write();
      if (result.ok) load();
      return result;
    },
    [load],
  );

  return { state, reload: load, mutate };
}
