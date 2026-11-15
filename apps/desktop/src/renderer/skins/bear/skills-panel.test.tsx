/**
 * Bear 技能 panel：批 6 起在安装框之前多一项「总控显示「今天学过」」勾选框，
 * 复用技能列表的样式；不传 `studied` 就不显示这一项。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
