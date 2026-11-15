/**
 * The 「＋」 popover's 开一门课 section (batch-v3-f, 11-15): the courses to open
 * sit above the session list; the ones outside today's cycle hide behind
 * 「其他课程 N 门」.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SessionsView } from "../contract.js";
import { strings } from "../../core/strings.js";
import { SessionsButton } from "./sessions-popover.js";

afterEach(cleanup);

function sessions(overrides: Partial<SessionsView> = {}): SessionsView {
  return {
    open: true,
    onOpenChange: vi.fn(),
    status: "ready",
    groups: [],
    onPick: vi.fn(),
    onNew: vi.fn(),
    courses: [
      { slug: "epp", label: "离散", sub: "今天 D5", group: "cycle" },
      { slug: "c", label: "导读课 · C 语言", sub: "D1 · 原排 11-11", group: "cycle" },
      { slug: "mech", label: "机械可解释性", sub: null, group: "other" },
      { slug: "algo", label: "算法", sub: null, group: "other" },
    ],
    onOpenCourse: vi.fn(),
    ...overrides,
  };
}

describe("Bear 「＋」 popover — 开一门课", () => {
  it("lists the cycle's courses with their lesson line above the session list", () => {
    render(<SessionsButton sessions={sessions()} control={null} title={null} plus />);

    expect(screen.getByText(strings.sessions.openCourse)).toBeTruthy();
    expect(screen.getByText("离散")).toBeTruthy();
    expect(screen.getByText("导读课 · C 语言")).toBeTruthy();
    expect(screen.getByText("今天 D5")).toBeTruthy();
    expect(screen.getByText("D1 · 原排 11-11")).toBeTruthy();
    // The 开一门课 block comes before 还没有会话。
    const heading = screen.getByText(strings.sessions.openCourse);
    const none = screen.getByText(strings.sessions.none);
    expect(heading.compareDocumentPosition(none) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("folds the other courses behind 其他课程 N 门 until it is opened", () => {
    render(<SessionsButton sessions={sessions()} control={null} title={null} plus />);

    expect(screen.queryByText("机械可解释性")).toBeNull();
    const more = screen.getByRole("button", { name: new RegExp(strings.sessions.otherCourses(2)) });
    expect(more.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("机械可解释性")).toBeTruthy();
    expect(screen.getByText("算法")).toBeTruthy();
  });

  it("opens the course's today session when a row is picked", () => {
    const view = sessions();
    render(<SessionsButton sessions={view} control={null} title={null} plus />);

    fireEvent.click(screen.getByText("离散"));
    expect(view.onOpenCourse).toHaveBeenCalledTimes(1);
    expect(view.onOpenCourse).toHaveBeenCalledWith("epp");
  });

  it("shows no 开一门课 heading without rows", () => {
    const view = sessions();
    delete view.courses;
    render(<SessionsButton sessions={view} control={null} title={null} plus />);
    expect(screen.queryByText(strings.sessions.openCourse)).toBeNull();
  });
});
