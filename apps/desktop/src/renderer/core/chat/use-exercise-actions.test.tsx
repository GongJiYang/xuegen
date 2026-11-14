import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { strings } from "../strings.js";
import { useExerciseActions } from "./use-exercise-actions.js";

function setup(): {
  result: { current: ReturnType<typeof useExerciseActions> };
  sendCommand: ReturnType<typeof vi.fn>;
  requestFocus: ReturnType<typeof vi.fn>;
} {
  const sendCommand = vi.fn();
  const requestFocus = vi.fn();
  const { result } = renderHook(() => useExerciseActions({ sendCommand }, requestFocus));
  return { result, sendCommand, requestFocus };
}

describe("useExerciseActions", () => {
  it("names the answered question and asks the composer to focus", () => {
    const { result, requestFocus } = setup();
    act(() => {
      result.current.onAnswer(2);
    });
    expect(result.current.answering).toBe(2);
    expect(requestFocus).toHaveBeenCalledTimes(1);
  });

  it("sends the hint prompt for that question", () => {
    const { result, sendCommand } = setup();
    act(() => {
      result.current.onHint(1);
    });
    expect(sendCommand).toHaveBeenCalledWith(strings.content.exerciseHintPrompt(1));
  });

  it("clears the question it skipped and sends the skip prompt", () => {
    const { result, sendCommand } = setup();
    act(() => {
      result.current.onAnswer(2);
    });
    act(() => {
      result.current.onSkip(2);
    });
    expect(result.current.answering).toBeNull();
    expect(sendCommand).toHaveBeenCalledWith(strings.content.exerciseSkipPrompt(2));
  });

  it("keeps the answered question when a different one is skipped", () => {
    const { result } = setup();
    act(() => {
      result.current.onAnswer(2);
    });
    act(() => {
      result.current.onSkip(3);
    });
    expect(result.current.answering).toBe(2);
  });

  it("cancels the answer", () => {
    const { result } = setup();
    act(() => {
      result.current.onAnswer(1);
    });
    act(() => {
      result.current.cancelAnswer();
    });
    expect(result.current.answering).toBeNull();
  });
});
