/**
 * Chicago 总控计划本: the contract's minimal implementation — a `<section>`
 * with the view buttons and the current view's days as plain lists (the real
 * planbook layout is Bear's; this skin only has to render the slot).
 */

import type { PlanbookProps } from "../contract.js";
import type { PlanMark } from "../../core/board/planbook.js";
import type { PlanView } from "../../core/board/planbook-nav.js";
import { strings } from "../../core/strings.js";

const MARK: Record<PlanMark, string> = { done: "✓", now: "●", plan: "○", warn: "!" };
const VIEWS: PlanView[] = ["day", "week", "month"];

export function Planbook(props: PlanbookProps) {
  return (
    <section className="chicago-pane" data-slot="planbook">
      <div className="chicago-row-btns">
        {VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            className="chicago-btn"
            aria-pressed={props.view === view}
            onClick={() => props.onView(view)}
          >
            {strings.planbook.views[view]}
          </button>
        ))}
        <span>{props.label}</span>
        <button type="button" className="chicago-btn" onClick={props.onPrev}>
          {strings.planbook.prev}
        </button>
        <button type="button" className="chicago-btn" disabled={props.todayDisabled} onClick={props.onToday}>
          {strings.planbook.today}
        </button>
        <button type="button" className="chicago-btn" onClick={props.onNext}>
          {strings.planbook.next}
        </button>
        <button type="button" className="chicago-btn" onClick={props.onPrint}>
          {strings.planbook.print}
        </button>
      </div>
      {props.state === "loading" && <p>{strings.planbook.loading}</p>}
      {props.state === "error" && <p role="alert">{props.error}</p>}
      {props.state === "ready" && props.week !== null && (
        <ul>
          {props.week.days.map((day) => (
            <li key={day.date}>
              <button type="button" className="chicago-btn" onClick={() => props.onOpenDay(day.date)}>
                {day.date} {day.weekday}
                {day.isToday ? ` · ${strings.planbook.today}` : ""}
              </button>
              <ul>
                {day.items.map((item, index) => (
                  <li key={index}>
                    {MARK[item.mark]} {strings.planbook.lanePrefix(item.lane)}
                    {item.text}
                  </li>
                ))}
                {day.ankiDue !== null && (
                  <li>
                    {strings.planbook.ankiToday(day.ankiDue)}{" "}
                    <button type="button" className="chicago-btn" onClick={props.onOpenAnki}>
                      {strings.control.card.anki}
                    </button>
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {props.state === "ready" && props.day !== null && (
        <>
          {props.todayCard ?? (
            <>
              <ul>
                {props.day.items.map((item, index) => (
                  <li key={index}>
                    {MARK[item.mark]} {item.text}
                  </li>
                ))}
              </ul>
              <p>{strings.planbook.otherDayNote}</p>
            </>
          )}
          {props.tomorrow !== null && <p>{props.tomorrow}</p>}
        </>
      )}
      {props.state === "ready" && props.month !== null && (
        <ul>
          {props.month.map((day) => (
            <li key={day.date}>
              <button type="button" className="chicago-btn" onClick={() => props.onOpenDay(day.date)}>
                {day.date}
                {day.isToday ? ` · ${strings.planbook.today}` : ""}
              </button>{" "}
              {day.items.map((item) => item.text).join(" · ")}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
