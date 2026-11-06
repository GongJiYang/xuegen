/**
 * Bear 总进度 top (design `?d=plan`): the expected end date and the 12 cycles
 * as 7 week cells each, then the current cycle's dates and days left. The
 * lines come from `core/board/plan-view.ts`; this file only draws them.
 */

import { useState } from "react";
import type { CycleView, RouteView } from "../../core/board/plan-view.js";
import { strings } from "../../core/strings.js";

export function RouteCard({ view }: { view: RouteView }) {
  const [open, setOpen] = useState(false);
  const toggle = (): void => setOpen((value) => !value);
  return (
    <section className="bear-plan-route">
      <div className="bear-plan-end">
        <span>{strings.plan.routeEndLabel}</span>
        <strong>{view.end}</strong>
      </div>
      <button type="button" className="bear-plan-strip" aria-expanded={open} onClick={toggle}>
        {view.segments.map((segment) => (
          <span
            key={segment.id}
            className={`bear-plan-seg is-${segment.state}${segment.restAfter ? " has-rest" : ""}`}
          >
            <span className="bear-plan-weeks">
              {segment.weeks.map((week, index) => (
                <i key={index} className={`is-${week}`} />
              ))}
            </span>
            <em>{segment.label}</em>
          </span>
        ))}
      </button>
      {open && (
        <ol className="bear-plan-cycles">
          {view.cycles.map((cycle) => (
            <li key={cycle.id} className={cycle.now ? "is-now" : ""}>
              <span className="bear-pg-mark">{cycle.now ? "●" : "○"}</span>
              <span className="bear-plan-cid">{cycle.id}</span>
              <span className="bear-plan-cname">{cycle.subjects}</span>
              <span className="bear-pg-meta">{cycle.range}</span>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="bear-link bear-plan-more" onClick={toggle}>
        {open ? strings.plan.hideCycles(view.cycles.length) : strings.plan.showCycles(view.cycles.length)}
      </button>
    </section>
  );
}

export function CycleCard({ view }: { view: CycleView }) {
  return (
    <section className="bear-plan-cycle">
      <div className="bear-plan-cycle-head">
        <span className="bear-plan-label">{strings.plan.cycleLabel}</span>
        <span className="bear-pg-meta">{view.week}</span>
      </div>
      <div className="bear-plan-title">{view.title}</div>
      <div className="bear-plan-range">
        <span>{view.start}</span>
        <span className="bear-plan-bar" aria-hidden="true">
          <i style={{ width: `${view.percent}%` }} />
        </span>
        <span className="bear-plan-range-end">{view.end}</span>
      </div>
      <p className="bear-plan-sub">{view.sub}</p>
    </section>
  );
}
