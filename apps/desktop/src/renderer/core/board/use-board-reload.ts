/**
 * One reload for every board resource, run when an answer ends (学根 may have
 * written course progress, reading, cards, calendar notes or the cycle), when
 * the window regains focus, and when the day changes.
 */

import { useCallback } from "react";
import { useReloadOnAnswer, useReloadOnFocusAndDay } from "./use-reload-on-answer.js";

interface Reloadable {
  reload(): void;
}

export function useBoardReload(streaming: boolean, resources: Reloadable[]): void {
  // Resource objects change identity on every render; the reload reads the latest ones.
  const reload = useCallback(() => {
    for (const resource of resources) resource.reload();
  }, [resources]);
  useReloadOnAnswer(streaming, reload);
  useReloadOnFocusAndDay(reload);
}
