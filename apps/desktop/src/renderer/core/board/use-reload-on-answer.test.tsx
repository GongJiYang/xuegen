import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useReloadOnAnswer, useReloadOnFocusAndDay } from "./use-reload-on-answer.js";

function Harness({ streaming, reload }: { streaming: boolean; reload: () => void }) {
  useReloadOnAnswer(streaming, reload);
  return null;
}

function FocusHarness({ reload }: { reload: () => void }) {
  useReloadOnFocusAndDay(reload);
  return null;
}

describe("useReloadOnAnswer", () => {
  it("reloads only on the streaming true → false edge", () => {
    const reload = vi.fn();
    const { rerender } = render(<Harness streaming={false} reload={reload} />);
    expect(reload).not.toHaveBeenCalled();

    rerender(<Harness streaming={true} reload={reload} />);
    expect(reload).not.toHaveBeenCalled();

    rerender(<Harness streaming={false} reload={reload} />);
    expect(reload).toHaveBeenCalledTimes(1);

    rerender(<Harness streaming={false} reload={reload} />);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("useReloadOnFocusAndDay", () => {
  it("reloads on window focus, at most once per 5 s", () => {
    const reload = vi.fn();
    render(<FocusHarness reload={reload} />);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(reload).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
