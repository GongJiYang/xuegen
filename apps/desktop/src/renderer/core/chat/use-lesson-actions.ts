/**
 * The composer buttons a course session shows, as the contract wants them:
 * `run` sends the prompt the pure `lessonActions` picked, and the 「收课 ▾」
 * options do the same for each menu entry.
 */

import { useMemo } from "react";
import type { ComposerProps } from "../../skins/contract.js";
import { lessonActions } from "./lesson-actions.js";
import type { ChatController } from "./useChat.js";

export function useLessonActions(activeCourse: string | null, controller: ChatController): ComposerProps["lessonActions"] {
  return useMemo(
    () =>
      lessonActions(activeCourse, controller.messages).map((action) => ({
        label: action.label,
        hint: action.hint,
        run: () => controller.send(action.text),
        options: action.options.map((option) => ({ label: option.label, run: () => controller.send(option.text) })),
      })),
    [activeCourse, controller],
  );
}
