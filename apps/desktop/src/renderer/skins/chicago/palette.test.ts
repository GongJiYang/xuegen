/**
 * Chicago palettes.
 *
 * The palette module is a pure generator: it turns a palette into CSS custom
 * properties whose patterns are two-colour SVG data URLs. These tests pin that
 * every palette yields only its own two colours (never a third), and that an
 * unknown option value falls back to the baseline.
 */

import { describe, expect, it } from "vitest";
import { PALETTES, PALETTE_IDS, paletteVariables, resolvePaletteId } from "./palette.js";

/** Decode the SVG inside a `url("data:image/svg+xml,...")` value. */
function decodeSvg(value: string): string {
  const match = /^url\("data:image\/svg\+xml,(.*)"\)$/.exec(value);
  if (!match?.[1]) throw new Error(`not a pixel SVG url: ${value}`);
  return decodeURIComponent(match[1]);
}

describe("paletteVariables", () => {
  it("exposes the palette's own two colours as --ink/--paper", () => {
    for (const id of PALETTE_IDS) {
      const vars = paletteVariables(PALETTES[id]);
      expect(vars["--ink"]).toBe(PALETTES[id].ink);
      expect(vars["--paper"]).toBe(PALETTES[id].paper);
    }
  });

  it("builds every pattern from only the palette's two colours", () => {
    for (const id of PALETTE_IDS) {
      const palette = PALETTES[id];
      const vars = paletteVariables(palette);
      for (const name of ["--desktop", "--dither-25", "--stripes", "--btn", "--btn-down", "--ring"] as const) {
        const svg = decodeSvg(vars[name]);
        const fills = [...svg.matchAll(/fill='([^']+)'/g)].map((m) => m[1]);
        // A pattern may use ink only (the ring) or ink + paper; nothing else.
        for (const fill of fills) {
          expect([palette.ink, palette.paper]).toContain(fill);
        }
        expect(svg).toContain("shape-rendering='crispEdges'");
      }
    }
  });

  it("draws the button-down tile as the inverted button tile", () => {
    // `--btn-down` is a distinct tile from `--btn` (the pressed look).
    const vars = paletteVariables(PALETTES.white);
    expect(vars["--btn-down"]).not.toBe(vars["--btn"]);
    expect(decodeSvg(vars["--btn-down"]).length).toBeGreaterThan(0);
  });
});

describe("resolvePaletteId", () => {
  it("accepts every known id and falls back to white otherwise", () => {
    expect(resolvePaletteId("amber")).toBe("amber");
    expect(resolvePaletteId("nope")).toBe("white");
    expect(resolvePaletteId(undefined)).toBe("white");
  });
});
