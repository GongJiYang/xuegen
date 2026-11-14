/**
 * Bear 周计划本 (design `?d=plan2`, PLANBOOK-1111 batch 3b): the 总控 session's
 * main surface — the day / week / month views with the chat in a right column.
 *
 * Mirrors the design's `.p2-*` structure one to one, renamed `.bear-pb-*`:
 * a top row (日 / 周 / 月 segment, range, ‹ 今天 ›, 打印), the week grid
 * (five lane rows over seven days), today's list or another day's read-only
 * list, and the month calendar. Every cell is a real button that jumps to the
 * day view; all copy comes from `strings.planbook` / `strings.control.card`.
 */

import type { ReactNode } from "react";
import type { PlanbookProps } from "../contract.js";
import type { PlanDay, PlanLane, PlanMark, PlanWeek } from "../../core/board/planbook.js";
import { mondayIndex } from "../../core/board/planbook.js";
import type { PlanView } from "../../core/board/planbook-nav.js";
import type { PlanMarks } from "../../core/board/plan-diff.js";
import { strings } from "../../core/strings.js";

// `warn` is a block or lesson moved past its day: a quiet ↷, not a warning (panel v2).
const MARK: Record<PlanMark, string> = { done: "✓", now: "●", plan: "○", warn: "↷" };
/** 阅读 lanes are ticked, so their not-yet-done items show an empty box. */
const READ_LANES: PlanLane[] = ["after", "self"];
const LANES: PlanLane[] = ["main", "after", "guide", "self"];
const VIEWS: PlanView[] = ["day", "week", "month"];

function Mark({ mark, lane }: { mark: PlanMark; lane?: PlanLane }) {
  const tone = mark === "done" ? "done" : mark === "now" ? "now" : mark === "warn" ? "moved" : "plain";
  const glyph = mark === "plan" && lane !== undefined && READ_LANES.includes(lane) ? "☐" : MARK[mark];
  return <span className={`bear-pb-mark is-${tone}`}>{glyph}</span>;
}

function WeekView({
  week,
  onOpenDay,
  onOpenAnki,
  marks,
}: {
  week: PlanWeek;
  onOpenDay(date: string): void;
  onOpenAnki(): void;
  marks: PlanMarks | null;
}) {
  const lane = strings.planbook.lanes;
  return (
    // Keyed by the week so paging re-mounts it and the fade-in replays.
    <div key={week.start} className="bear-pb-week">
      <div className="bear-pb-goals">
        <section>
          <p className="bear-pb-cap">{strings.planbook.goalsCaption}</p>
          {week.goals.length === 0 ? (
            <p className="bear-pb-goal is-empty">{strings.planbook.goalsEmpty}</p>
          ) : (
            week.goals.map((goal, index) => (
              <p key={index} className={`bear-pb-goal${goal.done ? " is-done" : ""}`}>
                {strings.planbook.goalRow(goal.name, goal.label)}
              </p>
            ))
          )}
        </section>
        <section>
          <p className="bear-pb-cap">{strings.planbook.reviewCaption}</p>
          <p className="bear-pb-goal is-empty">
            {week.reviewDate === null
              ? strings.planbook.reviewEmptyNoDate
              : strings.planbook.reviewEmpty(week.reviewDate)}
          </p>
        </section>
      </div>
      {week.overdue.map((row) => (
        <p key={row.course} className="bear-pb-overdue">
          <Mark mark="warn" />
          {strings.planbook.overdueRow(row.name, row.count)}
        </p>
      ))}
      <div className="bear-pb-grid">
        <div className="bear-pb-corner" />
        {week.days.map((day) => (
          <div key={day.date} className={`bear-pb-dh${day.isToday ? " is-today" : ""}`}>
            <b>
              {day.weekday.slice(-1)} {day.date.slice(5)}
            </b>
            <span>
              {day.isToday ? `${strings.planbook.today} · ` : ""}
              {day.type}
            </span>
          </div>
        ))}
        {LANES.map((laneId) => (
          <div key={laneId} className="bear-pb-lane-row">
            <div className="bear-pb-lh">
              <b>{lane[laneId].label}</b>
              <span>{lane[laneId].sub}</span>
            </div>
            {week.days.map((day) => {
              const items = day.items.filter((item) => item.lane === laneId);
              const ghosts = (marks?.ghosts[day.date] ?? []).filter((ghost) => ghost.lane === laneId);
              return (
                <button
                  key={day.date}
                  type="button"
                  className={`bear-pb-cell${day.isToday ? " is-today" : ""}${day.type === "休息" ? " is-rest" : ""}`}
                  onClick={() => onOpenDay(day.date)}
                >
                  {ghosts.map((ghost) => (
                    <span key={ghost.label} className="bear-pb-it is-ghost">
                      {ghost.label}
                      <small>{ghost.note}</small>
                    </span>
                  ))}
                  {items.map((item, index) => {
                    const note = marks?.at[`${day.date}|${item.slug ?? ""}|${item.id ?? ""}`];
                    return (
                      <span
                        key={index}
                        className={`bear-pb-it is-${item.mark === "now" ? "now" : item.mark === "done" ? "done" : "plain"}${note !== undefined ? " is-changed" : item.from !== undefined ? " is-from" : ""}`}
                        title={item.text}
                      >
                        <Mark mark={item.mark} lane={item.lane} />
                        {/* The row head names the lane (panel v2), so cells hold the short name only. */}
                        {note === undefined && item.from !== undefined ? (
                          <span>
                            {item.short || item.text}
                            <small>{strings.control.card.missedSub(item.from)}</small>
                          </span>
                        ) : (
                          item.short || item.text
                        )}
                        {note !== undefined && <small>{note}</small>}
                      </span>
                    );
                  })}
                  {day.type === "休息" && laneId === "main" && (
                    <span className="bear-pb-it is-rest">{day.type}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        <div className="bear-pb-lane-row is-anki">
          <div className="bear-pb-lh">
            <b>{lane.anki.label}</b>
            <span>{lane.anki.sub}</span>
          </div>
          {week.days.map((day) => {
            const rest = day.type === "休息";
            // Today's Anki cell carries the count and the 「打开 →」 action, so it
            // is not a button itself: two nested buttons are invalid, and the two
            // parts click differently (the day, then Anki).
            if (!rest && day.isToday && day.ankiDue !== null) {
              return (
                <div key={day.date} className="bear-pb-cell is-today">
                  <span className="bear-pb-it is-now">
                    <Mark mark="plan" />
                    <button type="button" onClick={() => onOpenDay(day.date)}>
                      {strings.planbook.ankiToday(day.ankiDue)}
                    </button>
                    <button type="button" className="bear-pb-link" onClick={onOpenAnki}>
                      {strings.planbook.ankiOpen}
                    </button>
                  </span>
                </div>
              );
            }
            return (
              <button
                key={day.date}
                type="button"
                className={`bear-pb-cell${day.isToday ? " is-today" : ""}`}
                onClick={() => onOpenDay(day.date)}
              >
                {rest ? null : <span className="bear-pb-it is-faint">{lane.anki.label}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <p className="bear-pb-foot">{strings.planbook.legend}</p>
    </div>
  );
}

function DayView({
  day,
  todayCard,
  tomorrow,
}: {
  day: PlanDay;
  todayCard: ReactNode;
  tomorrow: string | null;
}) {
  return (
    <div className="bear-pb-day">
      <section key={day.date} className="bear-pb-daylist">
        {/* Today's card carries its own 「11-11 周三 · 主攻日」 line; only other days need the caption. */}
        {todayCard === null && (
          <p className="bear-pb-cap">{strings.planbook.dayCaption(day.date, day.weekday, day.type)}</p>
        )}
        {todayCard !== null ? (
          <>
            {todayCard}
            {tomorrow !== null && <p className="bear-pb-goal bear-pb-mt">{tomorrow}</p>}
          </>
        ) : (
          <>
            <ul className="bear-pb-rows">
              {day.items.map((item, index) => (
                <li key={index} className={item.mark === "now" ? "is-now" : undefined}>
                  <Mark mark={item.mark} lane={item.lane} />
                  <span>
                    {strings.planbook.lanePrefix(item.lane)}
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
            <p className="bear-pb-meta">{strings.planbook.otherDayNote}</p>
          </>
        )}
      </section>
    </div>
  );
}

function MonthView({
  month,
  onOpenDay,
  marks,
}: {
  month: PlanDay[];
  onOpenDay(date: string): void;
  marks: PlanMarks | null;
}) {
  const first = month[0];
  const lead = first === undefined ? 0 : mondayIndex(first.date);
  return (
    <div key={first?.date} className="bear-pb-month">
      <div className="bear-pb-mgrid">
        {strings.planbook.weekdays.map((weekday) => (
          <span key={weekday} className="bear-pb-wd">
            {weekday}
          </span>
        ))}
        {Array.from({ length: lead }, (_, index) => (
          <span key={`pad-${index}`} />
        ))}
        {month.map((day) => {
          const main = day.items.find((item) => item.lane === "main");
          const guide = day.items.find((item) => item.lane === "guide");
          // One short line per lesson row (course + id); a day without lessons gets
          // its type tag instead (整合 / 低强度), and a rest day stays empty.
          const typeTag = day.type === null ? "" : strings.planbook.monthTypeShort[day.type];
          return (
            <button
              key={day.date}
              type="button"
              className={`bear-pb-mc${day.isToday ? " is-today" : ""}`}
              onClick={() => onOpenDay(day.date)}
            >
              <b>{Number(day.date.slice(8))}</b>
              {main !== undefined && (
                <em
                  className={
                    marks?.at[`${day.date}|${main.slug ?? ""}|${main.id ?? ""}`] ? "is-changed" : undefined
                  }
                >
                  {main.short}
                </em>
              )}
              {guide !== undefined && (
                <em
                  className={`is-guide${marks?.at[`${day.date}|${guide.slug ?? ""}|${guide.id ?? ""}`] ? " is-changed" : ""}`}
                >
                  {guide.short}
                </em>
              )}
              {main === undefined && guide === undefined && typeTag !== "" && (
                <em className="is-type">{typeTag}</em>
              )}
            </button>
          );
        })}
      </div>
      <p className="bear-pb-foot">{strings.planbook.monthFoot}</p>
    </div>
  );
}

export function Planbook(props: PlanbookProps) {
  return (
    <div className="bear-pb">
      <div className="bear-pb-bar-row">
        <span className="bear-pb-seg">
          {VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              className={props.view === view ? "is-on" : ""}
              onClick={() => props.onView(view)}
            >
              {strings.planbook.views[view]}
            </button>
          ))}
        </span>
        <span className="bear-pb-range">{props.label}</span>
        <span className="bear-pb-nav">
          <button type="button" className="bear-pb-btn" onClick={props.onPrev}>
            {strings.planbook.prev}
          </button>
          <button
            type="button"
            className="bear-pb-btn"
            disabled={props.todayDisabled}
            onClick={props.onToday}
          >
            {strings.planbook.today}
          </button>
          <button type="button" className="bear-pb-btn" onClick={props.onNext}>
            {strings.planbook.next}
          </button>
        </span>
        <button type="button" className="bear-pb-btn bear-pb-print" onClick={props.onPrint}>
          {strings.planbook.print}
        </button>
      </div>
      {props.state === "loading" && <p className="bear-pb-loading">{strings.planbook.loading}</p>}
      {props.state === "error" && (
        <p className="bear-pb-loading" role="alert">
          {props.error}
        </p>
      )}
      {props.state === "ready" && (
        <PlanbookBody
          view={props.view}
          day={props.day}
          week={props.week}
          month={props.month}
          todayCard={props.todayCard}
          tomorrow={props.tomorrow}
          onOpenDay={props.onOpenDay}
          onOpenAnki={props.onOpenAnki}
        />
      )}
    </div>
  );
}

/**
 * One view's content, without the switcher bar: the 总控 面板 reuses this for
 * the 今天 (day) and 本周 / 本月 (week, month) blocks. `Planbook` renders the same.
 */
export function PlanbookBody(props: {
  view: PlanView;
  day: PlanDay | null;
  week: PlanWeek | null;
  month: PlanDay[] | null;
  todayCard: ReactNode;
  tomorrow: string | null;
  onOpenDay(date: string): void;
  onOpenAnki(): void;
  /** The latest 总控 answer's changes to mark on the grid (panel only). */
  marks?: PlanMarks | null;
}) {
  const marks = props.marks ?? null;
  return (
    <>
      {props.view === "week" && props.week !== null && (
        <WeekView week={props.week} onOpenDay={props.onOpenDay} onOpenAnki={props.onOpenAnki} marks={marks} />
      )}
      {props.view === "day" && props.day !== null && (
        <DayView day={props.day} todayCard={props.todayCard} tomorrow={props.tomorrow} />
      )}
      {props.view === "month" && props.month !== null && (
        <MonthView month={props.month} onOpenDay={props.onOpenDay} marks={marks} />
      )}
    </>
  );
}
