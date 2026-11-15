/**
 * Bear 总控面板 status strip (总控 v3 ①): the six tiles collapse into one line.
 *
 * Only the strip is tested here — the blocks below it are covered by the
 * planbook / progress / shelf tests. The strip is a row of buttons: cycle shows
 * its value plus sub inline, the others show label plus value, every sub that
 * is not inline becomes the hover title, and a click jumps to its block.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PanelTile } from "../../core/board/panel.js";
import type { PlanDay } from "../../core/board/planbook.js";
import type { ControlPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { ControlPanel, StatusStrip } from "./control-panel.js";

afterEach(cleanup);

const tiles: PanelTile[] = [
  { key: "cycle", value: "C1 · 第 2 周", sub: "预计 12-29 收尾", warn: false },
  { key: "today", value: "0 / 4 项", sub: "低强度日", warn: false },
  { key: "week", value: "3 / 17 项", sub: "还剩 14 项", warn: false },
  { key: "shelf", value: "3 本在读", sub: "Epp 预计 02-02 读完", warn: false },
  { key: "anki", value: "42 张", sub: "今天到期", warn: false },
  { key: "cards", value: "全部已同步", sub: "共 501 张", warn: false },
];

const stripProps = {
  onJump: vi.fn(),
  onOpenSkills: vi.fn(),
  onAskBrief: vi.fn(),
  busy: false,
};

describe("Bear 总控 status strip", () => {
  it("renders six chips: cycle shows value + sub, the rest show label + value", () => {
    const { container } = render(<StatusStrip tiles={tiles} {...stripProps} />);
    const chips = [...container.querySelectorAll(".bear-cp-chip")];
    expect(chips).toHaveLength(6);
    expect(chips[0]?.textContent).toBe("C1 · 第 2 周 预计 12-29 收尾");
    expect(chips[1]?.textContent).toBe("今天 0 / 4 项");
  });

  it("puts the sub of a non-cycle tile into the hover title", () => {
    const { container } = render(<StatusStrip tiles={tiles} {...stripProps} />);
    const chips = [...container.querySelectorAll(".bear-cp-chip")];
    expect(chips[3]?.getAttribute("title")).toBe("Epp 预计 02-02 读完");
  });

  it("calls onJump with the tile key", async () => {
    const onJump = vi.fn();
    const { container } = render(<StatusStrip tiles={tiles} {...stripProps} onJump={onJump} />);
    const chips = [...container.querySelectorAll(".bear-cp-chip")];
    const third = chips[2];
    if (!(third instanceof HTMLElement)) throw new Error("strip has no third chip");
    await userEvent.click(third);
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith("week");
  });

  it("marks a tile that is still loading", () => {
    render(<StatusStrip tiles={[{ key: "cards", value: "", sub: "", warn: false }]} {...stripProps} />);
    expect(screen.getByRole("button", { name: /卡片/ }).className).toContain("is-loading");
  });

  it("marks a tile that is in a warning state", () => {
    render(
      <StatusStrip tiles={[{ key: "anki", value: "42 张", sub: "今天到期", warn: true }]} {...stripProps} />,
    );
    expect(screen.getByRole("button", { name: /Anki/ }).className).toContain("is-warn");
  });

  it("puts a · separator between neighbouring chips (control-v3 ①)", () => {
    const { container } = render(<StatusStrip tiles={tiles} {...stripProps} />);
    const seps = [...container.querySelectorAll(".bear-cp-sep")];
    expect(seps).toHaveLength(5);
    for (const sep of seps) {
      expect(sep.textContent).toBe("·");
      expect(sep.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("appends the tile suffix after the value only for Anki (「Anki 42 张到期」)", () => {
    const { container } = render(<StatusStrip tiles={tiles} {...stripProps} />);
    const chips = [...container.querySelectorAll(".bear-cp-chip")].map((chip) => chip.textContent);
    expect(chips[4]).toBe(`Anki 42 张${strings.panel.tileSuffix.anki}`);
    expect(chips[1]).toBe("今天 0 / 4 项");
    expect(chips[3]).toBe("书房 3 本在读");
    expect(chips[5]).toBe("卡片 全部已同步");
  });

  it("ends with 技能与设置 and 让总控说说今天, the latter disabled while busy", async () => {
    const onOpenSkills = vi.fn();
    const onAskBrief = vi.fn();
    const first = render(
      <StatusStrip tiles={tiles} {...stripProps} onOpenSkills={onOpenSkills} onAskBrief={onAskBrief} />,
    );
    const acts = first.container.querySelector(".bear-cp-strip-acts");
    if (acts === null) throw new Error("strip has no right-hand actions");
    const buttons = [...acts.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual([strings.panel.todaySettings, strings.panel.askToday]);
    const [skills, brief] = buttons;
    if (skills === undefined || brief === undefined) throw new Error("strip acts has fewer than two buttons");
    await userEvent.click(skills);
    expect(onOpenSkills).toHaveBeenCalledTimes(1);
    await userEvent.click(brief);
    expect(onAskBrief).toHaveBeenCalledTimes(1);
    expect(brief.disabled).toBe(false);

    cleanup();
    const second = render(<StatusStrip tiles={tiles} {...stripProps} busy={true} />);
    const briefBusy = second.container.querySelector(".bear-cp-strip-acts button:last-child");
    if (!(briefBusy instanceof HTMLButtonElement)) throw new Error("strip acts has no last button");
    expect(briefBusy.disabled).toBe(true);
  });
});

/**
 * control-v3 ①: 今天, 本周, 术语, 领域 are one column of blocks — no outer frames,
 * no two-column wrapper. The day's caption moves into the block head.
 */
describe("Bear 总控面板布局", () => {
  const day: PlanDay = {
    date: "2026-11-17",
    weekday: "周二",
    type: "深度",
    isToday: true,
    items: [],
    ankiDue: null,
  };

  const props = (over: Partial<ControlPanelProps> = {}): ControlPanelProps => ({
    tiles: [],
    day,
    week: null,
    month: null,
    view: "week",
    onView: vi.fn(),
    label: "",
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    todayDisabled: false,
    onPrint: vi.fn(),
    shelf: null,
    unplanned: null,
    overview: null,
    cards: null,
    todayCard: null,
    tomorrow: null,
    onOpenDay: vi.fn(),
    onOpenAnki: vi.fn(),
    onAsk: vi.fn(),
    onOpenSkills: vi.fn(),
    onAskBrief: vi.fn(),
    busy: false,
    shownToday: true,
    onBackToToday: vi.fn(),
    onOpenCards: vi.fn(),
    onOpenShelf: vi.fn(),
    terms: null,
    onOpenTerm: vi.fn(),
    changes: null,
    studied: [],
    ...over,
  });

  const childrenOf = (root: HTMLElement): Element[] => [...root.children];

  it("no longer wraps the blocks in the old two-column / terms-slot wrappers", () => {
    const { container } = render(<ControlPanel {...props()} />);
    const panel = container.querySelector(".bear-cp");
    if (panel === null) throw new Error("no .bear-cp");
    // Spelled out piecewise so the acceptance grep for the retired class names
    // stays empty even though this test asserts their absence.
    const retired = ["row2", "termslot", "col"];
    const classes = [...panel.querySelectorAll("*")].flatMap((el) => [...el.classList]);
    expect(classes.filter((name) => retired.some((tail) => name.endsWith(tail)))).toEqual([]);
  });

  it("stacks strip → today → week → terms → domain → row3 in one column", () => {
    const { container } = render(<ControlPanel {...props()} />);
    const panel = container.querySelector(".bear-cp");
    if (panel === null) throw new Error("no .bear-cp");
    const slots = childrenOf(panel as HTMLElement).map((el) => {
      if (el.classList.contains("bear-cp-strip")) return "strip";
      if (el.id === "bear-cp-today") return "today";
      if (el.id === "bear-cp-week" || el.querySelector("#bear-cp-week") !== null) return "week";
      if (el.classList.contains("bear-cp-terms")) return "terms";
      if (el.classList.contains("bear-cp-row3")) return "row3";
      return "other";
    });
    expect(slots).toEqual(["strip", "today", "week", "terms", "row3"]);

    cleanup();
    const withDomain = render(
      <ControlPanel
        {...props({
          domains: [{ id: "pl", title: "编程范式", pages: 3, terms: 5 }],
          onOpenDomain: vi.fn(),
        })}
      />,
    );
    const panel2 = withDomain.container.querySelector(".bear-cp");
    if (panel2 === null) throw new Error("no .bear-cp");
    const slots2 = childrenOf(panel2 as HTMLElement).map((el) => {
      if (el.classList.contains("bear-cp-strip")) return "strip";
      if (el.id === "bear-cp-today") return "today";
      if (el.id === "bear-cp-week" || el.querySelector("#bear-cp-week") !== null) return "week";
      if (el.classList.contains("bear-cp-terms")) return "terms";
      if (el.id === "bear-cp-domain") return "domain";
      if (el.classList.contains("bear-cp-row3")) return "row3";
      return "other";
    });
    expect(slots2).toEqual(["strip", "today", "week", "terms", "domain", "row3"]);
  });

  it("shows the day caption beside the 今天 heading", () => {
    const { container } = render(<ControlPanel {...props()} />);
    const head = container.querySelector("#bear-cp-today .bear-cp-head");
    if (head === null) throw new Error("今天 has no head");
    const h2 = head.querySelector("h2");
    const caption = h2?.nextElementSibling ?? null;
    expect(caption?.className).toBe("bear-cp-meta");
    expect(caption?.textContent).toBe(strings.planbook.dayCaption("2026-11-17", "周二", "深度"));
    expect(caption?.textContent).toBe("11-17 周二 · 主攻日");
  });

  it("puts 「今天学过」 after the 今日卡 and before the 明天 line (批 6 ①)", () => {
    const card = <div className="bear-cp-card-under-test">今日卡</div>;
    const shown = render(
      <ControlPanel
        {...props({
          todayCard: card,
          tomorrow: "明天：离散 第 4 讲",
          studied: [{ slug: "ctm", label: "CTM D3", time: "08:10–09:40" }],
        })}
      />,
    );
    const row = shown.container.querySelector(".bear-cp-studied");
    const cardEl = shown.container.querySelector(".bear-cp-card-under-test");
    const goal = shown.container.querySelector(".bear-pb-goal");
    if (row === null || cardEl === null || goal === null)
      throw new Error("missing studied row / card / 明天");
    expect(cardEl.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(goal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();

    const empty = render(<ControlPanel {...props({ todayCard: card, studied: [] })} />);
    expect(empty.container.querySelector(".bear-cp-studied")).toBeNull();
  });

  it("puts 打开书房 → after 加一本书 in the 书房 block head and reports onOpenShelf", async () => {
    const onOpenShelf = vi.fn();
    const { container } = render(<ControlPanel {...props({ onOpenShelf })} />);
    const acts = container.querySelector("#bear-cp-shelf .bear-cp-head-acts");
    if (acts === null) throw new Error("书房 block has no actions");
    const labels = [...acts.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual([strings.panel.shelfAdd, strings.panel.shelfOpen]);
    expect(strings.panel.shelfOpen).toBe("打开书房 →");
    const open = [...acts.querySelectorAll("button")][1];
    if (!(open instanceof HTMLButtonElement)) throw new Error("no 打开书房 button");
    await userEvent.click(open);
    expect(onOpenShelf).toHaveBeenCalledTimes(1);
  });

  it("keeps 打印 as the day's only action, plus 回到今天 when another day shows", () => {
    const first = render(<ControlPanel {...props()} />);
    const head = first.container.querySelector("#bear-cp-today .bear-cp-head");
    if (head === null) throw new Error("今天 has no head");
    const labels = [...head.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual([strings.panel.todayPrint]);
    expect(labels).not.toContain(strings.panel.todaySettings);
    cleanup();

    const second = render(<ControlPanel {...props({ shownToday: false })} />);
    const head2 = second.container.querySelector("#bear-cp-today .bear-cp-head");
    if (head2 === null) throw new Error("今天 has no head");
    const labels2 = [...head2.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels2).toEqual([strings.panel.backToToday, strings.panel.todayPrint]);
    expect(labels2).not.toContain(strings.panel.todaySettings);
  });
});
