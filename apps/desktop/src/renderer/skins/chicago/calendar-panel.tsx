/**
 * Chicago 日历 window body.
 *
 * The month grid (Monday-first, non-month cells at 25% dither), the ● ◆ ▲ ✎
 * marks drawn in the Fusion12Diagram font, the ◀ ▶ month controls, the legend,
 * and the selected day's detail box. A single click selects a day; a double
 * click opens the day editor (wired by the panel's `onEditDay`).
 */

import type { CalendarDay } from "@shared/data-protocol.js";
import type { CalendarPanelProps } from "../contract.js";
import type { SessionRow } from "../../core/board/session-list.js";
import { strings } from "../../core/strings.js";
import { dayMarks } from "../../core/board/use-calendar.js";
import { formatLogLine } from "../../core/board/calendar-log.js";
import { Failed, Loading, todayIso } from "./panel-shared.js";

export function CalendarPanel({
  month,
  monthKey,
  onPrevMonth,
  onNextMonth,
  cells,
  selected,
  onSelectDay,
  onEditDay,
  courseTitles,
  daySessions,
  onOpenSession,
}: CalendarPanelProps) {
  if (month.status === "loading") return <Loading />;
  if (month.status === "error") return <Failed message={month.message} />;
  const days = month.value.days;
  const [year, monthNumber] = monthKey.split("-");
  const today = todayIso();
  return (
    <div className="chicago-pane-inner">
      <div className="chicago-cal-head">
        <button type="button" className="chicago-btn" onClick={onPrevMonth} aria-label={strings.calendar.prevMonth}>
          ◀
        </button>
        <span>
          {year} 年 {Number(monthNumber)} 月
        </span>
        <button type="button" className="chicago-btn" onClick={onNextMonth} aria-label={strings.calendar.nextMonth}>
          ▶
        </button>
      </div>
      <div className="chicago-cal">
        {strings.calendar.weekday.map((label) => (
          <div key={label} className="chicago-wd">
            {label}
          </div>
        ))}
        {cells.map((cell) => (
          <div
            key={cell.date}
            className={[
              cell.out ? "chicago-out" : "",
              cell.date === today ? "chicago-today" : "",
              cell.date === selected ? "chicago-sel" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="button"
            tabIndex={0}
            onClick={() => onSelectDay(cell.date)}
            onDoubleClick={() => onEditDay(cell.date)}
          >
            <span className="chicago-d">{cell.day}</span>
            {days[cell.date]?.note && <span className="chicago-note-mark">✎</span>}
            <span className="chicago-marks">{days[cell.date] ? dayMarks(days[cell.date] ?? emptyDay) : ""}</span>
          </div>
        ))}
      </div>
      <div className="chicago-legend chicago-small">
        {strings.calendar.legendLearn}
        {"　"}
        {strings.calendar.legendPlan}
        {"　"}
        {strings.calendar.legendReading}
        {"　"}
        {strings.calendar.legendNote}
        <br />
        <b>{strings.calendar.dblclickHint}</b>
      </div>
      <DayDetail
        date={selected}
        entries={days[selected]}
        onEdit={() => onEditDay(selected)}
        courseTitles={courseTitles}
        sessions={daySessions(selected)}
        onOpenSession={onOpenSession}
      />
    </div>
  );
}

const emptyDay: CalendarDay = { records: [], plans: [], readingDue: [], log: [], note: null };

/** The day's detail box under the grid. */
function DayDetail({
  date,
  entries,
  onEdit,
  courseTitles,
  sessions,
  onOpenSession,
}: {
  date: string;
  entries?: CalendarDay;
  onEdit(): void;
  courseTitles: Record<string, string>;
  sessions: SessionRow[];
  onOpenSession(file: string): void;
}) {
  const [, monthNumber, dayNumber] = date.split("-");
  // Each row is 「类型 · 内容」, with the course name resolved from a slug so two
  // courses on the same day are distinguishable. The raw `wiki/log.md` lines lose
  // their leading "log " noise.
  const titleOf = (slug: string): string => courseTitles[slug] ?? slug;
  const rows: string[] = [];
  if (entries) {
    for (const record of entries.records) {
      rows.push(`${strings.calendar.kindRecord} · ${titleOf(record.course)}（${record.heading}）`);
    }
    for (const plan of entries.plans) {
      rows.push(`${strings.calendar.kindPlan} · ${titleOf(plan.course)}：${plan.label}`);
    }
    for (const reading of entries.readingDue) {
      rows.push(`${strings.calendar.kindReading} · ${reading.title}`);
    }
    for (const log of entries.log) rows.push(`${strings.calendar.kindLog} · ${formatLogLine(log)}`);
  }
  return (
    <div className="chicago-daybox">
      <div className="chicago-daybox-head">
        {Number(monthNumber)}月{Number(dayNumber)}日
      </div>
      {rows.length === 0 ? (
        <div>{strings.calendar.dayEmpty}</div>
      ) : (
        rows.map((row, index) => <div key={index}>{row}</div>)
      )}
      {entries?.note && <div className="chicago-daybox-note">✎ {entries.note}</div>}
      <div className="chicago-row-btns">
        <button type="button" className="chicago-btn" onClick={onEdit}>
          {entries?.note ? strings.calendar.editNote : strings.calendar.writeNote}
        </button>
      </div>
      {sessions.length > 0 && (
        <>
          <div className="chicago-daybox-head">{strings.sessions.dayHeading}</div>
          {sessions.map((row) => (
            <div key={row.file}>
              <button type="button" className="chicago-btn" onClick={() => onOpenSession(row.file)}>
                {row.time} · {row.tag} · {row.title} · {strings.sessions.count(row.count)}
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
