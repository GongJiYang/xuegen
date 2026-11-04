/**
 * Chicago tool-dock icons.
 *
 * The five 16×16 pixel-art blocks from the design's `ICON_ART`, drawn at 2× so
 * they fill the 32×32 dock glyph. Each icon is a two-colour SVG data URL built
 * from the active palette (via `iconBackground`), so the dock never introduces a
 * third colour and follows a palette switch automatically.
 */

import { iconBackground, PALETTES, type Palette, type PaletteId } from "./palette.js";
import type { ToolId } from "../contract.js";
import { strings } from "../../core/strings.js";

/** The 16×16 art for each tool, `#` = ink, `.` = paper (from the design). */
const ICON_ART: Record<ToolId, string[]> = {
  progress: [
    "................",
    ".############...",
    ".#..........#...",
    ".#.......##.#...",
    ".#.......##.#...",
    ".#....##.##.#...",
    ".#....##.##.#...",
    ".#.##.##.##.#...",
    ".#.##.##.##.#...",
    ".#.##.##.##.#...",
    ".#..........#...",
    ".############...",
    "................",
    "................",
    "................",
    "................",
  ],
  reading: [
    "................",
    "................",
    ".######..######.",
    ".#....#..#....#.",
    ".#.##.#..#.##.#.",
    ".#....#..#....#.",
    ".#.##.#..#.##.#.",
    ".#....#..#....#.",
    ".#.##.#..#.##.#.",
    ".#....#..#....#.",
    ".#######.######.",
    "........##......",
    "................",
    "................",
    "................",
    "................",
  ],
  cards: [
    "................",
    "....##########..",
    "....#........#..",
    "..##########.#..",
    "..#........#.#..",
    "..#.######.#.#..",
    "..#........#.#..",
    "..#.####...#.#..",
    "..#........#.#..",
    "..#.######.#.#..",
    "..#........###..",
    "..##########....",
    "................",
    "................",
    "................",
    "................",
  ],
  calendar: [
    "................",
    "...#......#.....",
    ".############...",
    ".#..#....#..#...",
    ".############...",
    ".#..........#...",
    ".#.#.#.#.#..#...",
    ".#..........#...",
    ".#.#.#.#.##.#...",
    ".#.......##.#...",
    ".#.#.#.#....#...",
    ".############...",
    "................",
    "................",
    "................",
    "................",
  ],
  skills: [
    "................",
    ".....####.......",
    ".....#..#.......",
    ".#####..#####...",
    ".#..........#...",
    ".#..........##..",
    ".#...........#..",
    ".#..........##..",
    ".#..........#...",
    ".############...",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
};

/** The tool ids in dock order (matches ⌘1–⌘5). */
export const TOOL_ORDER: ToolId[] = ["progress", "reading", "cards", "calendar", "skills"];

/** The display name of a tool, from core strings. */
function toolName(tool: ToolId): string {
  switch (tool) {
    case "progress":
      return strings.tools.progress;
    case "reading":
      return strings.tools.reading;
    case "cards":
      return strings.tools.cards;
    case "calendar":
      return strings.tools.calendar;
    case "skills":
      return strings.tools.skills;
    default:
      return tool;
  }
}

/** The dock descriptors (id, name, shortcut) handed to the Shell's ToolDock. */
export function toolDescriptors(): { id: ToolId; name: string; shortcut: string }[] {
  return TOOL_ORDER.map((id, index) => ({ id, name: toolName(id), shortcut: `${index + 1}` }));
}

/** The 16×16 art for the 今天 dock entry (a filled sun over a horizon). */
const TODAY_ART: string[] = [
  "................",
  "......####......",
  "....########....",
  "...##########...",
  "..#..######..#..",
  ".#...######...#.",
  ".#...######...#.",
  ".#...######...#.",
  ".#...######...#.",
  ".#..........#...",
  "................",
  ".##############.",
  ".#..........#...",
  ".##############.",
  "................",
  "................",
];

/** The CSS background for one tool's 32×32 glyph under a palette. */
export function toolIcon(tool: ToolId, paletteId: PaletteId): string {
  const palette: Palette = PALETTES[paletteId];
  return iconBackground(ICON_ART[tool], 32, palette);
}

/** The CSS background for the 今天 dock entry's 32×32 glyph. */
export function todayIcon(paletteId: PaletteId): string {
  const palette: Palette = PALETTES[paletteId];
  return iconBackground(TODAY_ART, 32, palette);
}
