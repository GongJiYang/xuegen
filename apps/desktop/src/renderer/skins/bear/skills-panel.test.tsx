/**
 * Bear 技能 panel：批 6 起在安装框之前多一项「总控显示「今天学过」」勾选框，
 * 复用技能列表的样式；不传 `studied` 就不显示这一项。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SkillsPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { SAMPLE_PANELS } from "../../gallery/panel-samples.js";
import { SkillsPanel } from "./skills-panel.js";

afterEach(cleanup);

function baseProps(overrides: Partial<SkillsPanelProps> = {}): SkillsPanelProps {
  return { ...SAMPLE_PANELS.skills, tool: "skills", ...overrides };
}

describe("Bear 技能 panel · 今天学过开关", () => {
  it("puts the checkbox first and reports a tick", async () => {
    const onToggle = vi.fn();
    const { container } = render(<SkillsPanel {...baseProps({ studied: { on: true, onToggle } })} />);
    const items = [...container.querySelectorAll(".bear-skill-list li")];
    expect(items.length).toBeGreaterThanOrEqual(1);
    const first = items[0];
    if (first === undefined) throw new Error("skill list is empty");
    const box = first.querySelector('input[type="checkbox"]');
    if (!(box instanceof HTMLInputElement)) throw new Error("first item has no checkbox");
    expect(box.checked).toBe(true);
    expect(first.textContent).toContain(strings.control.card.studiedSetting);
    expect(first.textContent).toContain("总控显示「今天学过」");
    await userEvent.click(box);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("has no such item when the caller does not pass studied", () => {
    const { container } = render(<SkillsPanel {...baseProps()} />);
    expect(screen.queryByText(strings.control.card.studiedSetting)).toBeNull();
    const labels = [...container.querySelectorAll(".bear-skill-list label")].map(
      (label) => label.textContent,
    );
    expect(labels.every((label) => !label?.includes(strings.control.card.studiedSetting))).toBe(true);
  });
});

describe("Bear 技能 panel · 学根一行", () => {
  it("shows the version and asks for a check", async () => {
    const onCheck = vi.fn();
    render(
      <SkillsPanel
        {...baseProps({ about: { version: "0.15.0", line: null, checking: false, onCheck } })}
      />,
    );
    expect(screen.getByText(strings.about.title)).toBeTruthy();
    expect(screen.getByText("0.15.0")).toBeTruthy();
    const button = screen.getByRole("button", { name: strings.about.check });
    expect(button.hasAttribute("disabled")).toBe(false);
    await userEvent.click(button);
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it("disables the button while checking", () => {
    render(
      <SkillsPanel
        {...baseProps({
          about: { version: "0.15.0", line: null, checking: true, onCheck: vi.fn() },
        })}
      />,
    );
    const button = screen.getByRole("button", { name: strings.about.check });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("writes the result line as a status", () => {
    const { container } = render(
      <SkillsPanel
        {...baseProps({
          about: { version: "0.15.0", line: "已是最新版本 v0.15.0", checking: false, onCheck: vi.fn() },
        })}
      />,
    );
    const slot = container.querySelector('[data-slot="skills-about"]');
    if (!(slot instanceof HTMLElement)) throw new Error("no 学根 row");
    const line = within(slot).getByRole("status");
    expect(line.textContent).toBe("已是最新版本 v0.15.0");
  });

  it("has no 检查更新 button without about", () => {
    render(<SkillsPanel {...baseProps()} />);
    expect(screen.queryByRole("button", { name: strings.about.check })).toBeNull();
  });
});

const CHECK_NO_PROBLEMS = {
  last: "上次 11-16 10:20",
  button: "重新检查",
  running: false,
  status: null,
  groups: [
    { title: "库", hint: "断链、概念页来源、文件命名", count: 0, lines: [] },
    { title: "课程", hint: "只读锁、完成标记、排期与记录对得上", count: 0, lines: [] },
  ],
  hasProblems: false,
};

const CHECK_WITH_PROBLEMS = {
  ...CHECK_NO_PROBLEMS,
  groups: [
    { title: "库", hint: "断链、概念页来源、文件命名", count: 0, lines: [] },
    {
      title: "课程",
      hint: "只读锁、完成标记、排期与记录对得上",
      count: 2,
      lines: ["ctm · 课程页不是只读", "课程看板和课程页对不上"],
    },
  ],
  hasProblems: true,
};

describe("Bear 技能 panel · 库检查", () => {
  it("shows the last check and both clean groups", () => {
    const { container } = render(
      <SkillsPanel {...baseProps({ check: { ...CHECK_NO_PROBLEMS, onRun: vi.fn() } })} />,
    );
    const slot = container.querySelector('[data-slot="skills-check"]');
    if (!(slot instanceof HTMLElement)) throw new Error("no 库检查 block");
    expect(within(slot).getByText("库检查")).toBeTruthy();
    expect(within(slot).getByText("上次 11-16 10:20")).toBeTruthy();
    const rows = [...slot.querySelectorAll(".bear-skill-check-row.is-ok")].map((row) => row.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("✓");
    expect(rows[0]).toContain("库：没有问题");
    expect(rows[0]).toContain("断链、概念页来源、文件命名");
    expect(rows[1]).toContain("✓");
    expect(rows[1]).toContain("课程：没有问题");
    expect(rows[1]).toContain("只读锁、完成标记、排期与记录对得上");
    expect(screen.queryByRole("button", { name: "交给总控 →" })).toBeNull();
  });

  it("opens the course problems and hands them to 总控 when connected", async () => {
    const onAsk = vi.fn();
    const { container } = render(
      <SkillsPanel {...baseProps({ check: { ...CHECK_WITH_PROBLEMS, onRun: vi.fn(), onAsk } })} />,
    );
    const details = container.querySelector("details");
    if (!(details instanceof HTMLDetailsElement)) throw new Error("no problem group");
    expect(details.open).toBe(true);
    expect(details.querySelector("summary")?.textContent).toContain("课程：2 个问题");
    expect(within(details).getByText("ctm · 课程页不是只读")).toBeTruthy();
    expect(within(details).getByText("课程看板和课程页对不上")).toBeTruthy();
    const ask = screen.getByRole("button", { name: "交给总控 →" });
    await userEvent.click(ask);
    expect(onAsk).toHaveBeenCalledTimes(1);
  });

  it("has no 交给总控 button without onAsk", () => {
    render(<SkillsPanel {...baseProps({ check: { ...CHECK_WITH_PROBLEMS, onRun: vi.fn() } })} />);
    expect(screen.queryByRole("button", { name: "交给总控 →" })).toBeNull();
  });

  it("runs the check and disables the button while running", async () => {
    const onRun = vi.fn();
    const { container, rerender } = render(
      <SkillsPanel {...baseProps({ check: { ...CHECK_NO_PROBLEMS, onRun } })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "重新检查" }));
    expect(onRun).toHaveBeenCalledTimes(1);
    rerender(
      <SkillsPanel
        {...baseProps({
          check: { ...CHECK_NO_PROBLEMS, running: true, status: "正在检查…", onRun },
        })}
      />,
    );
    const button = screen.getByRole("button", { name: "重新检查" });
    expect(button.hasAttribute("disabled")).toBe(true);
    const slot = container.querySelector('[data-slot="skills-check"]');
    if (!(slot instanceof HTMLElement)) throw new Error("no 库检查 block");
    expect(within(slot).getByRole("status").textContent).toBe("正在检查…");
  });

  it("has no 库检查 block without check", () => {
    const { container } = render(<SkillsPanel {...baseProps()} />);
    expect(container.querySelector('[data-slot="skills-check"]')).toBeNull();
  });
});
