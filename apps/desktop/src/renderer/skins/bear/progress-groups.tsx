/**
 * Bear 总进度 grouped by subject (design `?d=progress`): the cycle line, then
 * 主项 / 辅助 / 路线外 / 已学专题. Course rows are drawn by the caller
 * (`renderCourse`), so the existing row with its actions is reused.
 */

import { Fragment, useState, type ReactNode } from "react";
import type { SubjectMaterial } from "@shared/data-protocol.js";
import type { GroupedCourse, ProgressGroups, SubjectGroup } from "../../core/board/progress-groups.js";
import type { AuxRow } from "../../core/board/plan-view.js";
import { strings } from "../../core/strings.js";

/** The state marks every Bear status line uses. */
export const MARKS: Record<SubjectMaterial["mark"], string> = { now: "●", warn: "!", done: "✓", plan: "○", none: "◌" };

export function Section({
  title,
  meta,
  warn,
  defaultOpen,
  children,
}: {
  title: string;
  meta: string;
  warn?: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bear-pg-section">
      <button
        type="button"
        className="bear-pg-section-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        {warn && <span className="bear-pg-warn">! {warn}</span>}
        <span className="bear-pg-meta">
          {meta} {open ? "▾" : "▸"}
        </span>
      </button>
      {open && children}
    </section>
  );
}

export function Materials({ group, onPlan }: { group: SubjectGroup; onPlan?: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  if (group.materials.length === 0) return null;
  const types = [...new Set(group.materials.map((item) => item.type))];
  return (
    <div className="bear-pg-mats">
      <button
        type="button"
        className="bear-pg-mats-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "▾" : "▸"} {strings.progress.materials(group.materials.length, group.unplanned)}
      </button>
      {open &&
        types.map((type) => (
          <div key={type} className="bear-pg-mats-group">
            <div className="bear-pg-mats-type">{type}</div>
            <ul className="bear-pg-list">
              {group.materials
                .filter((item) => item.type === type)
                .map((item) => (
                  <li key={item.title} className={`is-${item.mark}`}>
                    <span className="bear-pg-mark">{MARKS[item.mark]}</span>
                    <span className="bear-pg-title">{item.title}</span>
                    <span className="bear-pg-meta">{strings.progress.materialNote(item.role, item.status)}</span>
                    {onPlan && item.mark === "none" && (
                      <button type="button" className="bear-link bear-link-accent" onClick={() => onPlan(item.title)}>
                        {strings.plan.planMaterial}
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

function Subject({
  group,
  renderCourse,
  hideName,
  onPlan,
}: {
  group: SubjectGroup;
  renderCourse(item: GroupedCourse): ReactNode;
  hideName?: boolean;
  onPlan?: (title: string) => void;
}) {
  return (
    <div className="bear-pg-subject">
      {!hideName && <div className="bear-pg-subject-name">{group.title}</div>}
      {group.courses.map((item) => (
        <Fragment key={item.course.slug}>{renderCourse(item)}</Fragment>
      ))}
      <Materials group={group} onPlan={onPlan} />
    </div>
  );
}

export function GroupedProgress({
  groups,
  renderCourse,
  compact = false,
  auxPlanned = null,
  aux = [],
  onPlanMaterial,
}: {
  groups: ProgressGroups;
  renderCourse(item: GroupedCourse): ReactNode;
  /** The route / cycle cards are shown above: drop the cycle line and the 主项 / 辅助 headings. */
  compact?: boolean;
  /** 「原定 …」 for the empty auxiliary slots, from the route page. */
  auxPlanned?: string | null;
  /** The cycle's auxiliary subjects (compact mode): shown as their own block instead of the 辅助位空着 line. */
  aux?: AuxRow[];
  /** Open the new-course form for an unplanned material (compact mode only). */
  onPlanMaterial?: (title: string) => void;
}) {
  const cycle = groups.cycle;
  const auxSlugs = new Set(aux.map((row) => row.subject));
  const other = compact ? groups.other.filter((group) => !auxSlugs.has(group.slug)) : groups.other;
  const otherCount = other.reduce((sum, group) => sum + group.courses.length, 0);
  const otherWarn = other.reduce((sum, group) => sum + group.courses.filter((item) => item.mark === "warn").length, 0);
  return (
    <>
      {cycle && !compact && (
        <div className="bear-pg-cycle">
          <span>{strings.progress.cycleTop(cycle.cycle, cycle.week, cycle.weeks)}</span>
          <span className="bear-pg-weeks" aria-hidden="true">
            {Array.from({ length: cycle.weeks }, (_, index) => (
              <i key={index} className={index < cycle.week ? "is-on" : ""} />
            ))}
          </span>
        </div>
      )}
      {compact ? (
        <>
          {groups.main.map((group) => (
            <Subject key={group.slug} group={group} renderCourse={renderCourse} onPlan={onPlanMaterial} />
          ))}
          {aux.length > 0 ? (
            <div className="bear-plan-auxsec">
              <div className="bear-plan-auxhead">
                <span>{strings.plan.auxTitle}</span>
                <span className="bear-pg-meta">{strings.plan.auxNote}</span>
              </div>
              {aux.map((row) => (
                <div key={row.subject} className="bear-plan-auxrow">
                  <span className={row.course ? "bear-pg-mark is-now" : "bear-pg-mark"}>
                    {row.course ? MARKS.now : MARKS.none}
                  </span>
                  <span className="bear-pg-title">
                    {row.subjectName}
                    {row.course && (
                      <>
                        {" · "}
                        <b>{row.course.name}</b>
                      </>
                    )}
                  </span>
                  {row.course ? (
                    <span className="bear-pg-meta">{strings.plan.auxProgress(row.course.done, row.course.total)}</span>
                  ) : (
                    onPlanMaterial && (
                      <button type="button" className="bear-link bear-link-accent" onClick={() => onPlanMaterial(row.subjectName)}>
                        {strings.plan.planMaterial}
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          ) : (
            cycle && (
              <p className="bear-plan-aux">
                <span className="bear-pg-mark">{groups.auxEmpty ? MARKS.none : MARKS.plan}</span>
                <span>{groups.auxEmpty ? strings.plan.auxEmpty : groups.aux}</span>
                {groups.auxEmpty && auxPlanned && <span className="bear-pg-meta">{auxPlanned}</span>}
              </p>
            )
          )}
        </>
      ) : (
        <>
          {groups.main.length > 0 && (
            <Section title={strings.progress.sectionMain} meta={strings.progress.countCourses(groups.main.length)} defaultOpen>
              {groups.main.map((group) => (
                <Subject key={group.slug} group={group} renderCourse={renderCourse} />
              ))}
            </Section>
          )}
          {cycle && (
            <Section title={strings.progress.sectionAux} meta={groups.auxEmpty ? strings.progress.auxEmpty : ""} defaultOpen>
              {groups.aux && <p className="bear-muted bear-pg-aux">{groups.aux}</p>}
            </Section>
          )}
        </>
      )}
      {other.length > 0 && (
        <Section
          title={strings.progress.sectionOther}
          meta={strings.progress.countCourses(otherCount)}
          warn={compact && otherWarn > 0 ? strings.plan.otherWarn(otherWarn) : undefined}
          defaultOpen={false}
        >
          {other.map((group) => (
            <Subject key={group.slug || group.title} group={group} renderCourse={renderCourse} />
          ))}
        </Section>
      )}
      {groups.learned.length > 0 && (
        <Section
          title={strings.progress.sectionLearned}
          meta={strings.progress.countSubjects(groups.learned.length)}
          defaultOpen={false}
        >
          <ul className="bear-pg-list">
            {groups.learned.map((item) => (
              <li key={item.slug} className="is-done">
                <span className="bear-pg-mark">{MARKS.done}</span>
                <span className="bear-pg-title">{item.title}</span>
                <span className="bear-pg-meta">{strings.progress.learnedNote(item.done)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <p className="bear-pg-legend">{strings.progress.legend}</p>
    </>
  );
}
