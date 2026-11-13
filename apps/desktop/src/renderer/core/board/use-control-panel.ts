/**
 * The 总控 面板's data hook (design `?d=dash`, PANEL-PLAN).
 *
 * Assembles what the pure builders in `panel.ts` need from the resources the
 * control session already loads: the planbook's day and week (`usePlanbook`),
 * the overview (总进度 and the 周期 tile), the whole shelf, the cards and Anki
 * status, and the subjects (已登记没排). It adds no request of its own beyond
 * the shelf and overview the planbook does not load for every view.
 *
 * Every field is `null` until its source loads, which the skin renders as a
 * loading state. `today` comes from the caller so this hook never reads the
 * clock itself.
 */

import type { CardsStats, CycleOverview, ShelfListItem, SubjectsOverview } from "@shared/data-protocol.js";
import { todayKey } from "../today.js";
import { panelTiles, shelfRows, unplannedMaterials, type PanelTile, type ShelfRow, type UnplannedMaterial } from "./panel.js";
import type { PlanDay, PlanWeek } from "./planbook.js";
import type { AsyncState } from "./state.js";
import { usePlanbook } from "./use-planbook.js";
import type { ShelfResource } from "./use-shelf.js";
import type { CardsResource } from "./use-cards.js";
import type { BoardResource } from "./use-resource.js";
import type { AnkiStatus } from "@shared/data-protocol.js";

export interface ControlPanelData {
  tiles: PanelTile[];
  shelf: ShelfRow[] | null;
  unplanned: UnplannedMaterial[] | null;
  overview: CycleOverview | null;
  cards: CardsStats | null;
  /** The day the 今天 block shows (the planbook's day view anchored on today). */
  day: PlanDay | null;
  week: PlanWeek | null;
}

export interface ControlPanelInput {
  shelf: ShelfResource;
  cards: CardsResource;
  anki: BoardResource<AnkiStatus>;
  overview: BoardResource<CycleOverview>;
  subjects: BoardResource<SubjectsOverview>;
  /** Whether the open session is the 总控 one (no requests otherwise). */
  enabled: boolean;
}

function readyValue<T>(state: AsyncState<T>): T | null {
  return state.status === "ready" ? state.value : null;
}

export function useControlPanel(input: ControlPanelInput): ControlPanelData {
  const today = todayKey();
  const day = usePlanbook("day", today, input.enabled);
  const week = usePlanbook("week", today, input.enabled);
  const shelfItems: ShelfListItem[] | null = readyValue(input.shelf.list.state);
  const overview = readyValue(input.overview.state);
  const anki = readyValue(input.anki.state);
  const cards = readyValue(input.cards.stats.state);
  const subjects = readyValue(input.subjects.state);
  const dayValue = day.state.status === "ready" && day.state.value.view === "day" ? day.state.value.day : null;
  const weekValue = week.state.status === "ready" && week.state.value.view === "week" ? week.state.value.week : null;

  const tiles = panelTiles({ today, overview, day: dayValue, week: weekValue, shelf: shelfItems, anki, cards });
  const shelf =
    shelfItems !== null && overview !== null
      ? shelfRows({ today, shelf: shelfItems, overview, week: weekValue })
      : null;
  const unplanned = subjects !== null ? unplannedMaterials(subjects) : null;
  return { tiles, shelf, unplanned, overview, cards, day: dayValue, week: weekValue };
}
