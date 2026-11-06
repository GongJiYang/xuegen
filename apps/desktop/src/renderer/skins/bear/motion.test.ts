/**
 * Bear motion preset.
 *
 * core guarantees reduced motion never reaches a preset, so every animatable
 * intent must return a cancellable handle against a real element — including in
 * jsdom, where `motion` falls back to a JS driver. `expand`/`collapse` are
 * delegated to the Animate UI primitives, so the preset returns null for them.
 */

import { describe, expect, it } from "vitest";
import { bearMotion } from "./motion.js";

describe("bearMotion", () => {
  it("returns a cancellable handle for appear / confirm / busy / alert", () => {
    const element = document.createElement("div");
    document.body.append(element);
    for (const intent of ["appear", "confirm", "busy", "alert"] as const) {
      const handle = bearMotion.run(intent, element);
      expect(handle).not.toBeNull();
      expect(() => handle?.cancel()).not.toThrow();
    }
    element.remove();
  });

  it("animates width for a progress intent with a value, ignores one without", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const handle = bearMotion.run("progress", element, { value: 60, from: 20 });
    expect(handle).not.toBeNull();
    handle?.cancel();
    expect(bearMotion.run("progress", element)).toBeNull();
    element.remove();
  });

  it("leaves expand/collapse to the Animate UI primitives", () => {
    const element = document.createElement("div");
    document.body.append(element);
    expect(bearMotion.run("expand", element)).toBeNull();
    expect(bearMotion.run("collapse", element)).toBeNull();
    element.remove();
  });
});
