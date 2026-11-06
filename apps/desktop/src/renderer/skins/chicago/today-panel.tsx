/**
 * Chicago 今天 window body.
 *
 * Rolling counts (今天计划 / 明天 / 到期阅读 / 待同步卡片) plus the 接着上次 card, ported
 * from the design's `#today`. 「今天计划」 replaces the old opaque 课程活动 count: it
 * shows the number of concrete items and, on hover/click, lists them (the day's
 * course records, plan rows, and reading due). The resume card comes from the
 * pure `resumePoint` result; while the agent is starting it is disabled and
 * reads 准备中… instead of dropping the click.
 */

import { useState } from "react";
import type { TodayPanelProps } from "../contract.js";
import type { TodayPlanItem } from "../../core/today.js";
import { strings } from "../../core/strings.js";
import { cycleHeadline } from "../../core/board/cycle-today.js";
import { Count } from "./widgets.js";
import { Note } from "./panel-shared.js";

/** A count that unfolds its item list on hover or click (今天计划 / 明天). */
function PlanCount({ label, items, empty }: { label: string; items: TodayPlanItem[]; empty: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="chicago-count chicago-count-btn"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <span>{label}</span>
        <b>{items.length}</b>
      </button>
      {open && (
        <ul className="chicago-plan-list">
          {items.length === 0 ? (
            <li className="chicago-small">{empty}</li>
          ) : (
            items.map((item, index) => (
              <li key={index}>
                <span>{item.label}</span>
                <span className="chicago-small">{item.detail}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </>
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
}: TodayPanelProps) {
  const dueToday = readingDue.status === "ready" ? readingDue.value.dueToday : "—";
  const pending = cards.status === "ready" ? cards.value.unsynced : "—";
  const cycleLine = cycleToday.status === "ready" ? cycleHeadline(cycleToday.value) : null;
  return (
    <div className="chicago-pane-inner">
      {cycleLine && <div className="chicago-small">{cycleLine}</div>}
      <PlanCount label={strings.today.todayPlan} items={todayPlan} empty={strings.today.todayPlanEmpty} />
      <PlanCount label={strings.today.tomorrowPlan} items={tomorrowPlan} empty={strings.today.tomorrowPlanEmpty} />
      <Count label={strings.today.readingDue} value={dueToday} />
      <Count label={strings.today.cardsPending} value={pending} />
      {resume ? (
        <div className="chicago-resume">
          <div className="chicago-resume-head">
            <span>{strings.today.resumeTitle}</span>
            <span>
              {resume.course.title} · {resume.course.lastRecord?.date ?? ""}
            </span>
          </div>
          <div className="chicago-small">
            {strings.today.nextSession}
            {resume.nextSession ?? strings.today.nextSessionUnset}
          </div>
          <div className="chicago-row-btns">
            <span className="chicago-def">
              <button type="button" className="chicago-btn" disabled={!agentReady} onClick={onResume}>
                {agentReady
                  ? startedToday[resume.course.slug]
                    ? strings.today.backToCourse
                    : strings.today.resume
                  : strings.today.preparing}
              </button>
            </span>
          </div>
        </div>
      ) : (
        <Note>{strings.today.resumeEmpty}</Note>
      )}
    </div>
  );
}
