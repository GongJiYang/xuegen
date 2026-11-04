/**
 * Vitest setup shared by every test file.
 *
 * Adds `@testing-library/jest-dom` matchers (e.g. `toBeInTheDocument`) and stubs
 * the browser APIs jsdom does not implement but React components touch during a
 * render — `matchMedia` for the reduced-motion check, `scrollIntoView` for the
 * transcript, and `ResizeObserver`/`MutationObserver` for the follow-bottom pane.
 * Stubs are minimal: no assertions depend on their behaviour (the follow-bottom
 * test installs its own controllable observers).
 */

import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/** A no-op observer shaped like the DOM constructors jsdom omits. */
class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

if (typeof window !== "undefined") {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;

  Element.prototype.scrollIntoView ??= vi.fn();
  globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
  globalThis.MutationObserver ??= NoopObserver as unknown as typeof MutationObserver;
}
