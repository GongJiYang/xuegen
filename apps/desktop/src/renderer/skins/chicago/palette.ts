/**
 * Chicago palettes and the pixel-art generator.
 *
 * A palette is strictly two colours (ink + paper). Every pattern the skin draws —
 * the desktop dither, the 25%/50% screens, the barber-pole stripes, the button
 * pixel corners and the default-button ring — is a two-colour SVG data URL built
 * at runtime from those two colours. Nothing here may introduce a third colour:
 * no grey, no opacity, no shadow. This is the 1-bit display rule.
 *
 * Ported verbatim from the approved design (`design/chicago/index.html`): the
 * `pixelSvg` / `applyPalette` algorithms and the DESK / STRIPES / BTN / RING
 * patterns are the visual ground truth, so anything that would change a pixel
 * belongs in the design first.
 */

/** One strictly two-colour palette. */
export interface Palette {
  /** Display name, shown in the 显示 ▸ 配色 menu. */
  name: string;
  /** Text, lines, fills. */
  ink: string;
  /** Window background. */
  paper: string;
  /** Desktop dither density: the key into `DESK_RESOLUTIONS`. */
  desk: DeskDensity;
}

/** The desktop dither densities the design defines (percent of ink coverage). */
export type DeskDensity = 50 | 25 | 12;

/** Palette ids, in menu order. `white` is the baseline default. */
export const PALETTE_IDS = ["white", "cream", "sage", "fog", "amber"] as const;

/** A palette id. */
export type PaletteId = (typeof PALETTE_IDS)[number];

/** The palette key within `skinOptions`. */
export const PALETTE_OPTION_KEY = "palette";

/** Every palette, keyed by id. Values match the design's `PALETTES` object. */
export const PALETTES: Record<PaletteId, Palette> = {
  white: { name: "白纸（基线）", ink: "#000000", paper: "#ffffff", desk: 50 },
  cream: { name: "米黄纸", ink: "#2b2620", paper: "#f2e8cf", desk: 25 },
  sage: { name: "豆沙绿", ink: "#1f2d24", paper: "#cce8cf", desk: 25 },
  fog: { name: "雾灰", ink: "#2a2e33", paper: "#dedbd4", desk: 25 },
  amber: { name: "夜·琥珀", ink: "#e0a84a", paper: "#17130e", desk: 12 },
};

/** The baseline palette. An absent or unknown palette option resolves here. */
export const DEFAULT_PALETTE_ID: PaletteId = "white";

/** Coerce an arbitrary option value to a known palette id. */
export function resolvePaletteId(value: string | undefined): PaletteId {
  return value && value in PALETTES ? (value as PaletteId) : DEFAULT_PALETTE_ID;
}

/** The two colours a pattern is drawn with (X/o) plus the icon palette (#/.). */
interface PatternColors {
  X: string;
  o: string;
  "#": string;
  ".": string;
}

/** Desktop dither patterns, as character rows. `X` = ink, `o` = paper. */
const DESK_RESOLUTIONS: Record<DeskDensity, string[]> = {
  50: ["Xo", "oX"],
  25: ["Xo", "oo"],
  12: ["Xooo", "oooo", "ooXo", "oooo"],
};

/** 8×8 angled stripe tile for the thinking barber pole. */
const STRIPES = Array.from({ length: 8 }, (_, y) =>
  Array.from({ length: 8 }, (_, x) => ((x + y) % 8 < 4 ? "X" : "o")).join(""),
);

/** 7×7 button corner tile. */
const BTN = ["..XXX..", ".XoooX.", "XoooooX", "XoooooX", "XoooooX", ".XoooX.", "..XXX.."];

/** 11×11 default-button ring tile. */
const RING = [
  "...XXXXX...",
  ".XXXXXXXXX.",
  ".XXX...XXX.",
  "XXX.....XXX",
  "XXX.....XXX",
  "XXX.....XXX",
  "XXX.....XXX",
  "XXX.....XXX",
  ".XXX...XXX.",
  ".XXXXXXXXX.",
  "...XXXXX...",
];

/** The 25% screen, reused for dither fills and disabled text. */
const DITHER_25 = DESK_RESOLUTIONS[25];

/**
 * Render character rows as a two-colour SVG data URL.
 *
 * Each row is a run of single-character columns; every cell is a 1×1 rect so the
 * result stays pixel-exact. `shape-rendering='crispEdges'` disables smoothing so
 * the edges never produce grey anti-aliasing pixels — the reason the design uses
 * SVG patterns instead of CSS gradients or `border-radius`.
 */
function pixelSvg(rows: string[], colors: Partial<PatternColors>): string {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  let out = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' shape-rendering='crispEdges'>`;
  for (const [character, color] of Object.entries(colors)) {
    if (!color) continue;
    let path = "";
    rows.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === character) path += `M${x} ${y}h1v1h-1z`;
      });
    });
    if (path) out += `<path fill='${color}' d='${path}'/>`;
  }
  return `url("data:image/svg+xml,${encodeURIComponent(`${out}</svg>`)}")`;
}

/**
 * Build a 1-bit icon as a CSS background value.
 *
 * The icon art uses `#` for ink and `.` for paper, matching the design's
 * `ICON_ART`. The result is sized so a cell is 2×2 CSS pixels, letting a 16×16
 * art block fill a 32×32 dock glyph exactly (the design's `0 0 / 32px 32px`).
 */
export function iconBackground(rows: string[], widthPx: number, palette: Palette): string {
  return `${pixelSvg(rows, { "#": palette.ink, ".": palette.paper })} 0 0 / ${widthPx}px ${widthPx}px`;
}

/** Every CSS custom property a palette defines. */
export interface PaletteVariables {
  "--ink": string;
  "--paper": string;
  "--desktop": string;
  "--dither-25": string;
  "--stripes": string;
  "--btn": string;
  "--btn-down": string;
  "--ring": string;
}

/**
 * Build the CSS custom properties for a palette.
 *
 * Mirrors the design's `applyPalette`: the two colours plus the five generated
 * SVG patterns. The button-down tile is the button tile with every cell swapped
 * ink-for-paper, so pressing a button inverts it without a second asset.
 */
export function paletteVariables(palette: Palette): PaletteVariables {
  const colors = { X: palette.ink, o: palette.paper };
  const btnDown = BTN.map((row) => row.replace(/o/g, "X"));
  return {
    "--ink": palette.ink,
    "--paper": palette.paper,
    "--desktop": pixelSvg(DESK_RESOLUTIONS[palette.desk], colors),
    "--dither-25": pixelSvg(DITHER_25, colors),
    "--stripes": pixelSvg(STRIPES, colors),
    "--btn": pixelSvg(BTN, colors),
    "--btn-down": pixelSvg(btnDown, colors),
    "--ring": pixelSvg(RING, { X: palette.ink }),
  };
}

/**
 * Write a palette onto the document root as CSS custom properties.
 *
 * The skin's stylesheet is scoped under `[data-skin="chicago"]` and reads these
 * variables, so switching palettes is a single style write on `<html>` with no
 * re-render of the tree. Returns the palette's paper colour, which the caller
 * mirrors to the main process so the window background matches (anti-flash).
 */
export function applyPalette(paletteId: PaletteId): string {
  const palette = PALETTES[paletteId];
  const variables = paletteVariables(palette);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
  root.dataset.palette = paletteId;
  root.style.backgroundColor = palette.paper;
  return palette.paper;
}
