/**
 * Bear 今天 panel.
 *
 * 接着上次 first (the one thing to act on), then today's and tomorrow's plan
 * rows as two quiet lists, then the reading and card counts as sliding numbers.
 * Read-only except the resume button. On a study-cycle day the panel shows the
 * cycle view instead (cycle-today.tsx).
 */

import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import type { TodayPlanItem } from "../../core/today.js";
import type { TodayPanelProps } from "../contract.js";
import { cycleTodayView } from "../../core/board/cycle-today.js";
import { strings } from "../../core/strings.js";
import { CycleToday } from "./cycle-today.js";
import { Rich } from "./rich.js";

function PlanList({ title, items, empty }: { title: string; items: TodayPlanItem[]; empty: string }) {
  return (
    <div className="bear-day">
      <h3 className="bear-section">
        <span>{title}</span>
        <span className="bear-section-count">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="bear-muted">{empty}</p>
      ) : (
        <ul className="bear-plan">
          {items.map((item, index) => (
            <li key={index}>
              <span className="bear-plan-course">{item.label}</span>
              <span className="bear-plan-detail">
                <Rich text={item.detail} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bear-count">
      <dt>{label}</dt>
      <dd>{value === null ? "—" : <SlidingNumber number={value} initiallyStable />}</dd>
    </div>
  );
}

export function TodayPanel({
  todayPlan,
  tomorrowPlan,
  readingDue,
  cards,
  resume,
  startedToday,
  onResume,
  agentReady,
  cycleToday,
  cycleTomorrow,
  courses,
  anki,
  onStudyCourse,
  onVerifyCourse,
  onOpenControl,
}: TodayPanelProps) {
  const cycleDay = cycleToday.status === "ready" ? cycleToday.value : null;
  const view = cycleDay
    ? cycleTodayView(cycleDay, cycleTomorrow.status === "ready" ? cycleTomorrow.value : null)
    : null;
  if (cycleDay && view) {
    return (
      <section className="bear-today" aria-label={strings.today.title}>
        <CycleToday
          view={view}
          day={cycleDay}
          courses={courses}
          anki={anki}
          agentReady={agentReady}
          onStudyCourse={onStudyCourse}
          onVerifyCourse={onVerifyCourse}
          onOpenControl={onOpenControl}
        />
      </section>
    );
  }
  const due = readingDue.status === "ready" ? readingDue.value.dueToday : null;
  const pending = cards.status === "ready" ? cards.value.unsynced : null;
  const resumeLabel = !agentReady
    ? strings.today.preparing
    : resume && startedToday[resume.course.slug]
      ? strings.today.backToCourse
      : strings.today.resume;
  return (
    <section className="bear-today" aria-label={strings.today.title}>
      {resume ? (
        <div className="bear-resume">
          <div className="bear-resume-head">{strings.today.resumeTitle}</div>
          <div className="bear-resume-title">{resume.course.title}</div>
          <p className="bear-muted">
            {strings.today.nextSession}
            <Rich text={resume.nextSession ?? strings.today.nextSessionUnset} />
          </p>
          <button type="button" className="bear-link bear-link-accent" disabled={!agentReady} onClick={onResume}>
            {resumeLabel}
          </button>
        </div>
      ) : (
        <p className="bear-muted">{strings.today.resumeEmpty}</p>
      )}
      <PlanList title={strings.today.todayPlan} items={todayPlan} empty={strings.today.todayPlanEmpty} />
      <PlanList title={strings.today.tomorrowPlan} items={tomorrowPlan} empty={strings.today.tomorrowPlanEmpty} />
      <dl className="bear-counts">
        <Count label={strings.today.readingDue} value={due} />
        <Count label={strings.today.cardsPending} value={pending} />
      </dl>
    </section>
  );
}
