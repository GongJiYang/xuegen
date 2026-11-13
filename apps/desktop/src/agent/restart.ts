/**
 * Teardown ordering for a session being replaced by a restart
 * (batch-switch-guard, 11-12).
 *
 * Pi's `dispose()` only trips the run's abort controller and then detaches the
 * session's event wiring in the same synchronous call, so the `message_end`
 * that would persist the already-streamed answer never reaches the session
 * file — a mid-answer switch would leave half a sentence on disk. Awaiting
 * `abort()` first (the same call the `abort` message makes) lets Pi write that
 * partial answer before the session is torn down.
 *
 * `index.ts` cannot be imported by a test, so the ordering lives here against
 * a structural session, like `turn.ts`'s `TurnSession`.
 */

/** The slice of a Pi session a restart needs to stop. */
export interface RestartSession {
  readonly isStreaming: boolean;
  abort(): Promise<void>;
  dispose(): void;
}

/**
 * Stop `session`: abort a running turn first so its partial text is persisted,
 * then dispose. The dispose always runs — the session is being replaced either
 * way, so a failed abort must not leak it.
 */
export async function stopSessionForRestart(session: RestartSession | null): Promise<void> {
  if (session === null) return;
  try {
    if (session.isStreaming) await session.abort();
  } finally {
    session.dispose();
  }
}
