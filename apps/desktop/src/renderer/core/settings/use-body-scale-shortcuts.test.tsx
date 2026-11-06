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
  useBodyScaleShortcuts({ bodyScaleSteps: [1, 1.2] }, "pixel", bodyScale, update);
  return null;
}

function FontHarness({
  bodyFont,
  bodyScale,
  update,
}: {
  bodyFont: "pixel" | "hei" | "kai" | "song";
  bodyScale: number;
  update: (patch: { bodyScale: number }) => void;
}) {
  useBodyScaleShortcuts(
    { bodyScaleSteps: (font) => (font === "pixel" ? [1, 2] : [1.25, 1.5, 1.75, 2]) },
    bodyFont,
    bodyScale,
    update,
  );
  return null;
}

describe("useBodyScaleShortcuts", () => {
  it("steps the body scale along the skin's ladder", () => {
    const update = vi.fn();
    render(<Harness bodyScale={1} update={update} />);

    fireEvent.keyDown(window, { key: "=", metaKey: true });
    expect(update).toHaveBeenCalledWith({ bodyScale: 1.2 });
  });

  it("uses the current font's ladder", () => {
    const update = vi.fn();
    render(<FontHarness bodyFont="hei" bodyScale={1.25} update={update} />);

    fireEvent.keyDown(window, { key: "=", metaKey: true });
    expect(update).toHaveBeenCalledWith({ bodyScale: 1.5 });
  });

  it("resets to the font's default rung", () => {
    const smooth = vi.fn();
    render(<FontHarness bodyFont="song" bodyScale={2} update={smooth} />);
    fireEvent.keyDown(window, { key: "0", metaKey: true });
    expect(smooth).toHaveBeenCalledWith({ bodyScale: 1.5 });

    const pixel = vi.fn();
    render(<FontHarness bodyFont="pixel" bodyScale={1} update={pixel} />);
    fireEvent.keyDown(window, { key: "0", metaKey: true });
    expect(pixel).toHaveBeenCalledWith({ bodyScale: 2 });
  });

  it("ignores keys with Alt or without the command modifiers", () => {
    const update = vi.fn();
    render(<Harness bodyScale={1} update={update} />);

    fireEvent.keyDown(window, { key: "=", metaKey: true, altKey: true });
    fireEvent.keyDown(window, { key: "=" });
    expect(update).not.toHaveBeenCalled();
  });
});
