/**
 * Bear 总进度 during a study cycle (design `?d=progress4`): the expected end
 * and the 12×7 week grid, the cycle line, one block per main subject — its
 * cycle courses as cards; materials and finished courses folded at the
 * bottom — the auxiliary subjects, then 路线外 / 已学专题 folded. Finished
 * courses never show as course rows here.
 */

import { useState, type ReactNode } from "react";
import { RadioGroup } from "radix-ui";
import { Root as Accordion } from "@animate-ui/react/primitives/radix-ui/accordion";
import type { CourseSummary, CycleOverview } from "@shared/data-protocol.js";
import { TEACHING_STYLE_LABELS, type TeachingStyle } from "@shared/protocol.js";
import type { CyclePlacement } from "../../core/board/course-prompts.js";
import type { AuxRow, CourseCard, CycleView, RouteView } from "../../core/board/plan-view.js";
import { cyclePlacement, subjectDaysLine } from "../../core/board/plan-view.js";
import type { GroupedCourse, ProgressGroups, SubjectGroup } from "../../core/board/progress-groups.js";
import { strings } from "../../core/strings.js";
import { CycleLine, RouteCard } from "./plan-top.js";
import { MARKS, Materials, Section } from "./progress-groups.js";
import { Rich } from "./rich.js";

function StylePills({ value, onChange }: { value: TeachingStyle; onChange(style: TeachingStyle): void }) {
  return (
    <RadioGroup.Root
      className="bear-p4-pills"
      value={value}
      orientation="horizontal"
      aria-label={strings.progress.style}
      onValueChange={(next) => onChange(next as TeachingStyle)}
    >
      {TEACHING_STYLE_LABELS.map((entry) => (
        <RadioGroup.Item key={entry.id} value={entry.id} className="bear-p4-pill">
          {entry.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

interface CardProps {
  card: CourseCard;
  course: CourseSummary | null;
  style: TeachingStyle;
  started: boolean;
  defaultOpen: boolean;
  onStyle(style: TeachingStyle): void;
  onStudy(course: CourseSummary): void;
  onEditPlan(course: CourseSummary, change: string): void;
}

function Card({ card, course, style, started, defaultOpen, onStyle, onStudy, onEditPlan }: CardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [all, setAll] = useState(false);
  const [change, setChange] = useState<string | null>(null);
  const shown = all ? card.lessons : card.lessons.filter((lesson) => !lesson.done).slice(0, 3);
  const submit = (): void => {
    if (!course || change === null || !change.trim()) return;
    onEditPlan(course, change.trim());
    setChange(null);
  };
  return (
    <div className={open ? "bear-p4-card is-open" : "bear-p4-card"}>
      <button type="button" className="bear-p4-top" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className={`bear-p4-dot is-${card.mark}`} aria-hidden="true" />
        <span className="bear-p4-name">{card.name}</span>
        <span className="bear-p4-count">
          {card.done}
          <small>/{card.total}</small>
        </span>
      </button>
      <div className="bear-p4-bar" aria-hidden="true">
        <i style={{ width: `${card.percent}%` }} />
      </div>
      {card.next && (
        <div className={card.mark === "warn" ? "bear-p4-next is-warn" : "bear-p4-next"}>
          <span className="bear-p4-when">{card.next.when}</span>
          <span className="bear-p4-ntext">
            <Rich text={card.next.text} />
          </span>
          {card.end && <span className="bear-p4-end">{card.end}</span>}
        </div>
      )}
      {open && (
        <div className="bear-p4-body">
          <ol className="bear-p4-lessons">
            {shown.map((lesson) => (
              <li key={lesson.id} className={lesson.done ? "is-done" : ""}>
                <span className="bear-p4-lid">{lesson.id}</span>
                <span className="bear-p4-ltext">
                  <Rich text={lesson.content} />
                </span>
                <span className="bear-p4-ldate">{lesson.date}</span>
              </li>
            ))}
          </ol>
          {card.lessons.length > 3 && (
            <button type="button" className="bear-p4-more" onClick={() => setAll((value) => !value)}>
              {all ? strings.plan.fewerLessons : strings.plan.allLessons(card.total)}
            </button>
          )}
          {change !== null && (
            <div className="bear-inline-form">
              <input
                className="bear-input"
                aria-label={strings.progress.editPlan}
                placeholder={strings.progress.editPlanPlaceholder}
                value={change}
                onChange={(event) => setChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
              />
              <button type="button" className="bear-link bear-link-accent" disabled={!change.trim()} onClick={submit}>
                {strings.progress.submit}
              </button>
            </div>
          )}
          <div className="bear-p4-actions">
            <StylePills value={style} onChange={onStyle} />
            <button type="button" className="bear-link" onClick={() => setChange(change === null ? "" : null)}>
              {change === null ? strings.progress.editPlan : strings.progress.cancel}
            </button>
            {course && (
              <button type="button" className="bear-link bear-link-accent" onClick={() => onStudy(course)}>
                {started ? strings.progress.backToCourse : strings.cycle.start}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Finished({ items }: { items: GroupedCourse[] }) {
  return (
    <ul className="bear-p4-done">
      {items.map((item) => (
        <li key={item.course.slug}>
          <span className="bear-p4-check">{MARKS.done}</span>
          <span className="bear-p4-dname">{item.course.title}</span>
          <span className="bear-p4-dmeta">{strings.plan.finishedNote(item.course.overall.total)}</span>
        </li>
      ))}
    </ul>
  );
}

export interface PlanProgressProps {
  overview: CycleOverview;
  route: RouteView | null;
  cycle: CycleView;
  cards: CourseCard[];
  aux: AuxRow[];
  groups: ProgressGroups | null;
  courses: CourseSummary[];
  courseStyles: Record<string, TeachingStyle>;
  startedToday: Record<string, boolean>;
  onCourseStyle(slug: string, style: TeachingStyle): void;
  onStudy(course: CourseSummary): void;
  onEditPlan(course: CourseSummary, change: string): void;
  onPlanMaterial(title: string, placement: CyclePlacement | null): void;
  /** Draws a non-cycle course row (路线外), inside an accordion. */
  renderCourse(item: GroupedCourse): ReactNode;
  /** 「＋ 新课程」 and its form. */
  footer: ReactNode;
}

export function PlanProgress(props: PlanProgressProps) {
  const { overview, route, cycle, cards, aux, groups, courses } = props;
  const [doneOpen, setDoneOpen] = useState<Record<string, boolean>>({});
  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  const cardSlugs = new Set(cards.map((card) => card.slug));
  const renderCard = (card: CourseCard, index: number): ReactNode => (
    <Card
      key={card.slug}
      card={card}
      course={bySlug.get(card.slug) ?? null}
      style={props.courseStyles[card.slug] ?? "default"}
      started={props.startedToday[card.slug] === true}
      defaultOpen={index === 0}
      onStyle={(style) => props.onCourseStyle(card.slug, style)}
      onStudy={props.onStudy}
      onEditPlan={props.onEditPlan}
    />
  );
  const subjectBlock = (group: SubjectGroup, first: boolean): ReactNode => {
    const own = cards.filter((card) => card.role === "main" && card.subject === group.slug);
    const finished = group.courses.filter((item) => item.mark === "done" && !cardSlugs.has(item.course.slug));
    const open = doneOpen[group.slug] === true;
    return (
      <section key={group.slug} className="bear-p4-subject">
        <header className="bear-p4-shead">
          <span className="bear-p4-sname">{group.title}</span>
          <span className="bear-p4-sdays">{subjectDaysLine(overview, group.slug)}</span>
        </header>
        {own.map((card, index) => renderCard(card, first ? index : 1))}
        <div className="bear-p4-foot">
          <Materials
            group={group}
            onPlan={(title) => props.onPlanMaterial(title, cyclePlacement(overview, group.slug, group.title, "main"))}
          />
          {finished.length > 0 && (
            <button
              type="button"
              className="bear-p4-link"
              aria-expanded={open}
              onClick={() => setDoneOpen((value) => ({ ...value, [group.slug]: !open }))}
            >
              {strings.plan.finished(finished.length)} {open ? "▾" : "▸"}
            </button>
          )}
        </div>
        {open && <Finished items={finished} />}
      </section>
    );
  };
  const auxSlugs = new Set(aux.map((row) => row.subject));
  const other = (groups?.other ?? []).filter((group) => !auxSlugs.has(group.slug));
  const otherCount = other.reduce((sum, group) => sum + group.courses.length, 0);
  const otherWarn = other.reduce((sum, group) => sum + group.courses.filter((item) => item.mark === "warn").length, 0);
  return (
    <>
      {route && <RouteCard view={route} />}
      <CycleLine view={cycle} />
      {groups && groups.main.length > 0
        ? groups.main.map((group, index) => subjectBlock(group, index === 0))
        : cards.filter((card) => card.role === "main").map(renderCard)}
      {aux.length > 0 && (
        <section className="bear-p4-aux">
          <header className="bear-p4-shead">
            <span className="bear-p4-sname is-soft">{strings.plan.auxTitle}</span>
            <span className="bear-p4-sdays">{strings.plan.auxNote}</span>
          </header>
          {aux.map((row) => (
            <div key={row.subject} className="bear-p4-auxrow">
              <span className={row.course ? "bear-p4-dot is-now" : "bear-p4-ring"} aria-hidden="true" />
              <span className="bear-p4-aname">
                {row.subjectName}
                {row.course && (
                  <>
                    {" · "}
                    <b>{row.course.name}</b>
                  </>
                )}
              </span>
              <span className="bear-p4-sdays">
                {row.course ? strings.plan.auxProgress(row.course.done, row.course.total) : subjectDaysLine(overview, row.subject)}
              </span>
              {!row.course && (
                <button
                  type="button"
                  className="bear-link bear-link-accent"
                  onClick={() => props.onPlanMaterial("", cyclePlacement(overview, row.subject, row.subjectName, "aux"))}
                >
                  {strings.plan.planMaterial}
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="bear-p4-rest">
        {other.length > 0 && (
          <Section
            title={strings.progress.sectionOther}
            meta={otherWarn > 0 ? "" : strings.progress.countCourses(otherCount)}
            warn={otherWarn > 0 ? strings.plan.otherWarn(otherWarn) : undefined}
            defaultOpen={false}
          >
            <Accordion type="single" collapsible className="bear-courses">
              {other.flatMap((group) => group.courses.map((item) => props.renderCourse(item)))}
            </Accordion>
          </Section>
        )}
        {groups && groups.learned.length > 0 && (
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
      </div>
      <div className="bear-plan-foot">{props.footer}</div>
    </>
  );
}
