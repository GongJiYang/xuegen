/**
 * 「检查理解」 state for the composer and the question rows: which question is
 * being answered, and the three actions the row buttons fire (B10). Kept in a
 * hook so the state survives a skin switch and `App` stays a shell.
 */

import { useCallback, useState } from "react";
import { strings } from "../strings.js";
import type { ChatController } from "./useChat.js";

export function useExerciseActions(
  controller: Pick<ChatController, "sendCommand">,
  requestFocus: () => void,
): {
  answering: number | null;
  cancelAnswer(): void;
  onAnswer(index: number): void;
  onHint(index: number): void;
  onSkip(index: number): void;
} {
  const [answering, setAnswering] = useState<number | null>(null);

  // 「检查理解」 actions (B10): answering focuses the composer and names the
  // question; hint and skip send a prompt referencing the same question number.
  const onAnswer = useCallback(
    (index: number) => {
      setAnswering(index);
      requestFocus();
    },
    [requestFocus],
  );
  const onHint = useCallback(
    (index: number) => controller.sendCommand(strings.content.exerciseHintPrompt(index)),
    [controller],
  );
  const onSkip = useCallback(
    (index: number) => {
      controller.sendCommand(strings.content.exerciseSkipPrompt(index));
      setAnswering((current) => (current === index ? null : current));
    },
    [controller],
  );
  const cancelAnswer = useCallback(() => setAnswering(null), []);

  return { answering, cancelAnswer, onAnswer, onHint, onSkip };
}
