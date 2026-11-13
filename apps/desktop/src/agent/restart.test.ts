/**
 * Restart teardown ordering (batch-switch-guard, 11-12).
 *
 * Pi's `dispose()` only signals the run's abort controller and then detaches
 * the session's event wiring, so the final `message_end` that writes the
 * already-streamed answer to the session file never fires. `stopSessionForRestart`
 * must therefore abort a running turn *before* disposing — and still dispose
 * when the abort itself fails, since the session is being replaced either way.
 */

import { describe, expect, it } from "vitest";
import { stopSessionForRestart, type RestartSession } from "./restart.js";

/** A session double recording the order its methods run in. */
function fakeSession(isStreaming: boolean, calls: string[], abortError?: Error): RestartSession {
  return {
    isStreaming,
    abort: () => {
      calls.push("abort");
      return abortError ? Promise.reject(abortError) : Promise.resolve();
    },
    dispose: () => {
      calls.push("dispose");
    },
  };
}

describe("stopSessionForRestart", () => {
  it("aborts a streaming session before disposing it", async () => {
    const calls: string[] = [];
    await stopSessionForRestart(fakeSession(true, calls));
    expect(calls).toEqual(["abort", "dispose"]);
  });

  it("disposes an idle session without aborting", async () => {
    const calls: string[] = [];
    await stopSessionForRestart(fakeSession(false, calls));
    expect(calls).toEqual(["dispose"]);
  });

  it("still disposes when the abort fails", async () => {
    const calls: string[] = [];
    await expect(stopSessionForRestart(fakeSession(true, calls, new Error("boom")))).rejects.toThrow(
      "boom",
    );
    expect(calls).toEqual(["abort", "dispose"]);
  });

  it("does nothing without a session", async () => {
    await expect(stopSessionForRestart(null)).resolves.toBeUndefined();
  });
});
