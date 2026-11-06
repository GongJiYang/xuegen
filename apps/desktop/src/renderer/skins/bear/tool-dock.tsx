/**
 * Bear tool dock — the drawer's label row.
 *
 * A row of text labels (今天 plus the five tools) with a 1px `--ink` underline
 * on the active entry. In the Shell's drawer these same labels are Radix tab
 * triggers; rendered standalone (gallery, contract test) they are plain
 * buttons calling the same callbacks, so the slot never depends on a Tabs
 * context.
 */

import type { ToolDockProps } from "../contract.js";
import { strings } from "../../core/strings.js";

export function ToolDock({ tools, active, onOpen, todayActive, onOpenToday }: ToolDockProps) {
  return (
    <nav className="bear-dock" aria-label={strings.tools.dockLabel} title={strings.tools.switchHint}>
      <button type="button" aria-current={todayActive ? "true" : undefined} onClick={onOpenToday}>
        {strings.today.title}
      </button>
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          aria-current={active === tool.id ? "true" : undefined}
          onClick={() => onOpen(tool.id)}
        >
          {tool.name}
        </button>
      ))}
    </nav>
  );
}
