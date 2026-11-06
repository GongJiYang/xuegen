/**
 * Study-cycle view model: today's and tomorrow's place in the cycle (for 今天), the displayed month's day types and lessons (for 日历), and the route / cycle / course overview (for 总进度), loaded from `cycle.mjs` through the data channel.
 */

import type { CycleDay, CycleMonth, CycleOverview } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { useBoardResource, type BoardResource } from "./use-resource.js";

export interface CycleResource {
  today: BoardResource<CycleDay>;
  tomorrow: BoardResource<CycleDay>;
  month: BoardResource<CycleMonth>;
  overview: BoardResource<CycleOverview>;
  reload(): void;
}

/**
 * @param today    `YYYY-MM-DD` of today (the caller reads the clock).
 * @param tomorrow `YYYY-MM-DD` of tomorrow.
 * @param month    The `YYYY-MM` the calendar is showing.
 */
export function useCycle(today: string, tomorrow: string, month: string): CycleResource {
  const todayResource = useBoardResource(() => client.data({ kind: "cycle.day", date: today }), [today]);
  const tomorrowResource = useBoardResource(() => client.data({ kind: "cycle.day", date: tomorrow }), [tomorrow]);
  const monthResource = useBoardResource(() => client.data({ kind: "cycle.month", month }), [month]);
  const overviewResource = useBoardResource(() => client.data({ kind: "cycle.overview", date: today }), [today]);
  return {
    today: todayResource,
    tomorrow: tomorrowResource,
    month: monthResource,
    overview: overviewResource,
    reload: () => {
      todayResource.reload();
      tomorrowResource.reload();
      monthResource.reload();
      overviewResource.reload();
    },
  };
}
