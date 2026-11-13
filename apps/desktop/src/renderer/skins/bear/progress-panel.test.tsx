/**
 * Bear 总进度 panel: the course accordion, the 改计划 inline form, the style
 * radio group, and the 新课程 form.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProgressPanel } from "./progress-panel.js";
import type { ProgressPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { SAMPLE_GROUPS, SAMPLE_OVERVIEW, SAMPLE_PANELS } from "../../gallery/panel-samples.js";

afterEach(cleanup);

// jsdom has no Web Animations API; the accordion's motion content calls
// `element.animate` when a row opens, so give it a cancellable stub.
if (typeof Element.prototype.animate !== "function") {
  Element.prototype.animate = vi.fn(() => ({
    cancel: vi.fn(),
    finish: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    finished: Promise.resolve(),
  })) as unknown as Element["animate"];
  Element.prototype.getAnimations = vi.fn(() => []) as unknown as Element["getAnimations"];
}

function baseProps(overrides: Partial<ProgressPanelProps> = {}): ProgressPanelProps {
  return { ...SAMPLE_PANELS.progress, tool: "progress", overview: { status: "loading" }, ...overrides };
}

function firstCourse() {
  const courses = SAMPLE_PANELS.progress.courses;
  if (courses.status !== "ready" || !courses.value[0]) throw new Error("sample courses are not ready");
  return courses.value[0];
}

describe("Bear 总进度 panel", () => {
  it("opens the first course and keeps the others closed", () => {
    const courses = SAMPLE_PANELS.progress.courses;
    if (courses.status !== "ready") throw new Error("sample courses are not ready");
    const [first, second] = courses.value;
    if (!first?.nextSession) throw new Error("sample course is missing nextSession");
    render(<ProgressPanel {...baseProps()} />);
    expect(screen.getByText(first.nextSession, { exact: false })).toBeTruthy();
    if (second?.nextSession) {
      expect(screen.queryByText(second.nextSession, { exact: false })).toBeNull();
    }
  });

  it("submits a plan change with Enter", async () => {
    const course = firstCourse();
    const onEditPlan = vi.fn();
    render(<ProgressPanel {...baseProps({ onEditPlan })} />);
    await userEvent.click(screen.getByRole("button", { name: strings.progress.editPlan }));
    await userEvent.type(screen.getByLabelText(strings.progress.editPlan), "周日休息{Enter}");
    expect(onEditPlan).toHaveBeenCalledWith(course, "周日休息");
  });

  it("changes a course's style", async () => {
    const course = firstCourse();
    const onCourseStyle = vi.fn();
    render(<ProgressPanel {...baseProps({ onCourseStyle })} />);
    const detailed = screen.getAllByRole("radio", { name: "细讲" })[0];
    if (!detailed) throw new Error("细讲 radio is missing");
    await userEvent.click(detailed);
    expect(onCourseStyle).toHaveBeenCalledWith(course.slug, "detailed");
  });

  it("keeps 建课 disabled until a title is typed", async () => {
    const onNewCourse = vi.fn();
    render(<ProgressPanel {...baseProps({ onNewCourse })} />);
    await userEvent.click(screen.getByRole("button", { name: strings.progress.newCourse }));
    const create = screen.getByRole("button", { name: strings.progress.create });
    expect(create).toHaveProperty("disabled", true);
    await userEvent.type(screen.getByLabelText(strings.progress.courseTitle), "新课");
    expect(create).toHaveProperty("disabled", false);
    await userEvent.click(create);
    expect(onNewCourse).toHaveBeenCalledTimes(1);
    expect(onNewCourse.mock.calls[0]?.[0]?.title).toBe("新课");
  });

  it("groups courses by subject with marks, materials and the learned list", async () => {
    render(<ProgressPanel {...baseProps({ groups: SAMPLE_GROUPS })} />);
    expect(screen.getByText(strings.progress.cycleTop("C1", 1, 7))).toBeTruthy();
    expect(screen.getByText("编程语言与编程范式")).toBeTruthy();
    expect(screen.getByText(strings.progress.courseMeta(1, 4, 1, 5))).toBeTruthy();
    expect(screen.getByText("!")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: `▸ ${strings.progress.materials(3, 2)}` }));
    expect(screen.getByText("SICP")).toBeTruthy();
    expect(screen.queryByText("软件工程")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: new RegExp(strings.progress.sectionLearned) }));
    expect(screen.getByText("软件工程")).toBeTruthy();
    expect(screen.getByText(strings.progress.learnedNote(1))).toBeTruthy();
    // The legend uses ideographic spaces; keep them instead of the default whitespace collapsing.
    expect(screen.getByText(strings.progress.legend, { normalizer: (text) => text })).toBeTruthy();
  });

  it("with the cycle overview shows the route end, the cycle dates and course cards", async () => {
    const user = userEvent.setup();
    render(<ProgressPanel {...baseProps({ groups: SAMPLE_GROUPS, overview: { status: "ready", value: SAMPLE_OVERVIEW } })} />);
    expect(screen.getByText("2028 年 7 月 20 日")).toBeTruthy();
    expect(screen.getByText(strings.plan.routeEndLabel)).toBeTruthy();
    expect(screen.getByText("离散数学 + 编程语言与编程范式")).toBeTruthy();
    expect(screen.getByText("11-06 → 12-24（周四）· 还剩 48 天")).toBeTruthy();
    expect(screen.queryByText(strings.progress.caption)).toBeNull();
    expect(screen.queryByText(strings.progress.cycleTop("C1", 1, 7))).toBeNull();
    expect(screen.getByText(strings.plan.courseEnd("12-24"))).toBeTruthy();
    expect(screen.getByText("/14")).toBeTruthy();
    expect(screen.getByText(strings.plan.auxNote)).toBeTruthy();
    // 「Effective C」 已含科目短名「C」，所以不带「C ·」；行尾加预计学完。
    expect(screen.getByText("Effective C")).toBeTruthy();
    expect(
      screen.getByText(`${strings.plan.auxProgress(0, 7)} · ${strings.plan.courseEnd("12-23", "aux")}`),
    ).toBeTruthy();
    expect(screen.getByText("编程语言与编程范式")).toBeTruthy();
    expect(screen.getByText("C1", { selector: "em" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: `▸ ${strings.progress.materials(3, 2)}` }));
    await user.click(screen.getAllByRole("button", { name: strings.plan.planMaterial })[0]!);
    expect((screen.getByLabelText(strings.progress.courseTitle) as HTMLInputElement).value).toBe("SICP");
    await user.click(screen.getByRole("button", { name: strings.plan.showCycles(3) }));
    expect(screen.getByText("计算机体系结构 + 计算理论")).toBeTruthy();
    expect(screen.getByRole("button", { name: strings.progress.newCourse })).toBeTruthy();
  });
});
