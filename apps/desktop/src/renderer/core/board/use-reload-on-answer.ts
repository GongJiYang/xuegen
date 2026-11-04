/**
 * Reload the board when an answer ends.
 *
 * 学根 may have written course progress, reading, cards, or calendar notes
 * during a turn. The panels should reflect that as soon as streaming stops, but
 * only on the true → false edge: a reload on every render would loop. The ref
 * holds the previous flag so entering streaming does not reload.
 */

import { useEffect, useRef } from "react";

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
