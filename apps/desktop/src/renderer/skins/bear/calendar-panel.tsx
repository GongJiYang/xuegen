/**
 * Bear 日历 panel (design `?d=plan`).
 *
 * A Monday-first month grid in the drawer. Inside a study cycle each cell says
 * what the day is for — the lesson's course short name, 整合, Anki, 恢复, or
 * nothing on a rest day — and a cycle's first / last day carries a 「C1 起 /
 * C1 完」 flag. Today is a filled accent circle; the selected day a white card.
 * Days outside every cycle keep the small dots. Below, the selected day's
 * cycle line, its lessons and fixed items, then notes / records / reading.
 * Double-clicking a day opens the day editor, as in Chicago.
 */

import type { CalendarDay, CycleDayType } from "@shared/data-protocol.js";
import type { CalendarPanelProps } from "../contract.js";
import type { SessionRow } from "../../core/board/session-list.js";
import { SessionRowButton } from "./sessions-popover.js";
import { cellAuxTag, cellFlag, cellReadingTag, cellTag, dayLessons, daySlotLine, hasAux, legendNames } from "../../core/board/plan-view.js";
import { dateKey } from "../../core/board/use-calendar.js";
import { dayTitle } from "../../core/format.js";
import { strings } from "../../core/strings.js";
import { Rich } from "./rich.js";

function hasContent(day: CalendarDay | undefined): day is CalendarDay {
  return (
    day !== undefined &&
    (day.plans.length > 0 || day.records.length > 0 || day.readingDue.length > 0 || day.log.length > 0 || !!day.note)
  );
}

function Dots({ day }: { day: CalendarDay | undefined }) {
  return (
    <span className="bear-mcal-dots" aria-hidden="true">
      {day && day.plans.length > 0 && <i className="bear-mcal-dot is-plan" />}
      {day && day.records.length > 0 && <i className="bear-mcal-dot is-done" />}
      {day && day.readingDue.length > 0 && <i className="bear-mcal-dot is-read" />}
      {day && day.note && <i className="bear-mcal-dot is-note" />}
    </span>
  );
}

function DayDetail({
  date,
  day,
  courseTitles,
  onEditDay,
  slotLine,
  lessons,
  slotType,
  isToday,
  sessions,
  onOpenSession,
}: {
  date: string;
  day: CalendarDay | undefined;
  courseTitles: Record<string, string>;
  onEditDay(date: string): void;
  slotLine: string | null;
  lessons: { name: string; id: string; content: string; aux: boolean }[];
  slotType: CycleDayType | null;
  isToday: boolean;
  sessions: SessionRow[];
  onOpenSession(file: string): void;
}) {
  const titleOf = (slug: string): string => courseTitles[slug] ?? slug;
  return (
    <div className="bear-mcal-detail">
      <div className="bear-mcal-detail-head">
        <span className="bear-mcal-detail-title">{dayTitle(date)}</span>
        <button type="button" className="bear-link bear-link-accent" onClick={() => onEditDay(date)}>
          {day?.note ? strings.calendar.editNote : strings.calendar.writeNote}
        </button>
      </div>
      {slotLine && <p className="bear-muted bear-mcal-slot">{slotLine}</p>}
      {(lessons.length > 0 || slotType) && (
        <ul className="bear-mcal-items">
          {lessons.map((lesson) => (
            <li key={`${lesson.name}-${lesson.id}`} className={isToday ? "is-now" : ""}>
              <span className="bear-pg-mark">{isToday ? "●" : "○"}</span>
              <span>
                {lesson.aux && <span className="bear-cy-auxtag">{strings.cycle.auxTag}</span>}{" "}
                <b>
                  {lesson.name} {lesson.id}
                </b>{" "}
                <Rich text={lesson.content} />
              </span>
            </li>
          ))}
          {slotType === "整合" && (
            <li>
              <span className="bear-pg-mark">○</span>
              <span>{strings.plan.verifyItem}</span>
            </li>
          )}
          {slotType && slotType !== "休息" && (
            <li>
              <span className="bear-pg-mark">○</span>
              <span>{strings.plan.ankiItem}</span>
            </li>
          )}
          {slotType === "休息" && lessons.length === 0 && <li className="is-empty">{strings.plan.restItem}</li>}
        </ul>
      )}
      {!hasContent(day) ? (
        lessons.length === 0 && !slotType && <p className="bear-muted">{strings.calendar.dayEmptyHint}</p>
      ) : (
        <>
          {day.note && <p className="bear-mcal-note">{day.note}</p>}
          {day.plans.length > 0 && lessons.length === 0 && (
            <section>
              <h4>{strings.calendar.kindPlan}</h4>
              <ul className="bear-mcal-list">
                {day.plans.map((plan, index) => (
                  <li key={index}>
                    <span className="bear-plan-course">{titleOf(plan.course)}</span>
                    <span>
                      <Rich text={plan.label} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {day.records.length > 0 && (
            <section>
              <h4>{strings.calendar.kindDone}</h4>
              <ul className="bear-mcal-list">
                {day.records.map((record, index) => (
                  <li key={index}>
                    <span className="bear-plan-course">{titleOf(record.course)}</span>
                    <span>{strings.calendar.recordLine(record.heading)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {day.readingDue.length > 0 && (
            <section>
              <h4>{strings.calendar.kindReading}</h4>
              <ul className="bear-mcal-list">
                {day.readingDue.map((reading) => (
                  <li key={reading.slug}>
                    <span>{reading.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {day.log.length > 0 && (
            <section>
              <h4>{strings.calendar.kindLog}</h4>
              <ul className="bear-mcal-list">
                {day.log.map((line, index) => (
                  <li key={index}>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {sessions.length > 0 && (
        <section>
          <h4>{strings.sessions.dayHeading}</h4>
          <ul className="bear-mcal-list">
            {sessions.map((row) => (
              <li key={row.file}>
                <SessionRowButton row={row} onOpen={onOpenSession} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function CalendarPanel({
  month,
  monthKey,
  onPrevMonth,
  onNextMonth,
  cells,
  selected,
  onSelectDay,
  onEditDay,
  onToday,
  courseTitles,
  cycleMonth,
  daySessions,
  onOpenSession,
}: CalendarPanelProps) {
  const today = dateKey(new Date());
  const days = month.status === "ready" ? month.value.days : {};
  const cycle = cycleMonth.status === "ready" ? cycleMonth.value : null;
  const cycleDays = cycle ? cycle.days : {};
  const selectedType = cycleDays[selected]?.type ?? null;
  const [year, monthNumber] = monthKey.split("-").map(Number);
  return (
    <section className="bear-mcal" aria-label={strings.calendar.title}>
      <div className="bear-mcal-head">
        <span className="bear-mcal-month">{strings.calendar.monthTitle(year ?? 0, monthNumber ?? 0)}</span>
        <span className="bear-mcal-nav">
          <button type="button" className="bear-link" aria-label={strings.calendar.prevMonth} onClick={onPrevMonth}>
            ‹
          </button>
          {onToday && (
            <button type="button" className="bear-link" onClick={onToday}>
              {strings.calendar.today}
            </button>
          )}
          <button type="button" className="bear-link" aria-label={strings.calendar.nextMonth} onClick={onNextMonth}>
            ›
          </button>
        </span>
      </div>
      {month.status === "loading" && <p className="bear-muted">{strings.today.loading}</p>}
      {month.status === "error" && <p role="alert">{month.message}</p>}
      <div className="bear-mcal-grid">
        {strings.calendar.weekday.map((label) => (
          <span key={label} className="bear-mcal-wd">
            {label}
          </span>
        ))}
        {cells.map((cell) => {
          const classes = ["bear-mcal-day"];
          if (cell.out) classes.push("is-out");
          if (cell.date === today) classes.push("is-today");
          if (cell.date === selected) classes.push("is-sel");
          const slot = cycleDays[cell.date];
          if (slot?.type === "休息") classes.push("is-rest");
          const readCount = days[cell.date]?.readingDue.length ?? 0;
          const tag = cell.out ? "" : (cellReadingTag(cycle, cell.date, readCount) ?? cellTag(cycle, cell.date));
          const flag = cell.out ? null : cellFlag(cycle, cell.date);
          const auxTag = cell.out ? "" : cellAuxTag(cycle, cell.date);
          if (!cell.out && (cycle?.lessons[cell.date]?.length || slot?.type === "深度")) classes.push("is-deep");
          if (!cell.out && cycle?.recovery.includes(cell.date)) classes.push("is-recover");
          return (
            <button
              key={cell.date}
              type="button"
              className={classes.join(" ")}
              aria-label={dayTitle(cell.date)}
              aria-pressed={cell.date === selected}
              onClick={() => onSelectDay(cell.date)}
              onDoubleClick={() => onEditDay(cell.date)}
            >
              <span className="bear-mcal-num">{cell.day}</span>
              {slot || tag ? <span className="bear-mcal-tag">{tag}</span> : <Dots day={days[cell.date]} />}
              {auxTag && <span className="bear-mcal-aux">{auxTag}</span>}
              {flag && <span className="bear-mcal-flag" title={flag}>{flag}</span>}
              {(slot || tag) && days[cell.date]?.note && <i className="bear-mcal-notedot" aria-hidden="true" />}
              {(slot || tag) && readCount > 0 && <i className="bear-mcal-readdot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {Object.keys(cycleDays).length > 0 ? (
        <p className="bear-mcal-cyclegend">{hasAux(cycle) ? strings.plan.legendAux : strings.plan.legend(legendNames(cycle))}</p>
      ) : (
        <div className="bear-mcal-legend">
          <span>
            <i className="bear-mcal-dot is-plan" />
            {strings.calendar.legendPlainPlan}
          </span>
          <span>
            <i className="bear-mcal-dot is-done" />
            {strings.calendar.legendPlainDone}
          </span>
          <span>
            <i className="bear-mcal-dot is-read" />
            {strings.calendar.legendPlainReading}
          </span>
          <span>
            <i className="bear-mcal-dot is-note" />
            {strings.calendar.legendPlainNote}
          </span>
        </div>
      )}
      <DayDetail
        date={selected}
        day={days[selected]}
        courseTitles={courseTitles}
        onEditDay={onEditDay}
        slotLine={daySlotLine(cycle, selected)}
        lessons={dayLessons(cycle, selected)}
        slotType={selectedType}
        isToday={selected === today}
        sessions={daySessions(selected)}
        onOpenSession={onOpenSession}
      />
    </section>
  );
}
