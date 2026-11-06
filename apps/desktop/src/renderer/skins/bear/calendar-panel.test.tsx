/**
 * Bear 日历 panel: the month title and weekday row, day selection / editing,
 * the empty-day hint, the day's plan list, and the optional 今天 button.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarPanel } from "./calendar-panel.js";
import type { CalendarPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { dayTitle } from "../../core/format.js";
import { SAMPLE_PANELS } from "../../gallery/panel-samples.js";

afterEach(cleanup);

function baseProps(overrides: Partial<CalendarPanelProps> = {}): CalendarPanelProps {
  return { tool: "calendar", ...SAMPLE_PANELS.calendar, ...overrides };
}

function firstInMonthCell() {
  const cell = SAMPLE_PANELS.calendar.cells.find((item) => !item.out);
  if (!cell) throw new Error("sample grid has no in-month cell");
  return cell;
}

describe("Bear 日历 panel", () => {
  it("shows the month title and seven weekday labels", () => {
    render(<CalendarPanel {...baseProps()} />);
    const [year, month] = SAMPLE_PANELS.calendar.monthKey.split("-").map(Number);
    expect(screen.getByText(strings.calendar.monthTitle(year ?? 0, month ?? 0))).toBeTruthy();
    for (const label of strings.calendar.weekday) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("selects a day on click and opens the editor on double click", async () => {
    const cell = firstInMonthCell();
    const onSelectDay = vi.fn();
    const onEditDay = vi.fn();
    render(<CalendarPanel {...baseProps({ onSelectDay, onEditDay })} />);
    const day = screen.getByRole("button", { name: dayTitle(cell.date) });
    await userEvent.click(day);
    expect(onSelectDay).toHaveBeenCalledWith(cell.date);
    await userEvent.dblClick(day);
    expect(onEditDay).toHaveBeenCalledWith(cell.date);
  });

  it("shows the empty hint for a day with nothing", () => {
    const cell = firstInMonthCell();
    render(
      <CalendarPanel
        {...baseProps({
          month: { status: "ready", value: { month: SAMPLE_PANELS.calendar.monthKey, days: {} } },
          selected: cell.date,
        })}
      />,
    );
    expect(screen.getByText(strings.calendar.dayEmptyHint)).toBeTruthy();
  });

  it("lists a day's plan with the course title", () => {
    const cell = firstInMonthCell();
    const { container } = render(
      <CalendarPanel
        {...baseProps({
          month: {
            status: "ready",
            value: {
              month: SAMPLE_PANELS.calendar.monthKey,
              days: {
                [cell.date]: {
                  records: [],
                  plans: [{ course: "py", label: "`@` 只是缩写" }],
                  readingDue: [],
                  log: [],
                  note: null,
                },
              },
            },
          },
          selected: cell.date,
          courseTitles: { py: "Python 装饰器入门" },
        })}
      />,
    );
    expect(screen.getByText("Python 装饰器入门")).toBeTruthy();
    expect(container.querySelector(".bear-mcal-detail code")?.textContent).toBe("@");
  });

  it("hides the 今天 button when onToday is not given and calls it when given", async () => {
    const { unmount } = render(<CalendarPanel {...baseProps()} />);
    expect(screen.queryByRole("button", { name: strings.calendar.today })).toBeNull();
    unmount();
    const onToday = vi.fn();
    render(<CalendarPanel {...baseProps({ onToday })} />);
    await userEvent.click(screen.getByRole("button", { name: strings.calendar.today }));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("writes the lesson's course or the day's use in each cycle cell, with the cycle start flag", () => {
    render(<CalendarPanel {...baseProps()} />);
    const nov6 = screen.getByRole("button", { name: dayTitle("2026-11-06") });
    expect(nov6.textContent).toContain("离散");
    expect(nov6.textContent).toContain(strings.plan.flagStart("C1"));
    expect(screen.getByRole("button", { name: dayTitle("2026-11-07") }).textContent).toContain("Anki");
    expect(screen.getByRole("button", { name: dayTitle("2026-11-10") }).textContent).toContain("CTM");
    expect(screen.getByRole("button", { name: dayTitle("2026-11-08") }).className).toContain("is-rest");
    // The legend uses ideographic spaces; keep them instead of the default whitespace collapsing.
    expect(screen.getByText(strings.plan.legend(["离散", "CTM"]), { normalizer: (text) => text })).toBeTruthy();
  });

  it("shows the selected day's cycle line and its lessons", () => {
    render(<CalendarPanel {...baseProps({ selected: "2026-11-09" })} />);
    expect(screen.getByText(strings.plan.slotLine("C1", 1, "深度", false))).toBeTruthy();
    expect(screen.getByText("离散 D2")).toBeTruthy();
    expect(screen.getByText(strings.plan.ankiItem)).toBeTruthy();
  });
});
