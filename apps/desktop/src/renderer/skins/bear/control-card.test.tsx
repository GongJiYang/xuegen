import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ControlCardProps } from "../contract.js";
import type { ControlCardRow } from "../../core/board/control-card.js";
import { strings } from "../../core/strings.js";
import { ControlCard } from "./control-card.js";

afterEach(cleanup);

const card = strings.control.card;

const today: ControlCardRow = {
  group: "lesson",
  mark: "now",
  text: "离散 D5 · §2.1",
  button: "开课 →",
  action: { kind: "study", slug: "epp" },
  hint: null,
  lessons: [{ slug: "epp", name: "离散", id: "D5", content: "§2.1", date: "2026-11-15" }],
};

const missedC: ControlCardRow = {
  group: "lesson",
  mark: "plan",
  missed: true,
  text: "导读课 · C 语言 D1 · Ch1",
  sub: "原排 11-11",
  button: "开课 →",
  action: { kind: "study", slug: "c" },
  hint: null,
  lessons: [{ slug: "c", name: "C 语言", id: "D1", content: "Ch1", date: "2026-11-11" }],
};

const missedCtm: ControlCardRow = {
  group: "lesson",
  mark: "plan",
  missed: true,
  text: "CTM 2 节",
  sub: "原排 11-12",
  button: "开课 →",
  action: { kind: "study", slug: "ctm" },
  hint: null,
  lessons: [
    { slug: "ctm", name: "CTM", id: "D3", content: "Ch3", date: "2026-11-12" },
    { slug: "ctm", name: "CTM", id: "D4", content: "Ch4", date: "2026-11-14" },
  ],
};

const missedDs: ControlCardRow = {
  group: "lesson",
  mark: "plan",
  missed: true,
  text: "数据结构 D7 · §2.1",
  sub: "原排 11-13",
  button: "开课 →",
  action: { kind: "study", slug: "ds" },
  hint: null,
  lessons: [{ slug: "ds", name: "数据结构", id: "D7", content: "§2.1", date: "2026-11-13" }],
};

function props(rows: ControlCardRow[]): ControlCardProps {
  return {
    view: { headline: "C1 · 第 2 周", rows },
    onAction: vi.fn(),
    onAskBrief: vi.fn(),
    busy: false,
    error: null,
    extract: null,
    older: null,
  };
}

/** The fold line's button, by class: its text mixes the label, the names and 展开. */
function foldButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(".bear-cc-fold-btn");
}

describe("Bear 今日卡 · 之前没上的 N 节", () => {
  it("keeps today's rows and folds the missed ones under one line", () => {
    render(<ControlCard {...props([today, missedC, missedCtm])} />);
    expect(screen.getByText("离散 D5 · §2.1")).toBeTruthy();
    expect(screen.queryByText("导读课 · C 语言 D1 · Ch1")).toBeNull();
    expect(screen.queryByText("CTM 2 节")).toBeNull();
    const button = foldButton();
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain(card.missedFold(3));
    expect(button!.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens and closes again on click", () => {
    render(<ControlCard {...props([today, missedC, missedCtm])} />);
    fireEvent.click(foldButton()!);
    expect(screen.getByText("导读课 · C 语言 D1 · Ch1")).toBeTruthy();
    expect(screen.getByText("CTM 2 节")).toBeTruthy();
    expect(foldButton()!.getAttribute("aria-expanded")).toBe("true");
    expect(foldButton()!.textContent).toContain(card.missedClose);
    fireEvent.click(foldButton()!);
    expect(screen.queryByText("导读课 · C 语言 D1 · Ch1")).toBeNull();
    expect(foldButton()!.getAttribute("aria-expanded")).toBe("false");
  });

  it("starts open when today has no other 上课 row", () => {
    render(<ControlCard {...props([missedC])} />);
    expect(screen.getByText("导读课 · C 语言 D1 · Ch1")).toBeTruthy();
    const button = foldButton();
    expect(button).not.toBeNull();
    expect(button!.getAttribute("aria-expanded")).toBe("true");
    expect(button!.textContent).toContain(card.missedClose);
  });

  it("draws no fold line when nothing is missed", () => {
    render(<ControlCard {...props([today])} />);
    expect(screen.getByText("离散 D5 · §2.1")).toBeTruthy();
    expect(foldButton()).toBeNull();
  });

  it("names at most three lessons in the fold line", () => {
    render(<ControlCard {...props([today, missedC, missedCtm])} />);
    expect(foldButton()!.textContent).toContain("C 语言 D1、CTM D3、CTM D4");
    expect(foldButton()!.textContent).not.toContain("…");
    cleanup();
    render(<ControlCard {...props([today, missedC, missedCtm, missedDs])} />);
    expect(foldButton()!.textContent).toContain("C 语言 D1、CTM D3、CTM D4…");
    expect(foldButton()!.textContent).not.toContain("数据结构 D7");
  });
});
