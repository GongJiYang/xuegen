/**
 * Chicago 今天 window body.
 *
 * Rolling counts (今天计划 / 到期阅读 / 待同步卡片) plus the 接着上次 card, ported
 * from the design's `#today`. 「今天计划」 replaces the old opaque 课程活动 count: it
 * shows the number of concrete items and, on hover/click, lists them (the day's
 * course records, plan rows, and reading due). The resume card comes from the
 * pure `resumePoint` result; while the agent is starting it is disabled and
 * reads 准备中… instead of dropping the click.
 */

import { useState } from "react";
import type { TodayPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { Count } from "./widgets.js";
import { Note } from "./panel-shared.js";

export function TodayPanel({ todayPlan, readingDue, cards, resume, onResume, agentReady }: TodayPanelProps) {
  const [showPlan, setShowPlan] = useState(false);
  const dueToday = readingDue.status === "ready" ? readingDue.value.dueToday : "—";
  const pending = cards.status === "ready" ? cards.value.unsynced : "—";
  return (
    <div className="chicago-pane-inner">
      <button
        type="button"
        className="chicago-count chicago-count-btn"
        aria-expanded={showPlan}
        onClick={() => setShowPlan((open) => !open)}
        onMouseEnter={() => setShowPlan(true)}
        onMouseLeave={() => setShowPlan(false)}
      >
        <span>{strings.today.todayPlan}</span>
        <b>{todayPlan.length}</b>
      </button>
      {showPlan && (
        <ul className="chicago-plan-list">
          {todayPlan.length === 0 ? (
            <li className="chicago-small">{strings.today.todayPlanEmpty}</li>
          ) : (
            todayPlan.map((item, index) => (
              <li key={index}>
                <span>{item.label}</span>
                <span className="chicago-small">{item.detail}</span>
              </li>
            ))
          )}
        </ul>
      )}
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
                {agentReady ? strings.today.resume : strings.today.preparing}
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
