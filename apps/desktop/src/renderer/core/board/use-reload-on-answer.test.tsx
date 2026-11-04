import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useReloadOnAnswer } from "./use-reload-on-answer.js";

function Harness({ streaming, reload }: { streaming: boolean; reload: () => void }) {
  useReloadOnAnswer(streaming, reload);
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
