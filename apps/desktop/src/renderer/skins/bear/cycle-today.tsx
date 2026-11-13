/**
 * Bear 今天 on a study-cycle day (design `?d=cycle`): a small headline, one
 * focus block under an accent rule, other courses' missed lessons, the Anki row,
 * and a line about tomorrow. All decisions come from `core/board/cycle-today`.
 */

import type { AnkiStatus, CourseSummary, CycleDay } from "@shared/data-protocol.js";
import { assertNever } from "@shared/protocol.js";
import type { AsyncState } from "../../core/board/state.js";
import { ankiDueCount, weekChecks, type CycleTodayView } from "../../core/board/cycle-today.js";
import { strings } from "../../core/strings.js";
import { Rich } from "./rich.js";

interface FocusProps {
  view: CycleTodayView;
  day: CycleDay;
  courses: AsyncState<CourseSummary[]>;
  agentReady: boolean;
  onStudyCourse(slug: string): void;
  onVerifyCourse(slug: string): void;
}

function Focus({ view, day, courses, agentReady, onStudyCourse, onVerifyCourse }: FocusProps) {
  const focus = view.focus;
  switch (focus.kind) {
    case "lesson": {
      const done = focus.lesson.done === true;
      return (
        <div className="bear-cy-focus">
          <div className="bear-cy-k">{strings.cycle.minutes}</div>
          <div className={done ? "bear-cy-title is-done" : "bear-cy-title"}>
            {done && <span className="bear-cy-mark">✓</span>}
            {focus.name} {focus.lesson.id}
          </div>
          <p className="bear-muted">
            <Rich text={focus.lesson.content} />
          </p>
          {focus.carriedFrom && <p className="bear-cy-carried">{strings.cycle.carried(focus.carriedFrom)}</p>}
          <button
            type="button"
            className="bear-link bear-link-accent"
            disabled={!agentReady}
            onClick={() => onStudyCourse(focus.lesson.course)}
          >
            {done ? strings.today.backToCourse : strings.cycle.start}
          </button>
        </div>
      );
    }
    case "verify": {
      const rows = courses.status === "ready" ? weekChecks(day, courses.value) : [];
      return (
        <div className="bear-cy-focus">
          <div className="bear-cy-k">{strings.cycle.verifyTitle}</div>
          <ul className="bear-cy-list">
            {rows.map((row) => (
              <li key={row.slug} className="is-now">
                <span className="bear-cy-mark">●</span>
                <span className="bear-cy-text">{strings.cycle.verifyRow(row.name, row.done, row.total)}</span>
                <button
                  type="button"
                  className="bear-link bear-link-accent"
                  disabled={!agentReady}
                  onClick={() => onVerifyCourse(row.slug)}
                >
                  {strings.cycle.verify}
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "light":
      return (
        <div className="bear-cy-focus">
          <div className="bear-cy-title">{strings.cycle.light}</div>
        </div>
      );
    case "rest":
      return (
        <div className="bear-cy-focus is-rest">
          <div className="bear-cy-title">{strings.cycle.rest}</div>
        </div>
      );
    default:
      return assertNever(focus);
  }
}

export interface CycleTodayProps extends FocusProps {
  anki: AsyncState<AnkiStatus>;
  onOpenControl: (() => void) | null;
}

export function CycleToday({ view, day, courses, anki, agentReady, onStudyCourse, onVerifyCourse, onOpenControl }: CycleTodayProps) {
  const due = anki.status === "ready" ? ankiDueCount(anki.value) : null;
  const ankiMeta = anki.status !== "ready" ? "—" : due === null ? strings.cycle.ankiOff : strings.cycle.ankiDue(due);
  const aux = view.aux;
  // A 带读 lesson already in its course's 「完成：」 line reads like the focus row: ✓ + 回到这节课 →.
  const auxDone = aux?.lesson.done === true;
  return (
    <>
      <div className="bear-cy-headrow">
        <p className="bear-cy-head">{view.headline}</p>
        {onOpenControl && (
          <button type="button" className="bear-link" onClick={onOpenControl}>
            {strings.control.open}
          </button>
        )}
      </div>
      <Focus
        view={view}
        day={day}
        courses={courses}
        agentReady={agentReady}
        onStudyCourse={onStudyCourse}
        onVerifyCourse={onVerifyCourse}
      />
      {aux && (
        <ul className="bear-cy-list">
          <li className={auxDone ? "is-aux is-done" : "is-aux"}>
            <span className="bear-cy-auxtag">{strings.cycle.auxTag}</span>
            <span className="bear-cy-text">
              {auxDone && <span className="bear-cy-mark">✓</span>}
              <b>
                {aux.name} {aux.lesson.id}
              </b>{" "}
              <Rich text={aux.lesson.content} />
            </span>
            <button
              type="button"
              className="bear-link bear-link-accent"
              disabled={!agentReady}
              onClick={() => onStudyCourse(aux.lesson.course)}
            >
              {auxDone ? strings.today.backToCourse : strings.cycle.start}
            </button>
          </li>
        </ul>
      )}
      {view.missed.length > 0 && (
        <ul className="bear-cy-list">
          {view.missed.map((row) => (
            <li key={`${row.name}-${row.id}`} className="is-warn">
              <span className="bear-cy-mark">!</span>
              <span className="bear-cy-text">{strings.cycle.missed(row.name, row.id)}</span>
              <span className="bear-cy-meta">{strings.cycle.missedNote}</span>
            </li>
          ))}
        </ul>
      )}
      {view.showAnki && (
        <ul className="bear-cy-list">
          <li className="is-plan">
            <span className="bear-cy-mark">○</span>
            <span className="bear-cy-text">{strings.cycle.anki}</span>
            <span className="bear-cy-meta">{ankiMeta}</span>
          </li>
        </ul>
      )}
      {view.tomorrow && <p className="bear-cy-next">{view.tomorrow}</p>}
    </>
  );
}
