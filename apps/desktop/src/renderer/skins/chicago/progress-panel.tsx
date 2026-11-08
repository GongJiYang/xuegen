/**
 * Chicago 总进度 window body.
 *
 * One expandable row per course: name, overall progress bar, and a detail block
 * with the week, the (read-only) task checkboxes, the next session, a per-course
 * style radio, 开始学习, and 改计划. Above the list, 「＋ 新课程」 opens a form
 * that collects everything the `course` skill needs to create a course.
 */

import { useState } from "react";
import { TEACHING_STYLE_LABELS, type TeachingStyle } from "@shared/protocol.js";
import type { CourseSummary } from "@shared/data-protocol.js";
import {
  READING_MODES,
  REST_DAYS,
  defaultEndDate,
  type NewCourseRequest,
  type ReadingMode,
  type RestDays,
} from "../../core/board/course-prompts.js";
import type { ProgressPanelProps } from "../contract.js";
import { routeView } from "../../core/board/plan-view.js";
import { strings } from "../../core/strings.js";
import { Bar, Caption, CheckBox, Field, InRow, RadioGroup } from "./widgets.js";
import { Failed, Loading, Note, todayIso } from "./panel-shared.js";

/** Candidate paths for the material field; a click fills the field. */
function materialCandidates(material: string, sources: ProgressPanelProps["sources"]): string[] {
  if (sources.status !== "ready") return [];
  const value = material.trim();
  if (/^https?:\/\//i.test(value)) return [];
  const paths = sources.value.map((source) => source.path);
  if (!value) return paths.slice(0, 6);
  return paths.filter((path) => path.toLowerCase().includes(value.toLowerCase())).slice(0, 6);
}

function NewCourseForm({
  sources,
  onSubmit,
  onCancel,
}: {
  sources: ProgressPanelProps["sources"];
  onSubmit(request: NewCourseRequest): void;
  onCancel(): void;
}) {
  const [title, setTitle] = useState("");
  const [material, setMaterial] = useState("");
  const [reading, setReading] = useState<ReadingMode>("guided");
  const [startDate, setStartDate] = useState(todayIso);
  // null = follow the start date (+4 weeks) until the user types a deadline.
  const [endInput, setEndInput] = useState<string | null>(null);
  const endDate = endInput ?? defaultEndDate(startDate);
  const [rest, setRest] = useState<RestDays>("sun");
  const [style, setStyle] = useState<TeachingStyle>("default");
  const candidates = materialCandidates(material, sources);

  function submit(): void {
    const name = title.trim();
    if (!name) return;
    onSubmit({ title: name, material: material.trim(), startDate, endDate, rest, reading, style });
  }

  return (
    <div className="chicago-inbox">
      <Caption title={strings.progress.newCourse} hint={strings.progress.newCourseHint} />
      <Field
        block
        value={title}
        onChange={setTitle}
        placeholder={strings.progress.courseTitlePlaceholder}
        ariaLabel={strings.progress.courseTitle}
      />
      <Field
        block
        value={material}
        onChange={setMaterial}
        placeholder={strings.progress.materialPlaceholder}
        ariaLabel={strings.progress.material}
      />
      {candidates.length > 0 && (
        <ul className="chicago-candidates">
          {candidates.map((path) => (
            <li key={path}>
              <button type="button" className="chicago-candidate" onClick={() => setMaterial(path)}>
                {path}
              </button>
            </li>
          ))}
        </ul>
      )}
      <InRow>
        <span>{strings.progress.startDate}：</span>
        <Field
          grow
          value={startDate}
          onChange={setStartDate}
          placeholder={strings.progress.startDatePlaceholder}
          ariaLabel={strings.progress.startDate}
        />
      </InRow>
      <InRow>
        <span>{strings.progress.endDate}：</span>
        <Field
          grow
          value={endDate}
          onChange={setEndInput}
          placeholder={strings.progress.startDatePlaceholder}
          ariaLabel={strings.progress.endDate}
        />
      </InRow>
      <InRow>
        <RadioGroup<RestDays>
          name="new-course-rest"
          value={rest}
          label={`${strings.progress.restDays}：`}
          options={REST_DAYS.map((id) => ({ id, label: strings.progress.restOptions[id] ?? id }))}
          onChange={setRest}
        />
      </InRow>
      <InRow>
        <RadioGroup<ReadingMode>
          name="new-course-reading"
          value={reading}
          label={`${strings.progress.reading}：`}
          options={READING_MODES.map((id) => ({ id, label: strings.progress.readingOptions[id] ?? id }))}
          onChange={setReading}
        />
      </InRow>
      <Note>{strings.progress.readingHints[reading]}</Note>
      <InRow>
        <RadioGroup<TeachingStyle>
          name="new-course-style"
          value={style}
          label={`${strings.progress.style}：`}
          options={TEACHING_STYLE_LABELS.map((entry) => ({ id: entry.id, label: entry.label }))}
          onChange={setStyle}
        />
      </InRow>
      <div className="chicago-row-btns">
        <button type="button" className="chicago-btn" onClick={onCancel}>
          {strings.progress.cancel}
        </button>
        <span className="chicago-def">
          <button type="button" className="chicago-btn" disabled={!title.trim()} onClick={submit}>
            {strings.progress.create}
          </button>
        </span>
      </div>
    </div>
  );
}

function CourseRow({
  course,
  isOpen,
  style,
  started,
  onToggle,
  onCourseStyle,
  onStudy,
  onEditPlan,
}: {
  course: CourseSummary;
  isOpen: boolean;
  style: TeachingStyle;
  started: boolean;
  onToggle(): void;
  onCourseStyle(style: TeachingStyle): void;
  onStudy(): void;
  onEditPlan(change: string): void;
}) {
  const [change, setChange] = useState<string | null>(null);
  const percent = course.overall.total
    ? Math.round((course.overall.done / course.overall.total) * 100)
    : 0;

  return (
    <div className={`chicago-crow${isOpen ? " chicago-open" : ""}`}>
      <button type="button" className="chicago-crow-head" onClick={onToggle} aria-expanded={isOpen}>
        <span className="chicago-crow-title" title={course.title}>
          {course.title}
        </span>
      </button>
      <div className="chicago-crow-progress">
        <Bar percent={percent} />
        <span className="chicago-pct">{percent}%</span>
      </div>
      {isOpen && (
        <div className="chicago-detail chicago-small">
          <div className="chicago-detail-line">
            {course.weekLabel ?? strings.progress.nextSessionUnset}
          </div>
          <div className="chicago-detail-line">
            {strings.progress.weekProgress} {course.week.done}/{course.week.total}
          </div>
          <div className="chicago-detail-line">
            {strings.progress.lastRecord} {course.lastRecord?.date ?? strings.progress.lastRecordNone}
          </div>
          {course.week.tasks.map((task) => (
            <InRow key={task.label}>
              <CheckBox checked={task.done} disabled ariaLabel={task.label} />
              <span className="chicago-task-label">{task.label}</span>
            </InRow>
          ))}
          <div className="chicago-next">
            {strings.progress.nextSession}
            {course.nextSession ?? strings.progress.nextSessionUnset}
          </div>
          <InRow>
            <RadioGroup
              name={`course-style-${course.slug}`}
              value={style}
              options={TEACHING_STYLE_LABELS.map((entry) => ({ id: entry.id, label: entry.label }))}
              onChange={onCourseStyle}
            />
          </InRow>
          <div className="chicago-row-btns">
            <button type="button" className="chicago-btn" onClick={() => setChange(change === null ? "" : null)}>
              {strings.progress.editPlan}
            </button>
            <span className="chicago-def">
              <button type="button" className="chicago-btn" onClick={onStudy}>
                {started ? strings.progress.backToCourse : strings.progress.study}
              </button>
            </span>
          </div>
          {change !== null && (
            <InRow>
              <Field
                grow
                value={change}
                onChange={setChange}
                placeholder={strings.progress.editPlanPlaceholder}
                ariaLabel={strings.progress.editPlan}
              />
              <button
                type="button"
                className="chicago-btn"
                disabled={!change.trim()}
                onClick={() => {
                  onEditPlan(change.trim());
                  setChange(null);
                }}
              >
                {strings.progress.submit}
              </button>
              <button type="button" className="chicago-btn" onClick={() => setChange(null)}>
                {strings.progress.cancel}
              </button>
            </InRow>
          )}
        </div>
      )}
    </div>
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
  // The first course starts expanded, matching the design's initial state.
  const [open, setOpen] = useState(0);
  const [creating, setCreating] = useState(false);

  if (courses.status === "loading") return <Loading />;
  if (courses.status === "error") return <Failed message={courses.message} />;

  return (
    <div className="chicago-pane-inner">
      {overview.status === "ready" && overview.value.route && (
        <Note>
          {strings.plan.routeEndLabel} {routeView(overview.value, overview.value.date)?.end}
        </Note>
      )}
      {groups?.cycle && <Note>{strings.progress.cycleTop(groups.cycle.cycle, groups.cycle.week, groups.cycle.weeks)}</Note>}
      <InRow spread>
        <Note>{strings.progress.caption}</Note>
        <span className="chicago-def">
          <button
            type="button"
            className="chicago-btn"
            aria-expanded={creating}
            onClick={() => setCreating((value) => !value)}
          >
            {strings.progress.newCourse}
          </button>
        </span>
      </InRow>
      {creating && (
        <NewCourseForm
          sources={sources}
          onSubmit={(request) => {
            onNewCourse(request);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      {courses.value.length === 0 && <Note>{strings.progress.empty}</Note>}
      {courses.value.map((course, index) => (
        <CourseRow
          key={course.slug}
          course={course}
          isOpen={open === index}
          style={courseStyles[course.slug] ?? "default"}
          started={startedToday[course.slug] === true}
          onToggle={() => setOpen(open === index ? -1 : index)}
          onCourseStyle={(style) => onCourseStyle(course.slug, style)}
          onStudy={() => onStudy(course)}
          onEditPlan={(change) => onEditPlan(course, change)}
        />
      ))}
    </div>
  );
}
