import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useBodyScaleShortcuts } from "./use-body-scale-shortcuts.js";

function Harness({
  bodyScale,
  update,
}: {
  bodyScale: number;
  update: (patch: { bodyScale: number }) => void;
}) {
  useBodyScaleShortcuts({ bodyScaleSteps: [1, 1.2] }, bodyScale, update);
  return null;
}

describe("useBodyScaleShortcuts", () => {
  it("steps the body scale along the skin's ladder", () => {
    const update = vi.fn();
    render(<Harness bodyScale={1} update={update} />);

    fireEvent.keyDown(window, { key: "=", metaKey: true });
    expect(update).toHaveBeenCalledWith({ bodyScale: 1.2 });
  });

  it("ignores keys with Alt or without the command modifiers", () => {
    const update = vi.fn();
    render(<Harness bodyScale={1} update={update} />);

    fireEvent.keyDown(window, { key: "=", metaKey: true, altKey: true });
    fireEvent.keyDown(window, { key: "=" });
    expect(update).not.toHaveBeenCalled();
  });
});
