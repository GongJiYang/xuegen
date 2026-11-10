/**
 * Bear 总进度 panel.
 *
 * One collapsible row per course (the first starts open): title, percent as a
 * sliding number, a 2px bar; inside, the week, read-only task boxes (勾选 is
 * written by 学根 at 收课), the next session, the per-course style, and two text
 * actions (改计划 / 开始学习). 「＋ 新课程」 opens the form above the list.
 * Expanding uses a short tween, not a spring. With a subject skeleton (groups)
 * the rows are grouped by subject instead (progress-groups.tsx).
 * With the cycle overview, the route and cycle cards (plan-top.tsx) sit on top
 * and the cycle's courses become cards with lesson counts, end date and next
 * lesson (design `?d=plan`).
 */

import { useState, type ReactNode } from "react";
import type { Transition } from "motion/react";
import { RadioGroup } from "radix-ui";
import {
  Root as Accordion,
  Content as AccordionContent,
  Header as AccordionHeader,
  Item as AccordionItem,
  Trigger as AccordionTrigger,
} from "@animate-ui/react/primitives/radix-ui/accordion";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import type { CourseSummary } from "@shared/data-protocol.js";
import { TEACHING_STYLE_LABELS, type TeachingStyle } from "@shared/protocol.js";
import {
  READING_MODES,
  REST_DAYS,
  defaultEndDate,
  type CyclePlacement,
  type NewCourseRequest,
  type ReadingMode,
  type RestDays,
} from "../../core/board/course-prompts.js";
import type { ProgressPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { Rich } from "./rich.js";
import type { CourseMark } from "../../core/board/progress-groups.js";
import { GroupedProgress, MARKS } from "./progress-groups.js";
import { auxRows, courseCards, cycleView, routeView, type CourseCard } from "../../core/board/plan-view.js";
import { CycleCard, RouteCard } from "./plan-top.js";
import { PlanProgress } from "./plan-progress.js";

/** Course rows open and close with one short tween. */
const EXPAND: Transition = { type: "tween", duration: 0.18, ease: [0.22, 1, 0.36, 1] };

/** Today as `YYYY-MM-DD` in the local timezone. */
function todayIso(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
      <path
        d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A labelled one-of-n choice drawn as quiet text options with an underline. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange(value: T): void;
}) {
  return (
    <div className="bear-field">
      <span className="bear-field-label">{label}</span>
      <RadioGroup.Root
        className="bear-seg"
        value={value}
        orientation="horizontal"
        aria-label={label}
        onValueChange={(next) => onChange(next as T)}
      >
        {options.map((option) => (
          <RadioGroup.Item key={option.id} value={option.id} className="bear-seg-item">
            {option.label}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  list,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  type?: "text" | "date";
  list?: string;
}) {
  return (
    <label className="bear-field">
      <span className="bear-field-label">{label}</span>
      <input
        className="bear-input"
        type={type}
        value={value}
        placeholder={placeholder}
        list={list}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NewCourseForm({
  initialTitle,
  placement = null,
  sources,
  onSubmit,
  onCancel,
}: {
  initialTitle?: string | undefined;
  placement?: CyclePlacement | null;
  sources: ProgressPanelProps["sources"];
  onSubmit(request: NewCourseRequest): void;
  onCancel(): void;
}) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [material, setMaterial] = useState(initialTitle ?? "");
  const [reading, setReading] = useState<ReadingMode>("guided");
  const [startDate, setStartDate] = useState(todayIso);
  const [endInput, setEndInput] = useState<string | null>(null);
  const endDate = endInput ?? defaultEndDate(startDate);
  const [rest, setRest] = useState<RestDays>("sun");
  const [style, setStyle] = useState<TeachingStyle>("default");

  function submit(): void {
    const name = title.trim();
    if (!name) return;
    onSubmit(
      placement
        ? { title: name, material: material.trim(), startDate: todayIso(), endDate: placement.end, rest: "none", reading, style, cycle: placement }
        : { title: name, material: material.trim(), startDate, endDate, rest, reading, style },
    );
  }

  return (
    <div className="bear-newcourse">
      <h3 className="bear-section">
        <span>{placement ? strings.progress.placementTitle(placement.subjectName) : strings.progress.newCourse}</span>
      </h3>
      {placement ? (
        <>
          <div className="bear-nc-cycle">
            <span className="bear-nc-tag">{strings.progress.placementTag(placement.cycle, placement.role)}</span>
            <span>{strings.progress.placementLine(placement.days, placement.role, placement.end, placement.cycle)}</span>
          </div>
          <p className="bear-muted">{strings.progress.placementHint(placement.role)}</p>
        </>
      ) : (
        <p className="bear-muted">{strings.progress.newCourseHint}</p>
      )}
      <TextField
        label={strings.progress.courseTitle}
        value={title}
        onChange={setTitle}
        placeholder={strings.progress.courseTitlePlaceholder}
      />
      <TextField
        label={strings.progress.material}
        value={material}
        onChange={setMaterial}
        placeholder={strings.progress.materialPlaceholder}
        list="bear-new-course-sources"
      />
      <datalist id="bear-new-course-sources">
        {sources.status === "ready" &&
          sources.value.map((source) => <option key={source.path} value={source.path} />)}
      </datalist>
      {!placement && (
        <>
          <TextField type="date" label={strings.progress.startDate} value={startDate} onChange={setStartDate} />
          <TextField type="date" label={strings.progress.endDate} value={endDate} onChange={setEndInput} />
          <Segmented
            label={strings.progress.restDays}
            value={rest}
            options={REST_DAYS.map((id) => ({ id, label: strings.progress.restOptions[id] ?? id }))}
            onChange={(next) => setRest(next)}
          />
        </>
      )}
      <Segmented
        label={strings.progress.reading}
        value={reading}
        options={READING_MODES.map((id) => ({ id, label: strings.progress.readingOptions[id] ?? id }))}
        onChange={(next) => setReading(next)}
      />
      <p className="bear-muted bear-reading-hint">{strings.progress.readingHints[reading]}</p>
      <Segmented
        label={strings.progress.style}
        value={style}
        options={TEACHING_STYLE_LABELS.map((entry) => ({ id: entry.id, label: entry.label }))}
        onChange={(next) => setStyle(next)}
      />
      <div className="bear-actions">
        <button type="button" className="bear-link" onClick={onCancel}>
          {strings.progress.cancel}
        </button>
        <button type="button" className="bear-link bear-link-accent" disabled={!title.trim()} onClick={submit}>
          {placement ? strings.progress.placementSubmit : strings.progress.create}
        </button>
      </div>
    </div>
  );
}

function CourseRow({
  course,
  mark,
  meta,
  card,
  style,
  started,
  onCourseStyle,
  onStudy,
  onEditPlan,
}: {
  course: CourseSummary;
  mark: CourseMark | null;
  meta: string | null;
  card: CourseCard | null;
  style: TeachingStyle;
  started: boolean;
  onCourseStyle(style: TeachingStyle): void;
  onStudy(): void;
  onEditPlan(change: string): void;
}) {
  const [change, setChange] = useState<string | null>(null);
  const percent = course.overall.total > 0 ? Math.round((course.overall.done / course.overall.total) * 100) : 0;

  function submitChange(): void {
    if (change === null || !change.trim()) return;
    onEditPlan(change.trim());
    setChange(null);
  }

  return (
    <AccordionItem value={course.slug} className={card ? "bear-course is-card" : "bear-course"}>
      <AccordionHeader className="bear-course-head">
        <AccordionTrigger className="bear-course-trigger">
          {card ? (
            <>
              <span className={`bear-pg-mark is-${card.mark}`}>{MARKS[card.mark]}</span>
              <span className="bear-course-title">{card.name}</span>
              <span className="bear-plan-count">
                {card.done}
                <small>{strings.plan.lessonTotal(card.total)}</small>
              </span>
            </>
          ) : (
            <>
              {mark && <span className={`bear-pg-mark is-${mark}`}>{MARKS[mark]}</span>}
              <span className="bear-course-title">{course.title}</span>
              {meta !== null ? (
                <span className="bear-pg-meta">{meta}</span>
              ) : (
                <span className="bear-course-pct">
                  <SlidingNumber number={percent} initiallyStable />%
                </span>
              )}
            </>
          )}
        </AccordionTrigger>
      </AccordionHeader>
      {card ? (
        <>
          <div className="bear-plan-line">
            <div className="bear-meter" aria-hidden="true">
              <div className="bear-meter-fill" style={{ width: `${card.percent}%` }} />
            </div>
            {card.end && <span className="bear-pg-meta">{card.end}</span>}
          </div>
          {card.next && (
            <p className={card.mark === "warn" ? "bear-plan-next is-warn" : "bear-plan-next"}>
              {strings.plan.nextLabel} <b>{card.next.when}</b> · <Rich text={card.next.text} />
            </p>
          )}
        </>
      ) : (
        <div className="bear-meter" aria-hidden="true">
          <div className="bear-meter-fill" style={{ width: `${percent}%` }} />
        </div>
      )}
      <AccordionContent className="bear-course-body" transition={EXPAND} exitTransition={EXPAND}>
        <div className="bear-course-inner">
          {course.weekLabel && <p className="bear-muted">{course.weekLabel}</p>}
          <p className="bear-muted">
            {strings.progress.weekProgress} {course.week.done}/{course.week.total} · {strings.progress.lastRecord}{" "}
            {course.lastRecord?.date ?? strings.progress.lastRecordNone}
          </p>
          {course.week.tasks.length > 0 && (
            <ul className="bear-tasks">
              {course.week.tasks.map((task, index) => (
                <li key={index} className={task.done ? "bear-task is-done" : "bear-task"}>
                  <span className="bear-box" data-checked={task.done ? "" : undefined} aria-hidden="true">
                    {task.done && <CheckGlyph />}
                  </span>
                  <span>
                    <Rich text={task.label} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!card && (
            <p className="bear-course-next">
              {strings.progress.nextSession}
              <Rich text={course.nextSession ?? strings.progress.nextSessionUnset} />
            </p>
          )}
          <Segmented
            label={strings.progress.style}
            value={style}
            options={TEACHING_STYLE_LABELS.map((entry) => ({ id: entry.id, label: entry.label }))}
            onChange={onCourseStyle}
          />
          {change !== null && (
            <div className="bear-inline-form">
              <input
                className="bear-input"
                aria-label={strings.progress.editPlan}
                placeholder={strings.progress.editPlanPlaceholder}
                value={change}
                onChange={(event) => setChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitChange();
                }}
              />
              <button
                type="button"
                className="bear-link bear-link-accent"
                disabled={!change.trim()}
                onClick={submitChange}
              >
                {strings.progress.submit}
              </button>
            </div>
          )}
          <div className="bear-actions">
            <button
              type="button"
              className="bear-link"
              aria-expanded={change !== null}
              onClick={() => setChange(change === null ? "" : null)}
            >
              {change === null ? strings.progress.editPlan : strings.progress.cancel}
            </button>
            <button type="button" className="bear-link bear-link-accent" onClick={onStudy}>
              {started ? strings.progress.backToCourse : strings.progress.study}
            </button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function ProgressPanel({
  courses,
  courseStyles,
  startedToday,
  onCourseStyle,
  onStudy,
  onNewCourse,
  onEditPlan,
  sources,
  groups,
  overview,
}: ProgressPanelProps) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ title: string; placement: CyclePlacement | null } | null>(null);
  if (courses.status === "loading") return <p className="bear-muted">{strings.today.loading}</p>;
  if (courses.status === "error") return <p role="alert">{courses.message}</p>;
  const today = todayIso();
  const ready = overview.status === "ready" ? overview.value : null;
  const route = ready ? routeView(ready, today) : null;
  const cycleTop = ready ? cycleView(ready, today) : null;
  const cardList = ready ? courseCards(ready, today) : [];
  const cards = new Map(cardList.map((card) => [card.slug, card]));
  const aux = ready ? auxRows(ready) : [];
  const mainSlugs = new Set(groups?.main.flatMap((group) => group.courses.map((item) => item.course.slug)) ?? []);
  const renderRow = (course: CourseSummary, mark: CourseMark | null, meta: string | null): ReactNode => (
    <CourseRow
      key={course.slug}
      course={course}
      mark={mark}
      meta={meta}
      card={cards.get(course.slug) ?? null}
      style={courseStyles[course.slug] ?? "default"}
      started={startedToday[course.slug] === true}
      onCourseStyle={(next) => onCourseStyle(course.slug, next)}
      onStudy={() => onStudy(course)}
      onEditPlan={(next) => onEditPlan(course, next)}
    />
  );
  const newCourseButton = (
    <button
      type="button"
      className="bear-link"
      aria-expanded={creating}
      onClick={() => {
        setDraft(null);
        setCreating((value) => !value);
      }}
    >
      {strings.progress.newCourse}
    </button>
  );
  const form = creating && (
    <NewCourseForm
      key={draft ? `${draft.title}|${draft.placement?.subject ?? ""}` : ""}
      initialTitle={draft?.title || undefined}
      placement={draft?.placement ?? null}
      sources={sources}
      onSubmit={(request) => {
        onNewCourse(request);
        setCreating(false);
        setDraft(null);
      }}
      onCancel={() => {
        setCreating(false);
        setDraft(null);
      }}
    />
  );
  if (ready && cycleTop) {
    return (
      <section className="bear-progress is-plan is-p4" aria-label={strings.tools.progress}>
        <PlanProgress
          overview={ready}
          route={route}
          cycle={cycleTop}
          cards={cardList}
          aux={aux}
          groups={groups}
          courses={courses.value}
          courseStyles={courseStyles}
          startedToday={startedToday}
          onCourseStyle={onCourseStyle}
          onStudy={onStudy}
          onEditPlan={onEditPlan}
          onPlanMaterial={(title, placement) => {
            setDraft({ title, placement });
            setCreating(true);
          }}
          renderCourse={(item) => renderRow(item.course, item.mark, strings.progress.lastSeen(item.course.lastRecord?.date ?? null))}
          footer={
            <>
              {form}
              {newCourseButton}
            </>
          }
        />
      </section>
    );
  }
  return (
    <section className={cycleTop ? "bear-progress is-plan" : "bear-progress"} aria-label={strings.tools.progress}>
      {cycleTop ? (
        <>
          {route && <RouteCard view={route} />}
          <CycleCard view={cycleTop} />
        </>
      ) : (
        <>
          <div className="bear-progress-head">
            <p className="bear-muted">{strings.progress.caption}</p>
            {newCourseButton}
          </div>
          {form}
        </>
      )}
      {courses.value.length === 0 ? (
        <p className="bear-muted">{strings.progress.empty}</p>
      ) : (
        <Accordion
          type="single"
          collapsible
          defaultValue={groups?.main[0]?.courses[0]?.course.slug ?? courses.value[0]?.slug}
          className="bear-courses"
        >
          {groups ? (
            <GroupedProgress
              groups={groups}
              compact={cycleTop !== null}
              auxPlanned={cycleTop?.aux ?? null}
              aux={aux}
              onPlanMaterial={(title) => {
                setDraft({ title, placement: null });
                setCreating(true);
              }}
              renderCourse={(item) =>
                renderRow(
                  item.course,
                  item.mark,
                  mainSlugs.has(item.course.slug)
                    ? strings.progress.courseMeta(
                        item.course.week.done,
                        item.course.week.total,
                        item.course.overall.done,
                        item.course.overall.total,
                      )
                    : strings.progress.lastSeen(item.course.lastRecord?.date ?? null),
                )
              }
            />
          ) : (
            courses.value.map((course) => renderRow(course, null, null))
          )}
        </Accordion>
      )}
      {cycleTop && (
        <>
          {form}
          <div className="bear-plan-foot">{newCourseButton}</div>
        </>
      )}
    </section>
  );
}
