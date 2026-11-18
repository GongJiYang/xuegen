/** Render the body of whichever tool tab is selected. */

import type { ShellProps, ToolId } from "../contract.js";
import { ProgressPanel } from "./progress-panel.js";
import { ReadingPanel } from "./reading-panel.js";
import { CardsPanel } from "./cards-panel.js";
import { CalendarPanel } from "./calendar-panel.js";
import { SkillsPanel } from "./skills-panel.js";
import { withAskClose } from "./ask-close.js";

export function ToolPanel({
  tool,
  panels,
  onAsked,
}: {
  tool: ToolId;
  panels: ShellProps["panels"];
  onAsked?: (() => void) | undefined;
}) {
  switch (tool) {
    case "progress":
      return <ProgressPanel {...panels.progress} tool="progress" />;
    case "reading":
      return <ReadingPanel {...panels.reading} tool="reading" />;
    case "cards":
      return <CardsPanel {...panels.cards} tool="cards" />;
    case "calendar":
      return <CalendarPanel {...panels.calendar} tool="calendar" />;
    case "skills":
      return <SkillsPanel {...withAskClose(panels.skills, onAsked)} tool="skills" />;
    default:
      return null;
  }
}
