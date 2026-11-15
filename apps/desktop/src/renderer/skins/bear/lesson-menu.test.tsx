import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ControlCardRow, LessonRef } from "../../core/board/control-card.js";
import type { ControlLessonMenu } from "../contract.js";
import { strings } from "../../core/strings.js";
import { LessonMenuButton, SelfReportDialog } from "./lesson-menu.js";

afterEach(cleanup);

const d3: LessonRef = { slug: "ctm", name: "CTM", id: "D3", content: "Ch3 §3.1–3.4", date: "2026-11-14" };
const d4: LessonRef = { slug: "ctm", name: "CTM", id: "D4", content: "Ch3 §3.5", date: "2026-11-17" };

function freshMenu(): ControlLessonMenu {
  return { onSelfReport: vi.fn(), onMove: vi.fn(), onAsk: vi.fn() };
}

function lessonRow(lessons?: LessonRef[]): ControlCardRow {
  return {
    group: "lesson",
    mark: "plan",
    text: "CTM D3 · Ch3",
    button: "开课 →",
    action: { kind: "study", slug: "ctm" },
    hint: null,
    ...(lessons === undefined ? {} : { lessons }),
  };
}

const submit = strings.control.card.selfReport.submit;

describe("SelfReportDialog", () => {
  it("shows the title, one checkbox per lesson with the initial ticks, and the count", () => {
    const menu = freshMenu();
    render(<SelfReportDialog open lessons={[d3, d4]} checked={["D3"]} menu={menu} onClose={vi.fn()} />);

    expect(screen.getByText(strings.control.card.selfReport.title)).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]?.getAttribute("aria-checked")).toBe("true");
    expect(boxes[1]?.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(submit(1))).toBeTruthy();
  });

  it("hands the ticks to 总控 in lesson order and closes", () => {
    const menu = freshMenu();
    const onClose = vi.fn();
    render(<SelfReportDialog open lessons={[d3, d4]} checked={["D3"]} menu={menu} onClose={onClose} />);

    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[1]!);
    expect(screen.getByText(submit(2))).toBeTruthy();

    fireEvent.click(screen.getByText(submit(2)));
    expect(menu.onSelfReport).toHaveBeenCalledTimes(1);
    expect(menu.onSelfReport).toHaveBeenCalledWith("ctm", "CTM", ["D3", "D4"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables the submit button once nothing is ticked", () => {
    const menu = freshMenu();
    render(<SelfReportDialog open lessons={[d3, d4]} checked={["D3"]} menu={menu} onClose={vi.fn()} />);

    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    const button = screen.getByText(submit(0)) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("closes without handing anything to 总控 on 取消", () => {
    const menu = freshMenu();
    const onClose = vi.fn();
    render(<SelfReportDialog open lessons={[d3, d4]} checked={["D3"]} menu={menu} onClose={onClose} />);

    fireEvent.click(screen.getByText(strings.control.card.selfReport.cancel));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(menu.onSelfReport).not.toHaveBeenCalled();
  });

  it("shows each lesson's scheduled day as MM-DD", () => {
    const menu = freshMenu();
    render(<SelfReportDialog open lessons={[d3, d4]} checked={["D3"]} menu={menu} onClose={vi.fn()} />);

    expect(screen.getByText(strings.control.card.selfReport.planned("11-17"))).toBeTruthy();
  });
});

describe("LessonMenuButton", () => {
  it("renders the ⋯ trigger named after the row", () => {
    const row = lessonRow([d3]);
    render(<LessonMenuButton row={row} rows={[row]} menu={freshMenu()} />);

    const trigger = screen.getByRole("button", { name: strings.control.card.menu.label("CTM D3 · Ch3") });
    expect(trigger.textContent).toBe("⋯");
  });

  it("renders nothing on a row without lessons", () => {
    const row = lessonRow();
    const { container } = render(<LessonMenuButton row={row} rows={[row]} menu={freshMenu()} />);
    expect(container.firstChild).toBeNull();

    const empty = lessonRow([]);
    const { container: second } = render(<LessonMenuButton row={empty} rows={[empty]} menu={freshMenu()} />);
    expect(second.firstChild).toBeNull();
  });
});
