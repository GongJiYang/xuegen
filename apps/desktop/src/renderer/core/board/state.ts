/**
 * Async view-model state for the board panels.
 *
 * Every board panel loads its data through the `xuegen:data` channel, so each
 * one models the same three visible states explicitly: loading, error, and the
 * loaded value (which may itself be empty). Making the states a union — rather
 * than a bag of booleans — means a panel cannot accidentally render "empty" and
 * "error" at once, and a skin switches over the `status` exhaustively.
 *
 * The module is pure (no React, no I/O) so it can be unit-tested; the hooks in
 * the sibling files are the imperative shells that fill it in.
 */

import type { DataErrorCode } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

/** A data load: in flight, failed, or resolved to a value. */
export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; code: DataErrorCode; message: string }
  | { status: "ready"; value: T };

/** The value of a resolved load, or `undefined` while loading / on error. */
export function valueOf<T>(state: AsyncState<T>): T | undefined {
  return state.status === "ready" ? state.value : undefined;
}

/** True while the first load is still in flight. */
export function isLoading<T>(state: AsyncState<T>): boolean {
  return state.status === "loading";
}

/**
 * Whether a resolved collection is empty.
 *
 * A loading or errored state is not "empty" — a panel shows its own message for
 * those — so this is true only for a ready, zero-length value.
 */
export function isEmptyList<T>(state: AsyncState<T[]>): boolean {
  return state.status === "ready" && state.value.length === 0;
}

/** Build a human-readable error message from a data failure. */
export function errorState(code: DataErrorCode, message: string): AsyncState<never> {
  const summary = strings.data.errors[code] ?? strings.data.errorUnknown;
  // Keep the dynamic detail (script stderr, git output) for troubleshooting,
  // after the stable, translated summary.
  return { status: "error", code, message: message ? `${summary} ${message}` : summary };
}
