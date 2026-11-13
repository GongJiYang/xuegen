/**
 * Bare skin 总进度 window: the course list, the 「＋ 新课程」 form, and the
 * per-course 改计划 line — plain semantic HTML, no styles.
 *
 * The reference skin's progress panel lives here rather than in `panels.tsx` to
 * keep that file to the dock, 今天, and reading panels.
 */

import { useState } from "react";
import type { CourseSummary } from "@shared/data-protocol.js";
import { TEACHING_STYLE_LABELS, type TeachingStyle } from "@shared/protocol.js";
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
import { todayKey } from "../../core/today.js";
import { strings } from "../../core/strings.js";

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
  const [startDate, setStartDate] = useState(todayKey);
  const [endInput, setEndInput] = useState<string | null>(null);
  const endDate = endInput ?? defaultEndDate(startDate);
  const [rest, setRest] = useState<RestDays>("sun");
  const [style, setStyle] = useState<TeachingStyle>("default");

  function submit(): void {
    const name = title.trim();
    if (!name) return;
    onSubmit({ title: name, material: material.trim(), startDate, endDate, rest, reading, style });
  }

  return (
    <div data-slot="new-course">
      <h3>{strings.progress.newCourse}</h3>
      <p>{strings.progress.newCourseHint}</p>
      <label>
        {strings.progress.courseTitle}
        <input
          aria-label={strings.progress.courseTitle}
          placeholder={strings.progress.courseTitlePlaceholder}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        {strings.progress.material}
        <input
          aria-label={strings.progress.material}
          placeholder={strings.progress.materialPlaceholder}
          value={material}
          list="new-course-sources"
          onChange={(event) => setMaterial(event.target.value)}
        />
      </label>
      <datalist id="new-course-sources">
        {sources.status === "ready" &&
          sources.value.map((source) => <option key={source.path} value={source.path} />)}
      </datalist>
      <label>
        {strings.progress.startDate}
        <input
          type="date"
          aria-label={strings.progress.startDate}
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
      </label>
      <label>
        {strings.progress.endDate}
        <input
          type="date"
          aria-label={strings.progress.endDate}
          value={endDate}
          onChange={(event) => setEndInput(event.target.value)}
        />
      </label>
      <fieldset>
        <legend>{strings.progress.restDays}</legend>
        {REST_DAYS.map((id) => (
          <label key={id}>
            <input type="radio" name="new-course-rest" checked={rest === id} onChange={() => setRest(id)} />
            {strings.progress.restOptions[id] ?? id}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{strings.progress.reading}</legend>
        {READING_MODES.map((id) => (
          <label key={id}>
            <input type="radio" name="new-course-reading" checked={reading === id} onChange={() => setReading(id)} />
            {strings.progress.readingOptions[id] ?? id}
          </label>
        ))}
        <p>{strings.progress.readingHints[reading]}</p>
      </fieldset>
      <fieldset>
        <legend>{strings.progress.style}</legend>
        {TEACHING_STYLE_LABELS.map((entry) => (
          <label key={entry.id}>
            <input
              type="radio"
              name="new-course-style"
              checked={style === entry.id}
              onChange={() => setStyle(entry.id)}
            />
            {entry.label}
          </label>
        ))}
      </fieldset>
      <button type="button" disabled={!title.trim()} onClick={submit}>
        {strings.progress.create}
      </button>
      <button type="button" onClick={onCancel}>
        {strings.progress.cancel}
      </button>
    </div>
  );
}

function CourseRow({
  course,
  style,
  started,
  onCourseStyle,
  onStudy,
  onEditPlan,
}: {
  course: CourseSummary;
  style: TeachingStyle;
  started: boolean;
  onCourseStyle(style: TeachingStyle): void;
  onStudy(): void;
  onEditPlan(change: string): void;
}) {
  const [change, setChange] = useState<string | null>(null);
  return (
    <li data-tool-course={course.slug}>
      <h3>{course.title}</h3>
      <p>
        {strings.progress.weekProgress} {course.week.done}/{course.week.total} ·{" "}
        {course.overall.done}/{course.overall.total}
      </p>
      <p>
        {strings.progress.nextSession}
        {course.nextSession ?? strings.progress.nextSessionUnset}
      </p>
      <fieldset>
        <legend>{strings.progress.style}</legend>
        {TEACHING_STYLE_LABELS.map((entry) => (
          <label key={entry.id}>
            <input
              type="radio"
              name={`style-${course.slug}`}
              checked={style === entry.id}
              onChange={() => onCourseStyle(entry.id)}
            />
            {entry.label}
          </label>
        ))}
      </fieldset>
      <button type="button" onClick={onStudy}>
        {started ? strings.progress.backToCourse : strings.progress.study}
      </button>
      <button type="button" onClick={() => setChange(change === null ? "" : null)}>
        {strings.progress.editPlan}
      </button>
      {change !== null && (
        <div data-slot="edit-plan">
          <input
            aria-label={strings.progress.editPlan}
            placeholder={strings.progress.editPlanPlaceholder}
            value={change}
            onChange={(event) => setChange(event.target.value)}
          />
          <button
            type="button"
            disabled={!change.trim()}
            onClick={() => {
              onEditPlan(change.trim());
              setChange(null);
            }}
          >
            {strings.progress.submit}
          </button>
          <button type="button" onClick={() => setChange(null)}>
            {strings.progress.cancel}
          </button>
        </div>
      )}
    </li>
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
  if (courses.status === "loading") return <p>{strings.today.loading}</p>;
  if (courses.status === "error") return <p role="alert">{courses.message}</p>;
  return (
    <section data-slot="progress" aria-label={strings.tools.progress}>
      {overview.status === "ready" && overview.value.route && (
        <p data-slot="progress-route">
          {strings.plan.routeEndLabel} {routeView(overview.value, overview.value.date)?.end}
        </p>
      )}
      <p>{strings.progress.caption}</p>
      {groups?.cycle && (
        <p data-slot="progress-cycle">
          {strings.progress.cycleTop(groups.cycle.cycle, groups.cycle.week, groups.cycle.weeks)}
        </p>
      )}
      <button type="button" aria-expanded={creating} onClick={() => setCreating((value) => !value)}>
        {strings.progress.newCourse}
      </button>
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
      {courses.value.length === 0 ? (
        <p>{strings.progress.empty}</p>
      ) : (
        <ul>
          {courses.value.map((course) => (
            <CourseRow
              key={course.slug}
              course={course}
              style={courseStyles[course.slug] ?? "default"}
              started={startedToday[course.slug] === true}
              onCourseStyle={(style) => onCourseStyle(course.slug, style)}
              onStudy={() => onStudy(course)}
              onEditPlan={(change) => onEditPlan(course, change)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
