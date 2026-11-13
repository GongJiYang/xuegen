/**
 * Planbook samples for the gallery (design `?d=plan2`, week of 11-06…11-12).
 *
 * Hand-built `PlanDay`/`PlanWeek` values mirroring the approved mock: C1 W1,
 * 离散 as the main course, C 语言 / 数据结构 as 带读, Epp as 自读, and a rest
 * Sunday. `todayCard` stays null here — the gallery slots in the skin's own
 * `ControlCard` where a sample needs one.
 */

import type { PlanbookProps } from "../skins/contract.js";
import type { PlanDay, PlanItem, PlanWeek } from "../core/board/planbook.js";
import { weekdayOf } from "../core/board/planbook.js";

const noop = (): void => undefined;
const TODAY = "2026-11-11";

function item(lane: PlanItem["lane"], text: string, mark: PlanItem["mark"], short = ""): PlanItem {
  return { lane, text, short, mark, slug: null, id: null };
}

function day(
  date: string,
  type: PlanDay["type"],
  items: PlanItem[] = [],
  ankiDue: number | null = null,
): PlanDay {
  return { date, weekday: weekdayOf(date), type, isToday: date === TODAY, items, ankiDue };
}

export const SAMPLE_PLAN_WEEK: PlanWeek = {
  cycle: "C1",
  week: 1,
  start: "2026-11-06",
  end: "2026-11-12",
  days: [
    day("2026-11-06", "整合", [item("main", "C1 开始", "done")]),
    day("2026-11-07", "低强度", [item("main", "离散 D1 · Ch1 记号", "done", "离散 D1")]),
    day("2026-11-08", "休息"),
    day("2026-11-09", "深度", [
      item("main", "离散 D2 · Ch2 真值表", "done", "离散 D2"),
      item("self", "Epp §1.1–1.4 没读，顺到明天", "warn"),
    ]),
    day("2026-11-10", "深度", [
      item("main", "CTM D1 顺延到 11-12", "warn", "CTM D1"),
      item("self", "Epp §1.1–1.4 没读，顺到明天", "warn"),
    ]),
    day(
      "2026-11-11",
      "深度",
      [
        item("main", "离散 D3 · Ch2 有效论证", "now", "离散 D3"),
        item("guide", "C 语言 D1 · Ch1 起步", "plan", "C 语言 D1"),
        item("self", "Epp §1.1–1.4 pp.1–9", "plan"),
      ],
      42,
    ),
    day("2026-11-12", "深度", [
      item("main", "CTM D1 · 概念阶梯", "plan", "CTM D1"),
      item("after", "Epp pp.…（D3 课上定）", "plan"),
      item("guide", "数据结构 D1 · §1.1–2", "plan", "数据结构 D1"),
      item("self", "Epp 下一段", "plan"),
    ]),
  ],
  goals: [
    {
      course: "ctm",
      name: "CTM",
      label: "周核实 W1 · 11-13（周五整合日）：能独立画出声明式模型的图",
      done: false,
    },
    { course: "epp", name: "离散", label: "本周不做周核实（你 11-06 定的）", done: true },
  ],
  overdue: [{ course: "ctm", name: "CTM", count: 2 }],
  reviewDate: "2026-11-13",
};

export const SAMPLE_PLAN_DAY_TODAY: PlanDay = SAMPLE_PLAN_WEEK.days[5] as PlanDay;
export const SAMPLE_PLAN_DAY_OTHER: PlanDay = SAMPLE_PLAN_WEEK.days[6] as PlanDay;

/** The month grid's days, built like the design's 11 月 mock (休息 Sunday, 整合 Friday). */
export const SAMPLE_PLAN_MONTH: PlanDay[] = (() => {
  const main = ["休息", "离散", "CTM", "离散", "CTM", "整合", "低强度"];
  const days: PlanDay[] = [];
  for (let d = 1; d <= 30; d += 1) {
    const date = `2026-11-${String(d).padStart(2, "0")}`;
    const wd = (d - 1) % 7; // 0 = 周日, matching the design's mock
    const items: PlanItem[] = [];
    if (d >= 6) {
      const course = main[wd] ?? "";
      if (course !== "" && course !== "休息" && course !== "整合" && course !== "低强度") {
        items.push(item("main", course, d < 11 ? "done" : d === 11 ? "now" : "plan", `${course} D1`));
      }
      if (wd === 1 || wd === 3) items.push(item("guide", "C 语言", d < 11 ? "done" : "plan", "C 语言 D1"));
      if (wd === 2 || wd === 4)
        items.push(item("guide", "数据结构", d < 11 ? "done" : "plan", "数据结构 D1"));
    }
    days.push(
      day(
        date,
        d < 6
          ? null
          : main[wd] === "休息"
            ? "休息"
            : main[wd] === "整合"
              ? "整合"
              : main[wd] === "低强度"
                ? "低强度"
                : "深度",
        items,
      ),
    );
  }
  return days;
})();

const BASE = {
  onView: noop,
  onPrev: noop,
  onNext: noop,
  onToday: noop,
  onPrint: noop,
  onOpenDay: noop,
  onOpenAnki: noop,
  error: null,
  day: null,
  week: null,
  month: null,
  todayCard: null,
  tomorrow: null,
  todayDisabled: false,
};

export const SAMPLE_PLANBOOK_WEEK: PlanbookProps = {
  ...BASE,
  view: "week",
  label: "C1 W1 · 11-06 – 11-12",
  state: "ready",
  week: SAMPLE_PLAN_WEEK,
};

export const SAMPLE_PLANBOOK_DAY_TODAY: PlanbookProps = {
  ...BASE,
  view: "day",
  label: "11-11 周三",
  state: "ready",
  day: SAMPLE_PLAN_DAY_TODAY,
  todayDisabled: true,
  tomorrow: "明天：周四 · 主攻日 · CTM D1 + 带读 数据结构",
};

export const SAMPLE_PLANBOOK_DAY_OTHER: PlanbookProps = {
  ...BASE,
  view: "day",
  label: "11-12 周四",
  state: "ready",
  day: SAMPLE_PLAN_DAY_OTHER,
};

export const SAMPLE_PLANBOOK_MONTH: PlanbookProps = {
  ...BASE,
  view: "month",
  label: "2026 年 11 月",
  state: "ready",
  month: SAMPLE_PLAN_MONTH,
};
