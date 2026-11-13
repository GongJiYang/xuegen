// Bear Planbook：周表格五行七列、今天列、格子点击跳日视图、日视图今天 /
// 非今天（加行名）、月视图今天格与短名、周复盘日期、图例、loading / error、overdue 行。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlanbookProps } from "../contract.js";
import type { PlanDay, PlanItem, PlanWeek } from "../../core/board/planbook.js";
import { weekdayOf } from "../../core/board/planbook.js";
import { strings } from "../../core/strings.js";
import { Planbook } from "./planbook.js";

afterEach(cleanup);

const noop = vi.fn();

function item(lane: PlanItem["lane"], text: string, mark: PlanItem["mark"], short = ""): PlanItem {
  return { lane, text, short, mark, slug: null, id: null };
}

function day(
  date: string,
  type: PlanDay["type"],
  items: PlanItem[] = [],
  ankiDue: number | null = null,
): PlanDay {
  return { date, weekday: weekdayOf(date), type, isToday: date === "2026-11-11", items, ankiDue };
}

const WEEK: PlanWeek = {
  cycle: "C1",
  week: 1,
  start: "2026-11-06",
  end: "2026-11-12",
  reviewDate: "2026-11-13",
  days: [
    day("2026-11-06", "整合", [item("main", "C1 开始", "done")]),
    day("2026-11-07", "低强度", [item("main", "离散 D1", "done", "离散 D1")]),
    day("2026-11-08", "休息"),
    day("2026-11-09", "深度", [item("main", "离散 D2", "done", "离散 D2")]),
    day("2026-11-10", "深度", [item("main", "CTM D1 顺延", "warn", "CTM D1")]),
    day(
      "2026-11-11",
      "深度",
      [item("main", "离散 D3", "now", "离散 D3"), item("guide", "C 语言 D1 · Ch1 起步", "plan", "C 语言 D1")],
      42,
    ),
    day("2026-11-12", "深度", [item("main", "CTM D1", "plan", "CTM D1")]),
  ],
  goals: [{ course: "ctm", name: "CTM", label: "CTM W1 周核实", done: false }],
  overdue: [{ course: "ctm", name: "CTM", count: 2 }],
};

function props(overrides: Partial<PlanbookProps>): PlanbookProps {
  return {
    view: "week",
    onView: noop,
    label: "C1 W1",
    onPrev: noop,
    onNext: noop,
    onToday: noop,
    todayDisabled: false,
    onPrint: noop,
    state: "ready",
    error: null,
    week: WEEK,
    day: null,
    month: null,
    todayCard: null,
    tomorrow: null,
    onOpenDay: noop,
    onOpenAnki: noop,
    ...overrides,
  };
}

describe("Bear Planbook", () => {
  it("周视图：5 行（四道 + Anki）、7 列日子头", () => {
    const { container } = render(<Planbook {...props({})} />);
    expect(container.querySelectorAll(".bear-pb-lane-row")).toHaveLength(5);
    expect(container.querySelectorAll(".bear-pb-dh")).toHaveLength(7);
  });

  it("周视图：今天列有标记，Anki 只在今天给张数", () => {
    const { container } = render(<Planbook {...props({})} />);
    expect(container.querySelector(".bear-pb-dh.is-today")).toBeTruthy();
    expect(screen.getByText(strings.planbook.ankiToday(42))).toBeTruthy();
  });

  it("点格子调 onOpenDay", async () => {
    const onOpenDay = vi.fn();
    const { container } = render(<Planbook {...props({ onOpenDay })} />);
    const cells = container.querySelectorAll<HTMLButtonElement>(".bear-pb-cell");
    await userEvent.click(cells[0] as HTMLButtonElement);
    expect(onOpenDay).toHaveBeenCalledWith("2026-11-06");
  });

  it("overdue 行：每门课一条 warn 文本", () => {
    render(<Planbook {...props({})} />);
    expect(screen.getByText(strings.planbook.overdueRow("CTM", 2))).toBeTruthy();
  });

  it("本周目标带课程短名；复盘写本周后的整合日", () => {
    render(<Planbook {...props({})} />);
    expect(screen.getByText("CTM · CTM W1 周核实")).toBeTruthy();
    expect(screen.getByText(strings.planbook.reviewEmpty("2026-11-13"))).toBeTruthy();
  });

  it("复盘日期为空时不给日期", () => {
    const week: PlanWeek = { ...WEEK, reviewDate: null };
    render(<Planbook {...props({ week })} />);
    expect(screen.getByText(strings.planbook.reviewEmptyNoDate)).toBeTruthy();
  });

  it("图例不再有「→ 顺延了」", () => {
    const { container } = render(<Planbook {...props({})} />);
    expect(container.querySelector(".bear-pb-foot")?.textContent).toBe(strings.planbook.legend);
    expect(strings.planbook.legend.includes("→")).toBe(false);
  });

  it("日视图看今天：渲染传入的今日卡，不重复日期行", () => {
    render(
      <Planbook
        {...props({
          view: "day",
          week: null,
          day: day("2026-11-11", "深度"),
          todayCard: <p data-testid="today-card">今日卡</p>,
          tomorrow: "明天：周四 · 主攻日",
        })}
      />,
    );
    expect(screen.getByTestId("today-card")).toBeTruthy();
    expect(screen.getByText("明天：周四 · 主攻日")).toBeTruthy();
    expect(screen.queryByText(strings.planbook.dayCaption("2026-11-11", "周三", "深度"))).toBeNull();
  });

  it("周视图：格子写短名（PANEL-PLAN 宽屏 1920），讲后读 / 带读 / 自读以行名开头，主项课不加；全文放在 title", () => {
    const week: PlanWeek = {
      ...WEEK,
      days: WEEK.days.map((entry) =>
        entry.date === "2026-11-12"
          ? {
              ...entry,
              items: [
                item("main", "CTM D1 · 概念阶梯", "plan", "CTM D1"),
                item("after", "Epp pp.…（D3 课上定）", "plan", "离散 pp.…"),
                item("guide", "数据结构 D1 · §1.1–1.2", "plan", "数据结构 D1"),
                item("self", "Epp §1.1–1.4 pp.1–9", "plan", "Epp pp.1–9"),
              ],
            }
          : entry,
      ),
    };
    render(<Planbook {...props({ week })} />);
    expect(screen.getAllByTitle("CTM D1 · 概念阶梯")[0]?.textContent).toContain("CTM D1");
    expect(screen.getByText("讲后读 · 离散 pp.…")).toBeTruthy();
    expect(screen.getByText("带读 · 数据结构 D1")).toBeTruthy();
    expect(screen.getByText("自读 · Epp pp.1–9").getAttribute("title")).toBe("Epp §1.1–1.4 pp.1–9");
  });

  it("周视图：今天只有主项课一行加粗（is-now），其它行是普通色", () => {
    const { container } = render(<Planbook {...props({})} />);
    // 夹具里今天（11-11）是主项课 now + 带读 plan。今天 Anki 格在设计稿里也是
    // `.p2-it.is-now`，所以只看四道 lane 行（排除 Anki 行）。
    const bold = [...container.querySelectorAll(".bear-pb-lane-row:not(.is-anki) .bear-pb-it.is-now")].map(
      (node) => node.textContent,
    );
    expect(bold).toEqual([`●${strings.planbook.lanePrefix("main")}离散 D3`]);
  });

  it("周视图：今天的 Anki 格写「今天 42 张」并带「打开 →」按钮", async () => {
    const onOpenAnki = vi.fn();
    render(<Planbook {...props({ onOpenAnki })} />);
    expect(screen.getByText(strings.planbook.ankiToday(42))).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: strings.control.card.anki }));
    expect(onOpenAnki).toHaveBeenCalledTimes(1);
  });

  it("周视图：其它日子的 Anki 格是灰字「Anki」", () => {
    const { container } = render(<Planbook {...props({})} />);
    const faint = [...container.querySelectorAll(".bear-pb-it.is-faint")].map((node) => node.textContent);
    expect(faint.length).toBeGreaterThan(0);
    expect(faint.every((text) => text === strings.planbook.lanes.anki.label)).toBe(true);
  });

  it("日视图看别的天：标题保留、只读清单每项前加行名", () => {
    render(
      <Planbook
        {...props({
          view: "day",
          week: null,
          day: day("2026-11-12", "深度", [
            item("main", "CTM D1", "plan"),
            item("after", "Ch1 §1.3 · CTM", "plan"),
            item("guide", "数据结构 D1", "plan"),
            item("self", "Epp Ch1 pp.10–18", "plan"),
          ]),
        })}
      />,
    );
    expect(screen.getByText(strings.planbook.dayCaption("2026-11-12", "周四", "深度"))).toBeTruthy();
    // 主项课不加前缀，其他三行加。
    expect(screen.getByText("CTM D1")).toBeTruthy();
    expect(screen.getByText("讲后读 · Ch1 §1.3 · CTM")).toBeTruthy();
    expect(screen.getByText("带读 · 数据结构 D1")).toBeTruthy();
    expect(screen.getByText("自读 · Epp Ch1 pp.10–18")).toBeTruthy();
    expect(screen.getByText(strings.planbook.otherDayNote)).toBeTruthy();
    expect(screen.queryByTestId("today-card")).toBeNull();
  });

  it("月视图：今天格有 is-today，格子可点", async () => {
    const onOpenDay = vi.fn();
    const { container } = render(
      <Planbook
        {...props({
          view: "month",
          week: null,
          month: [day("2026-11-10", "深度"), day("2026-11-11", "深度", [item("main", "离散", "now")])],
          onOpenDay,
        })}
      />,
    );
    expect(container.querySelector(".bear-pb-mc.is-today")).toBeTruthy();
    await userEvent.click(container.querySelector(".bear-pb-mc.is-today") as HTMLButtonElement);
    expect(onOpenDay).toHaveBeenCalledWith("2026-11-11");
  });

  it("月视图：每格只写短名 + 课次，没有课次的日子写类型短标签", () => {
    const { container } = render(
      <Planbook
        {...props({
          view: "month",
          week: null,
          month: [
            day("2026-11-06", "整合", [item("main", "离散 D3 · Ch2 §2.3：有效论证", "done", "离散 D3")]),
            day("2026-11-07", "低强度"),
            day("2026-11-08", "休息"),
            day("2026-11-11", "深度", [
              item("main", "离散 D3 · Ch2 §2.3：有效论证", "now", "离散 D3"),
              item("guide", "C 语言 D1 · Ch1 起步", "plan", "C 语言 D1"),
            ]),
          ],
        })}
      />,
    );
    const cells = [...container.querySelectorAll<HTMLButtonElement>(".bear-pb-mc")];
    const text = (index: number): string => cells[index]?.textContent ?? "";
    // 整合日有课次就只写短名，不写「整合」。
    expect(text(0)).toBe("6离散 D3");
    // 没有课次的日子写类型短标签。
    expect(text(1)).toBe("7低强度");
    // 休息日空着。
    expect(text(2)).toBe("8");
    expect(text(3)).toBe("11离散 D3C 语言 D1");
    // 整节课的内容不进月格。
    expect(container.textContent?.includes("有效论证")).toBe(false);
  });

  it("loading / error 状态", () => {
    const { unmount } = render(<Planbook {...props({ state: "loading", week: null })} />);
    expect(screen.getByText(strings.planbook.loading)).toBeTruthy();
    unmount();
    render(<Planbook {...props({ state: "error", error: "读取失败", week: null })} />);
    expect(screen.getByRole("alert").textContent).toBe("读取失败");
  });
});
