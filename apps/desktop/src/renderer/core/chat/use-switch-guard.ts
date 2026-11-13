/**
 * The session-switch guard (batch-switch-guard, 11-12).
 *
 * Every renderer entry point that swaps the active session routes its switch
 * through `guardSwitch`. Idle: the switch runs at once. While 学根 is
 * answering, it is held and `pendingSwitch` turns on so the shell can ask:
 * 「等它说完」 (`cancelSwitch`) drops it; 「切换」 (`confirmSwitch`) stops the
 * answer the way the stop button does, then runs the held switch once the next
 * state snapshot reports the turn settled — or after 2s without one, since
 * leaving the click swallowed is worse than switching on a stale flag.
 *
 * Words that stop withdrew from the old session's queue are handed to the new
 * one (`carriedDraft`): they never got an answer, so dropping them would lose
 * what the learner wrote. The answer in progress is not carried over — its
 * reply is already half-saved in the old session.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/** How long a confirmed switch waits for `streaming: false` before running anyway. */
const SETTLE_TIMEOUT_MS = 2000;

export interface SwitchGuard {
  /** True while a held switch waits on the learner's answer to the confirm. */
  pendingSwitch: boolean;
  /** Run `run` now when idle; hold it behind the confirm while answering. */
  guardSwitch(run: () => void): void;
  /** 「切换」: stop the answer like the stop button, then run the held switch. */
  confirmSwitch(): void;
  /** 「等它说完」: drop the held switch. */
  cancelSwitch(): void;
  /**
   * Words a confirmed switch withdrew from the old session's queue, waiting for
   * the new session's composer to take them; null when nothing was carried.
   */
  carriedDraft: string | null;
  /** The composer took {@link carriedDraft} into its field: forget it. */
  takeCarriedDraft(): void;
  /** Feed the latest state snapshot in; a confirmed switch settles on it. */
  onStateSnapshot(streaming: boolean): void;
}

export function useSwitchGuard(deps: {
  /** Mirrors the latest state snapshot's `streaming` flag (written by the event listener). */
  streamingRef: RefObject<boolean>;
  /**
   * Sends abort and withdraws queued messages; returns only those words (never
   * the prompt being answered), which a confirmed switch carries to the new
   * session.
   */
  stop(): string | null;
}): SwitchGuard {
  const [pendingSwitch, setPendingSwitch] = useState(false);
  // The switch the learner clicked, waiting on the confirm or on the settle.
  const pendingRunRef = useRef<(() => void) | null>(null);
  // True after 「切换」 until the held switch runs: separates "waiting on the
  // learner" from "waiting on the agent".
  const armedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Words the stop withdrew, held until the switch has actually run: a composer
  // still showing the old session must not receive them.
  const carriedRef = useRef<string | null>(null);
  const [carriedDraft, setCarriedDraft] = useState<string | null>(null);

  const runPending = useCallback((): void => {
    const run = pendingRunRef.current;
    pendingRunRef.current = null;
    armedRef.current = false;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPendingSwitch(false);
    run?.();
    // After the switch, so the new session's composer is the one that gets them.
    // Always written, so a carry an earlier switch left behind cannot linger.
    const carried = carriedRef.current;
    carriedRef.current = null;
    setCarriedDraft(carried);
  }, []);

  const takeCarriedDraft = useCallback((): void => setCarriedDraft(null), []);

  const onStateSnapshot = useCallback(
    (streaming: boolean): void => {
      if (!streaming && armedRef.current) runPending();
    },
    [runPending],
  );

  const guardSwitch = useCallback(
    (run: () => void): void => {
      if (!deps.streamingRef.current) {
        run();
        return;
      }
      // A second switch click while the confirm is up replaces the held one.
      pendingRunRef.current = run;
      setPendingSwitch(true);
    },
    [deps.streamingRef],
  );

  const confirmSwitch = useCallback((): void => {
    // Nothing to stop — a defensive path, or the answer already settled while
    // the confirm was on screen.
    if (pendingRunRef.current === null || !deps.streamingRef.current) {
      runPending();
      return;
    }
    armedRef.current = true;
    setPendingSwitch(false);
    const carried = deps.stop();
    carriedRef.current = carried !== null && carried.length > 0 ? carried : null;
    timerRef.current = setTimeout(runPending, SETTLE_TIMEOUT_MS);
  }, [deps, runPending]);

  const cancelSwitch = useCallback((): void => {
    pendingRunRef.current = null;
    armedRef.current = false;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPendingSwitch(false);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return {
    pendingSwitch,
    guardSwitch,
    confirmSwitch,
    cancelSwitch,
    carriedDraft,
    takeCarriedDraft,
    onStateSnapshot,
  };
}
