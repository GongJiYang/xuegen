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
import type { NewCourseRequest } from "../../core/board/course-prompts.js";
import type { ProgressPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";

const MINUTES_PER_DAY = [30, 45, 60, 90] as const;
type MinutesPerDay = (typeof MINUTES_PER_DAY)[number];

/** Today as `YYYY-MM-DD` in the local timezone. */
function todayIso(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
  const [minutes, setMinutes] = useState<MinutesPerDay>(45);
  const [startDate, setStartDate] = useState(todayIso);
  const [style, setStyle] = useState<TeachingStyle>("plain");

  function submit(): void {
    const name = title.trim();
    if (!name) return;
    onSubmit({ title: name, material: material.trim(), minutesPerDay: minutes, startDate, style });
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
      <fieldset>
        <legend>{strings.progress.minutesPerDay}</legend>
        {MINUTES_PER_DAY.map((entry) => (
          <label key={entry}>
            <input
              type="radio"
              name="new-course-minutes"
              checked={minutes === entry}
              onChange={() => setMinutes(entry)}
            />
            {strings.progress.minutesOption(entry)}
          </label>
        ))}
      </fieldset>
      <label>
        {strings.progress.startDate}
        <input
          type="date"
          aria-label={strings.progress.startDate}
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
      </label>
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
  onCourseStyle,
  onStudy,
  onEditPlan,
}: {
  course: CourseSummary;
  style: TeachingStyle;
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
        {strings.progress.study}
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
  onCourseStyle,
  onStudy,
  onNewCourse,
  onEditPlan,
  sources,
}: ProgressPanelProps) {
  const [creating, setCreating] = useState(false);
  if (courses.status === "loading") return <p>{strings.today.loading}</p>;
  if (courses.status === "error") return <p role="alert">{courses.message}</p>;
  return (
    <section data-slot="progress" aria-label={strings.tools.progress}>
      <p>{strings.progress.caption}</p>
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
              style={courseStyles[course.slug] ?? "plain"}
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
