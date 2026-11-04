/**
 * Chicago tool dock (the right-hand icon column).
 *
 * A fixed-width column of 64px cells; each holds a 32×32 pixel glyph (from
 * `icons.tsx`) and a Chicago label. The active tool's glyph gets a 2px ink
 * outline and its label inverts, matching the design's `.icon.sel`. ⌘1–⌘5 are
 * wired by the Shell, not here.
 *
 * The dock carries a 今天 entry above the five tools, so a collapsed 今天 window
 * can always be reopened from the icon column; `todayActive` marks it selected.
 * The glyph art is a two-colour SVG, so it depends on the active palette. The
 * contract slot `ToolDock` keeps no style parameters; the Shell uses
 * `ToolDockWithPalette` to pass the palette it already resolves.
 */

import type { ToolDockProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { toolIcon, toolDescriptors, todayIcon } from "./icons.js";
import { resolvePaletteId } from "./palette.js";

/** The dock markup; `paletteId` selects the glyph colours. */
function Dock({
  tools,
  active,
  onOpen,
  todayActive,
  onOpenToday,
  paletteId,
}: ToolDockProps & { paletteId: string }) {
  const palette = resolvePaletteId(paletteId);
  // Fall back to the canonical order if the caller passes no descriptors, so the
  // dock is never empty in a partial render.
  const entries = tools.length > 0 ? tools : toolDescriptors();
  return (
    <nav className="chicago-icons" aria-label={strings.tools.dockLabel} title={strings.tools.switchHint}>
      <div
        className={`chicago-icon ${todayActive ? "chicago-sel" : ""}`}
        role="button"
        tabIndex={0}
        aria-current={todayActive ? "true" : undefined}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onOpenToday}
      >
        <div className="chicago-glyph" style={{ background: todayIcon(palette) }} />
        <div className="chicago-ilabel">{strings.today.title}</div>
      </div>
      {entries.map((tool) => (
        <div
          key={tool.id}
          className={`chicago-icon ${active === tool.id ? "chicago-sel" : ""}`}
          role="button"
          tabIndex={0}
          aria-current={active === tool.id ? "true" : undefined}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => onOpen(tool.id)}
        >
          <div className="chicago-glyph" style={{ background: toolIcon(tool.id, palette) }} />
          <div className="chicago-ilabel">{tool.name}</div>
        </div>
      ))}
    </nav>
  );
}

/** The contract slot: draws with the baseline palette. */
export function ToolDock(props: ToolDockProps) {
  return <Dock {...props} paletteId="white" />;
}

/** The Shell's dock: draws with the active palette. */
export function ToolDockWithPalette(props: ToolDockProps & { paletteId: string }) {
  return <Dock {...props} />;
}
