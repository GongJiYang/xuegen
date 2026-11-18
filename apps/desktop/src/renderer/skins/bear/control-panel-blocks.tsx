/** 总控面板的几个区块，从 control-panel.tsx 搬出（只搬不改） */

import type { ControlPanelProps } from "../contract.js";
import type { PlanView } from "../../core/board/planbook-nav.js";
import type { CardsStats, CycleOverview } from "@shared/data-protocol.js";
import { strings } from "../../core/strings.js";
import type { CourseStopProps } from "../../core/course-stop/view.js";
import { CourseMenu, StoppedList } from "./course-stop.js";

export function Cards({ stats }: { stats: CardsStats | null }) {
  if (stats === null) return <p className="bear-cp-meta">{strings.panel.blockLoading}</p>;
  return (
    <ul className="bear-cp-list bear-cp-cards">
      <li className="bear-cp-list-head">
        <span>{strings.panel.cardsDeckHead}</span>
        <span className="bear-cp-num">{strings.panel.cardsCount}</span>
        <span className="bear-cp-num">{strings.panel.cardsSync}</span>
      </li>
      {stats.decks.map((deck) => (
        <li key={deck.deck}>
          <span>{deck.deck}</span>
          <span className="bear-cp-num">{deck.total}</span>
          <span className="bear-cp-num">{deck.unsynced || "—"}</span>
        </li>
      ))}
      {stats.broken > 0 && (
        <li className="bear-cp-meta is-warn">{strings.panel.cardsBroken(stats.broken)}</li>
      )}
    </ul>
  );
}

/** The grey line under a main course in 总进度: what comes next, or the last lesson's date. */
export function progressLine(
  course: CycleOverview["courses"][number],
  today: string,
): { text: string; warn: boolean } {
  const panel = strings.panel;
  if (course.next === null) return { text: panel.progressFinished, warn: false };
  const end = course.end === null ? "" : ` · ${panel.progressEnd(course.end)}`;
  if (course.next.date < today)
    return { text: panel.progressLate(course.next.id, course.next.date) + end, warn: false };
  return {
    text: panel.progressNext(course.next.id, course.next.date, course.next.date === today) + end,
    warn: false,
  };
}

export function Progress({
  overview,
  courseStop,
}: {
  overview: CycleOverview | null;
  courseStop?: CourseStopProps | undefined;
}) {
  if (overview === null) return <p className="bear-cp-meta">{strings.panel.blockLoading}</p>;
  return (
    <div className="bear-cp-prog">
      {overview.courses
        .filter((course) => course.role === "main")
        .map((course) => (
          <div key={course.slug} className="bear-cp-row">
            <p className="bear-cp-name">
              {course.name}
              <span className="bear-cp-num">
                {course.done} / {course.total}
              </span>
              {courseStop !== undefined && (
                <CourseMenu
                  slug={course.slug}
                  name={course.name}
                  pending={courseStop.pending}
                  onStop={courseStop.onStop}
                />
              )}
            </p>
            <div className="bear-cp-bar">
              <i style={{ width: `${course.total === 0 ? 0 : (course.done / course.total) * 100}%` }} />
            </div>
            {(() => {
              const line = progressLine(course, overview.date);
              return <p className={`bear-cp-meta${line.warn ? " is-warn" : ""}`}>{line.text}</p>;
            })()}
          </div>
        ))}
      {courseStop !== undefined && <StoppedList {...courseStop} />}
      {courseStop?.error && courseStop.stopped.length === 0 && (
        <p className="bear-cp-meta" role="status">
          {courseStop.error}
        </p>
      )}
      {overview.cycle !== null && (
        <p className="bear-cp-meta bear-cp-route">
          {strings.panel.progressCycle(overview.cycle.cycle, overview.cycle.end, overview.cycle.plannedEnd)}
        </p>
      )}
      {(overview.cycle?.next ?? null) !== null || overview.route !== null ? (
        <p className="bear-cp-meta">
          {[
            overview.cycle?.next
              ? strings.panel.progressNext2(overview.cycle.next.cycle, overview.cycle.next.start)
              : null,
            overview.route ? strings.panel.progressRoute(overview.route.end) : null,
          ]
            .filter((part) => part !== null)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

/** 周 / 月 switch, ‹ 今天 ›, and the range title for the 本周 / 本月 block. */
export function WeekControls(props: ControlPanelProps) {
  const views: PlanView[] = ["week", "month"];
  return (
    <div className="bear-cp-controls">
      <span className="bear-pb-seg">
        {views.map((view) => (
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
      <span className="bear-cp-meta">{props.label}</span>
      <span className="bear-cp-nav">
        <button type="button" className="bear-cp-link" onClick={props.onPrev}>
          {strings.planbook.paging[props.view].prev}
        </button>
        <button type="button" className="bear-cp-link" disabled={props.todayDisabled} onClick={props.onToday}>
          {strings.planbook.paging[props.view].now}
        </button>
        <button type="button" className="bear-cp-link" onClick={props.onNext}>
          {strings.planbook.paging[props.view].next}
        </button>
      </span>
    </div>
  );
}
