import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { courseStopStrings } from "../../core/course-stop/strings.js";
import type { StoppedCourse } from "../../core/course-stop/view.js";
import { CourseMenu, StoppedList } from "./course-stop.js";

afterEach(cleanup);

// jsdom has no Web Animations API; the dropdown staggers its items with
// `element.animate`, so give it a cancellable stub (same as plan-progress.test).
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

async function openMenu(name: string): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: courseStopStrings.more(name) }));
  await screen.findByRole("menuitem", { name: new RegExp(courseStopStrings.stop) });
}

describe("CourseMenu", () => {
  it("offers 停用这门课… and confirms it with a dialog that starts on 取消", async () => {
    const onStop = vi.fn();
    render(<CourseMenu slug="ctm" name="CTM" pending={null} onStop={onStop} />);

    await openMenu("CTM");
    await userEvent.click(screen.getByRole("menuitem", { name: new RegExp(courseStopStrings.stop) }));

    expect(await screen.findByText(courseStopStrings.dialogTitle("CTM"))).toBeTruthy();
    expect(screen.getByText(courseStopStrings.dialogBody1)).toBeTruthy();
    expect(screen.getByText(courseStopStrings.dialogBody2)).toBeTruthy();

    const cancel = screen.getByRole("button", { name: courseStopStrings.cancel });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);

    expect(onStop).not.toHaveBeenCalled();
    expect(screen.queryByText(courseStopStrings.dialogTitle("CTM"))).toBeNull();
  });

  it("hands the slug to onStop once and closes on 停用", async () => {
    const onStop = vi.fn();
    render(<CourseMenu slug="ctm" name="CTM" pending={null} onStop={onStop} />);

    await openMenu("CTM");
    await userEvent.click(screen.getByRole("menuitem", { name: new RegExp(courseStopStrings.stop) }));
    await userEvent.click(await screen.findByRole("button", { name: courseStopStrings.confirm }));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith("ctm");
    expect(screen.queryByText(courseStopStrings.dialogTitle("CTM"))).toBeNull();
  });
});

describe("StoppedList", () => {
  const stopped: StoppedCourse[] = [
    { slug: "c-language", name: "C 语言", on: "11-15" },
    { slug: "data-structures", name: "数据结构", on: "11-15" },
  ];

  function props(overrides: Partial<Parameters<typeof StoppedList>[0]> = {}) {
    return { stopped, pending: null, error: null, onResume: vi.fn(), ...overrides };
  }

  it("summarises the stopped courses and shows each row once expanded", () => {
    render(<StoppedList {...props()} />);

    expect(screen.getByText("已停用 2 门 · C 语言、数据结构")).toBeTruthy();
    expect(screen.getByText("C 语言")).toBeTruthy();
    expect(screen.getAllByText(courseStopStrings.on("11-15"))).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: courseStopStrings.resume })).toHaveLength(2);
  });

  it("resumes the row's course", () => {
    const onResume = vi.fn();
    render(<StoppedList {...props({ onResume })} />);

    fireEvent.click(screen.getAllByRole("button", { name: courseStopStrings.resume })[0]!);
    expect(onResume).toHaveBeenCalledWith("c-language");
  });

  it("shows 正在恢复… on the row whose resume is running", () => {
    render(<StoppedList {...props({ pending: "c-language" })} />);

    const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[0]?.textContent).toBe(courseStopStrings.resuming);
    expect(buttons[1]?.disabled).toBe(true);
  });

  it("renders nothing when no course is stopped", () => {
    const { container } = render(<StoppedList {...props({ stopped: [] })} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the failure as a status line", () => {
    render(<StoppedList {...props({ error: "没做成：权限不够" })} />);
    expect(screen.getByRole("status").textContent).toBe("没做成：权限不够");
  });
});
