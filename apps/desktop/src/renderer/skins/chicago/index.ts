/**
 * Chicago skin module.
 *
 * The registry's loader resolves here. It wires the slot components, the motion
 * preset, and the content renderers into one `SkinModule`, and lazily imports
 * the stylesheet so the skin's CSS and bundled fonts load only when it is
 * selected. Nothing here holds state — the palette lives on `<html>` (applied by
 * the Shell) and the conversation lives in core, above the skin.
 */

import type { SkinModule, SkinSlots } from "../contract.js";
import {
  AssistantMessage,
  BoardPanel,
  CourseIntroCard,
  Exercise,
  ModelPicker,
  NotesPanel,
  Notice,
  Thread,
  Thinking,
  ToolActivity,
  UserMessage,
} from "./slots.js";
import { Composer } from "./composer.js";
import { Shell } from "./shell.js";
import { ToolDock } from "./tool-dock.js";
import { TodayPanel } from "./today-panel.js";
import { ProgressPanel } from "./progress-panel.js";
import { ReadingPanel } from "./reading-panel.js";
import { CardsPanel } from "./cards-panel.js";
import { CalendarPanel } from "./calendar-panel.js";
import { SkillsPanel } from "./skills-panel.js";
import { DayEditor } from "./day-editor.js";
import { SlashMenu } from "./slash-menu.js";
import { UpdateBar } from "./update-bar.js";
import { ChicagoContentNode } from "./content.js";
import { chicagoMotion } from "./motion.js";
import { chicagoBodyScaleSteps } from "./body-scale.js";

const slots: SkinSlots = {
  Shell,
  Thread,
  UserMessage,
  AssistantMessage,
  ToolActivity,
  Thinking,
  UpdateBar,
  Exercise,
  Composer,
  ModelPicker,
  Notice,
  BoardPanel,
  NotesPanel,
  ToolDock,
  TodayPanel,
  ProgressPanel,
  ReadingPanel,
  CardsPanel,
  CalendarPanel,
  SkillsPanel,
  DayEditor,
  SlashMenu,
  CourseIntroCard,
};

/** The Chicago skin, consumed by the registry's lazy loader. */
export const chicagoSkin: SkinModule = {
  // KaTeX ships its own stylesheet; it must load with the skin so display and
  // inline formulas are typeset with the real metrics (a formula without it
  // collapses into flat, run-together glyphs). Vite bundles both into the skin's
  // lazy CSS chunk.
  stylesheet: () => Promise.all([import("./skin.css"), import("katex/dist/katex.min.css")]),
  // The ladder depends on the body font: whole multiples for the pixel font,
  // the 15–24px reading ladder for a smooth system font.
  bodyScaleSteps: chicagoBodyScaleSteps,
  slots,
  motion: chicagoMotion,
  content: { Node: ChicagoContentNode },
};
