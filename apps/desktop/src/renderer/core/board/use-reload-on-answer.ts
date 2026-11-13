/**
 * Reload the board when an answer ends.
 *
 * 学根 may have written course progress, reading, cards, or calendar notes
 * during a turn. The panels should reflect that as soon as streaming stops, but
 * only on the true → false edge: a reload on every render would loop. The ref
 * holds the previous flag so entering streaming does not reload.
 */

import { useEffect, useRef } from "react";
import { now } from "../today.js";

/** Call `reload` on the streaming true → false edge. */
export function useReloadOnAnswer(streaming: boolean, reload: () => void): void {
  const wasStreaming = useRef(streaming);
  useEffect(() => {
    const ended = wasStreaming.current && !streaming;
    wasStreaming.current = streaming;
    if (!ended) return;
    reload();
  }, [streaming, reload]);
}

/**
 * Also reload when the window regains focus (the vault may have changed in
 * Obsidian) and when the local day changes while the window stays open.
 * Focus reloads are at most one per 5 s.
 */
export function useReloadOnFocusAndDay(reload: () => void): void {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);
  useEffect(() => {
    let last = 0;
    const onFocus = (): void => {
      const stamp = Date.now();
      if (stamp - last < 5000) return;
      last = stamp;
      reloadRef.current();
    };
    let day = now().toDateString();
    const timer = window.setInterval(() => {
      const current = now().toDateString();
      if (current === day) return;
      day = current;
      reloadRef.current();
    }, 60_000);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, []);
}
