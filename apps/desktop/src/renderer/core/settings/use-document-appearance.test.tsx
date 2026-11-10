/**
 * Document appearance side effects.
 *
 * Two independent effects move onto `<html>`: the window background colour, and
 * — once a skin is loaded — the `data-skin` / `data-body-font` /
 * `data-body-scale` attributes the skin CSS keys off. jsdom keeps both on the
 * root element, so the test inspects `document.documentElement` directly.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDocumentAppearance } from "./use-document-appearance.js";

/** The defaults a caller such as App.tsx passes: no skin loaded yet. */
const baseOptions = {
  windowBackground: undefined as string | undefined,
  skinLoaded: false,
  skinId: "chicago",
  bodyFont: "pixel" as const,
  bodyScale: 2,
};

beforeEach(() => {
  const root = document.documentElement;
  root.style.backgroundColor = "";
  delete root.dataset.skin;
  delete root.dataset.bodyFont;
  delete root.dataset.bodyScale;
});

describe("useDocumentAppearance", () => {
  it("paints the window background onto the root element", () => {
    renderHook(() => useDocumentAppearance({ ...baseOptions, windowBackground: "#123456" }));

    expect(document.documentElement.style.backgroundColor).toBe("rgb(18, 52, 86)");
  });

  it("leaves the background alone when none is configured", () => {
    document.documentElement.style.backgroundColor = "rgb(1, 2, 3)";

    renderHook(() => useDocumentAppearance({ ...baseOptions, windowBackground: "" }));
    expect(document.documentElement.style.backgroundColor).toBe("rgb(1, 2, 3)");

    renderHook(() => useDocumentAppearance({ ...baseOptions, windowBackground: undefined }));
    expect(document.documentElement.style.backgroundColor).toBe("rgb(1, 2, 3)");
  });

  it("marks the root element with the loaded skin's appearance", () => {
    renderHook(() =>
      useDocumentAppearance({
        ...baseOptions,
        skinLoaded: true,
        skinId: "wired",
        bodyFont: "pixel",
        // Snapped to the pixel font's ladder, as App.tsx relies on.
        bodyScale: 1.7,
      }),
    );

    expect(document.documentElement.dataset.skin).toBe("wired");
    expect(document.documentElement.dataset.bodyFont).toBe("pixel");
    expect(document.documentElement.dataset.bodyScale).toBe("2");
  });

  it("snaps the scale to the active font's ladder", () => {
    renderHook(() =>
      useDocumentAppearance({ ...baseOptions, skinLoaded: true, bodyFont: "hei", bodyScale: 1.3 }),
    );

    expect(document.documentElement.dataset.bodyScale).toBe("1.25");
  });

  it("strips the attributes when it unmounts", () => {
    const { unmount } = renderHook(() =>
      useDocumentAppearance({ ...baseOptions, skinLoaded: true }),
    );
    expect(document.documentElement.dataset.skin).toBe("chicago");

    unmount();

    expect(document.documentElement.dataset.skin).toBeUndefined();
    expect(document.documentElement.dataset.bodyFont).toBeUndefined();
    expect(document.documentElement.dataset.bodyScale).toBeUndefined();
  });

  it("waits for the skin before marking anything", () => {
    renderHook(() => useDocumentAppearance({ ...baseOptions, skinLoaded: false }));

    expect(document.documentElement.dataset.skin).toBeUndefined();
    expect(document.documentElement.dataset.bodyFont).toBeUndefined();
    expect(document.documentElement.dataset.bodyScale).toBeUndefined();
  });
});
