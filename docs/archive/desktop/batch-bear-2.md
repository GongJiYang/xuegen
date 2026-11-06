# 批次 BE-2：Bear 抽屉提速 +「今天」「总进度」两个面板（逐步执行清单）

## 规则（上下文被压缩后先重读本文件）
- **只照下面的步骤做，逐字使用给出的代码。** 不要自己设计、不要改写成「更好」的版本、不要补充步骤里没有的功能或样式。
- 只改这些文件：`apps/desktop/src/renderer/skins/bear/shell.tsx`、`skin.css`、`today-panel.tsx`、`progress-panel.tsx`、`shell.test.tsx`，新建 `rich.tsx`、`today-panel.test.tsx`、`progress-panel.test.tsx`。其他文件一律不动。
- 不 commit、不启动 Electron、不读写 `~/.xuegen`、不加依赖、不加 `eslint-disable` / `@ts-ignore`。
- 某一步做不下去（例如找不到要替换的原文、类型报错），**停下并在报告里写清是哪一步、原文是什么、报错是什么**，不要自行换做法。唯一允许的自行修改：TypeScript 类型标注层面的小修（不改行为），每处都要在报告里列出。

工作目录：`/Users/gjy/pi-learning/xuegen`。下文路径都相对 `apps/desktop/src/renderer/skins/bear/`。

---

## 第 1 步：`shell.tsx` 换掉对话框和标签的 import

找到这段原文：

```tsx
import {
  Root as Dialog,
  Content as DialogContent,
  Overlay as DialogOverlay,
  Portal as DialogPortal,
  Title as DialogTitle,
} from "@animate-ui/react/primitives/radix-ui/dialog";
```

整段替换为：

```tsx
import { Dialog as RadixDialog, Tabs as RadixTabs } from "radix-ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
```

再找到这段原文：

```tsx
import {
  Root as Tabs,
  Content as TabsContent,
  List as TabsList,
  Trigger as TabsTrigger,
} from "@animate-ui/react/primitives/radix-ui/tabs";
```

整段删除。

## 第 2 步：`shell.tsx` 加一个常量和一个 hook

在文件里 `const TODAY_TAB` 那一行的**下一行**插入：

```tsx
/** The drawer slides in from the right: one short tween, no flip, no spring. */
const DRAWER_SLIDE = { type: "tween", duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
```

（如果文件里没有 `const TODAY_TAB`，停下报告。）

找到这一行：

```tsx
  const [lastTool, setLastTool] = useState<ToolId>(tools[0]?.id ?? "progress");
```

在它的**下一行**插入：

```tsx
  const reduceMotion = useReducedMotion();
```

## 第 3 步：`shell.tsx` 替换抽屉的 JSX

找到从 `<Dialog open={open} onOpenChange={onDrawerOpenChange} modal={false}>` 开始、到与之配对的 `</Dialog>` 结束的整段（含这两行），整段替换为：

```tsx
      <RadixDialog.Root open={open} onOpenChange={onDrawerOpenChange} modal={false}>
        <AnimatePresence>
          {open && (
            <RadixDialog.Portal forceMount>
              <RadixDialog.Content forceMount asChild aria-describedby={undefined}>
                <motion.div
                  className="bear-drawer"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={reduceMotion ? { duration: 0 } : DRAWER_SLIDE}
                >
                  <RadixDialog.Title className="bear-vh">{strings.tools.dockLabel}</RadixDialog.Title>
                  <RadixTabs.Root value={tab} onValueChange={onTab}>
                    <div className="bear-drawer-top">
                      <RadixTabs.List className="bear-tabs">
                        <RadixTabs.Trigger className="bear-tab" value={TODAY_TAB}>
                          {strings.today.title}
                        </RadixTabs.Trigger>
                        {tools.map((tool) => (
                          <RadixTabs.Trigger key={tool.id} className="bear-tab" value={tool.id}>
                            {tool.name}
                          </RadixTabs.Trigger>
                        ))}
                      </RadixTabs.List>
                      <RadixDialog.Close className="bear-drawer-close">{strings.chat.dismiss}</RadixDialog.Close>
                    </div>
                    <div className="bear-tabpanels">
                      <RadixTabs.Content value={TODAY_TAB}>
                        <TodayPanel {...panels.today} />
                      </RadixTabs.Content>
                      {tools.map((tool) => (
                        <RadixTabs.Content key={tool.id} value={tool.id}>
                          <ToolPanel tool={tool.id} panels={panels} />
                        </RadixTabs.Content>
                      ))}
                    </div>
                  </RadixTabs.Root>
                </motion.div>
              </RadixDialog.Content>
            </RadixDialog.Portal>
          )}
        </AnimatePresence>
      </RadixDialog.Root>
```

同一文件顶部注释里如果有「Animate UI dialog sliding from the right」字样，改成「a Radix dialog that slides in from the right (180ms tween)」。其余注释不动。

## 第 4 步：新建 `rich.tsx`

```tsx
/**
 * Inline `code` in plan and course text.
 *
 * Course files write identifiers in backticks (`@deco`); the panels show those
 * as <code> instead of raw backticks. Everything else stays plain text.
 */

import { Fragment } from "react";

export function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/);
  return (
    <>
      {parts.map((part, index) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={index}>{part.slice(1, -1)}</code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
```

## 第 5 步：`today-panel.tsx` 整个文件替换为

```tsx
/**
 * Bear 今天 panel.
 *
 * 接着上次 first (the one thing to act on), then today's and tomorrow's plan
 * rows as two quiet lists, then the reading and card counts as sliding numbers.
 * Read-only except the resume button.
 */

import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import type { TodayPlanItem } from "../../core/today.js";
import type { TodayPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
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
}: TodayPanelProps) {
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
```

## 第 6 步：`progress-panel.tsx` 整个文件替换为

```tsx
/**
 * Bear 总进度 panel.
 *
 * One collapsible row per course (the first starts open): title, percent as a
 * sliding number, a 2px bar; inside, the week, read-only task boxes (勾选 is
 * written by 学根 at 收课), the next session, the per-course style, and two text
 * actions (改计划 / 开始学习). 「＋ 新课程」 opens the form above the list.
 * Expanding uses a short tween, not a spring.
 */

import { useState } from "react";
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
  REST_DAYS,
  defaultEndDate,
  type NewCourseRequest,
  type RestDays,
} from "../../core/board/course-prompts.js";
import type { ProgressPanelProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { Rich } from "./rich.js";

const MINUTES_PER_DAY = [30, 45, 60, 90] as const;
type MinutesPerDay = (typeof MINUTES_PER_DAY)[number];

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
  const [endInput, setEndInput] = useState<string | null>(null);
  const endDate = endInput ?? defaultEndDate(startDate);
  const [rest, setRest] = useState<RestDays>("sun");
  const [style, setStyle] = useState<TeachingStyle>("plain");

  function submit(): void {
    const name = title.trim();
    if (!name) return;
    onSubmit({ title: name, material: material.trim(), minutesPerDay: minutes, startDate, endDate, rest, style });
  }

  return (
    <div className="bear-newcourse">
      <h3 className="bear-section">
        <span>{strings.progress.newCourse}</span>
      </h3>
      <p className="bear-muted">{strings.progress.newCourseHint}</p>
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
      <Segmented
        label={strings.progress.minutesPerDay}
        value={String(minutes)}
        options={MINUTES_PER_DAY.map((entry) => ({ id: String(entry), label: strings.progress.minutesOption(entry) }))}
        onChange={(next) => setMinutes(Number(next) as MinutesPerDay)}
      />
      <TextField type="date" label={strings.progress.startDate} value={startDate} onChange={setStartDate} />
      <TextField type="date" label={strings.progress.endDate} value={endDate} onChange={setEndInput} />
      <Segmented
        label={strings.progress.restDays}
        value={rest}
        options={REST_DAYS.map((id) => ({ id, label: strings.progress.restOptions[id] ?? id }))}
        onChange={setRest}
      />
      <Segmented
        label={strings.progress.style}
        value={style}
        options={TEACHING_STYLE_LABELS.map((entry) => ({ id: entry.id, label: entry.label }))}
        onChange={setStyle}
      />
      <div className="bear-actions">
        <button type="button" className="bear-link" onClick={onCancel}>
          {strings.progress.cancel}
        </button>
        <button type="button" className="bear-link bear-link-accent" disabled={!title.trim()} onClick={submit}>
          {strings.progress.create}
        </button>
      </div>
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
  const percent = course.overall.total > 0 ? Math.round((course.overall.done / course.overall.total) * 100) : 0;

  function submitChange(): void {
    if (change === null || !change.trim()) return;
    onEditPlan(change.trim());
    setChange(null);
  }

  return (
    <AccordionItem value={course.slug} className="bear-course">
      <AccordionHeader className="bear-course-head">
        <AccordionTrigger className="bear-course-trigger">
          <span className="bear-course-title">{course.title}</span>
          <span className="bear-course-pct">
            <SlidingNumber number={percent} initiallyStable />%
          </span>
        </AccordionTrigger>
      </AccordionHeader>
      <div className="bear-bar" aria-hidden="true">
        <div className="bear-bar-fill" style={{ width: `${percent}%` }} />
      </div>
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
          <p className="bear-course-next">
            {strings.progress.nextSession}
            <Rich text={course.nextSession ?? strings.progress.nextSessionUnset} />
          </p>
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
}: ProgressPanelProps) {
  const [creating, setCreating] = useState(false);
  if (courses.status === "loading") return <p className="bear-muted">{strings.today.loading}</p>;
  if (courses.status === "error") return <p role="alert">{courses.message}</p>;
  return (
    <section className="bear-progress" aria-label={strings.tools.progress}>
      <div className="bear-progress-head">
        <p className="bear-muted">{strings.progress.caption}</p>
        <button
          type="button"
          className="bear-link"
          aria-expanded={creating}
          onClick={() => setCreating((value) => !value)}
        >
          {strings.progress.newCourse}
        </button>
      </div>
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
        <p className="bear-muted">{strings.progress.empty}</p>
      ) : (
        <Accordion type="single" collapsible defaultValue={courses.value[0]?.slug} className="bear-courses">
          {courses.value.map((course) => (
            <CourseRow
              key={course.slug}
              course={course}
              style={courseStyles[course.slug] ?? "plain"}
              started={startedToday[course.slug] === true}
              onCourseStyle={(next) => onCourseStyle(course.slug, next)}
              onStudy={() => onStudy(course)}
              onEditPlan={(next) => onEditPlan(course, next)}
            />
          ))}
        </Accordion>
      )}
    </section>
  );
}
```

## 第 7 步：`skin.css` 改标签与抽屉的三处

7a. 找到：

```css
[data-skin="bear"] .bear-tab {
  color: var(--soft);
  padding: 0.3em 0;
}
[data-skin="bear"] .bear-tab[data-state="active"],
[data-skin="bear"] .bear-tab[aria-selected="true"] {
  color: var(--ink);
  border-bottom: 1px solid var(--ink);
}
```

整段替换为：

```css
[data-skin="bear"] .bear-tab {
  color: var(--soft);
  padding: 0.3em 0;
  box-shadow: inset 0 -1px 0 transparent;
  transition: color 120ms ease-out, box-shadow 120ms ease-out;
}
[data-skin="bear"] .bear-tab:hover {
  color: var(--ink);
}
[data-skin="bear"] .bear-tab[data-state="active"] {
  color: var(--ink);
  box-shadow: inset 0 -1px 0 var(--ink);
}
```

7b. 找到以 `[data-skin="bear"] .bear-drawer-overlay {` 开头的整条规则（到它的 `}`），删除。

7c. 在 `[data-skin="bear"] .bear-tabs {` 那条规则的**上方**插入：

```css
[data-skin="bear"] .bear-drawer-top {
  flex: none;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-right: 1.2em;
}
[data-skin="bear"] .bear-drawer-close {
  font-size: 13px;
  color: var(--soft);
  padding: 0.3em 0;
}
[data-skin="bear"] .bear-drawer-close:hover {
  color: var(--ink);
}
```

## 第 8 步：`skin.css` 末尾追加（原样粘贴）

```css
/* ── 今天 / 总进度 (BE-2) ───────────────────────────────────────────────── */

[data-skin="bear"] .bear-tabpanels .bear-section {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 1.4em 0 0.4em;
  font-size: 13px;
  font-weight: 500;
  color: var(--soft);
}
[data-skin="bear"] .bear-section-count {
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-tabpanels .bear-plan li {
  display: flex;
  flex-direction: column;
  gap: 0.1em;
  padding: 0.45em 0;
}
[data-skin="bear"] .bear-plan-course {
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-plan-detail {
  color: var(--ink);
}
[data-skin="bear"] .bear-counts {
  margin: 1.4em 0 0;
  padding-top: 0.8em;
  border-top: 1px solid #eceef0;
  display: grid;
  gap: 0.4em;
}
[data-skin="bear"] .bear-count {
  display: flex;
  justify-content: space-between;
  color: var(--soft);
}
[data-skin="bear"] .bear-count dd {
  margin: 0;
  display: inline-flex;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-resume {
  padding: 0.1em 0 0.1em 0.9em;
  border-left: 2px solid var(--accent);
}
[data-skin="bear"] .bear-resume-head {
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-resume-title {
  margin: 0.15em 0;
  font-weight: 650;
  color: var(--ink);
}

[data-skin="bear"] .bear-tabpanels .bear-link {
  color: var(--soft);
  padding: 0.2em 0;
  white-space: nowrap;
}
[data-skin="bear"] .bear-tabpanels .bear-link:hover {
  color: var(--ink);
}
[data-skin="bear"] .bear-tabpanels .bear-link-accent,
[data-skin="bear"] .bear-tabpanels .bear-link-accent:hover {
  color: var(--accent);
}
[data-skin="bear"] .bear-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1.2em;
  margin-top: 0.7em;
}

[data-skin="bear"] .bear-progress-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1em;
}
[data-skin="bear"] .bear-tabpanels .bear-progress-head .bear-muted {
  margin: 0;
  font-size: 12px;
}
[data-skin="bear"] .bear-courses {
  margin-top: 0.6em;
}
[data-skin="bear"] .bear-course {
  padding: 0.7em 0;
  border-bottom: 1px solid #eceef0;
}
[data-skin="bear"] .bear-tabpanels .bear-course-head {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}
[data-skin="bear"] .bear-tabpanels .bear-course-trigger {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1em;
  text-align: left;
  color: var(--ink);
}
[data-skin="bear"] .bear-course-title {
  min-width: 0;
  font-weight: 650;
}
[data-skin="bear"] .bear-course-pct {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  font-size: 13px;
  color: var(--soft);
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-bar {
  height: 2px;
  margin-top: 0.5em;
  overflow: hidden;
  background: #eceef0;
}
[data-skin="bear"] .bear-bar-fill {
  height: 100%;
  background: var(--ink);
  transition: width 240ms ease-out;
}
[data-skin="bear"] .bear-course-body {
  overflow: hidden;
}
[data-skin="bear"] .bear-course-inner {
  padding-top: 0.6em;
}
[data-skin="bear"] .bear-tabpanels .bear-course-inner .bear-muted {
  margin: 0.2em 0;
  font-size: 12px;
}
[data-skin="bear"] .bear-tabpanels .bear-tasks li {
  display: flex;
  align-items: flex-start;
  gap: 0.6em;
  padding: 0.3em 0;
  border-bottom: none;
}
[data-skin="bear"] .bear-box {
  flex: none;
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  margin-top: 0.25em;
  border: 1px solid #c4c8cc;
  border-radius: 3px;
  background: #fff;
  color: var(--accent);
}
[data-skin="bear"] .bear-task.is-done {
  color: var(--soft);
}
[data-skin="bear"] .bear-tabpanels .bear-course-next {
  margin: 0.6em 0;
  font-size: 13px;
  color: var(--ink);
}

[data-skin="bear"] .bear-tabpanels .bear-field {
  display: flex;
  align-items: baseline;
  gap: 0.8em;
  margin: 0.55em 0;
}
[data-skin="bear"] .bear-field-label {
  flex: none;
  width: 5.5em;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-tabpanels .bear-input {
  flex: 1;
  min-width: 0;
}
[data-skin="bear"] .bear-seg {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9em;
}
[data-skin="bear"] .bear-tabpanels .bear-seg-item {
  padding: 0.1em 0;
  color: var(--soft);
  box-shadow: inset 0 -1px 0 transparent;
  transition: color 120ms ease-out, box-shadow 120ms ease-out;
}
[data-skin="bear"] .bear-tabpanels .bear-seg-item[data-state="checked"] {
  color: var(--ink);
  box-shadow: inset 0 -1px 0 var(--ink);
}
[data-skin="bear"] .bear-newcourse {
  margin: 0.8em 0 1.2em;
  padding: 0 0 0.6em 0.9em;
  border-left: 2px solid var(--rule);
}
[data-skin="bear"] .bear-inline-form {
  display: flex;
  align-items: baseline;
  gap: 0.8em;
  margin-top: 0.6em;
}
```

## 第 9 步：新建 `today-panel.test.tsx`

参照同目录 `composer.test.tsx` 的 import 方式（vitest、@testing-library/react、userEvent）。用 `gallery/panel-samples.ts` 的 `SAMPLE_PANELS.today` 作为基础 props。写这 4 个用例，名称照抄：

1. `"lists today's and tomorrow's plan rows"`：渲染后，`SAMPLE_PANELS.today.todayPlan` 和 `tomorrowPlan` 里每一项的 `label` 都能用 `getAllByText` 找到。
2. `"shows the empty lines when a day has nothing"`：`todayPlan: []`、`tomorrowPlan: []` 时，能找到 `strings.today.todayPlanEmpty` 和 `strings.today.tomorrowPlanEmpty`。
3. `"renders backticks in a plan detail as code"`：`todayPlan: [{ kind: "plan", label: "课", detail: "`@deco` 是缩写" }]` 时，`container.querySelector("code")?.textContent` 等于 `"@deco"`。
4. `"labels the resume button 回到这门课 when the course was opened today"`：给一个 `resume`（用 `SAMPLE_PANELS.progress.courses` 里第一门课构造：`{ course, nextSession: course.nextSession }`），`startedToday: { [course.slug]: true }`、`agentReady: true`，能找到名为 `strings.today.backToCourse` 的按钮；点它调用 `onResume` 一次。

（如果 `SAMPLE_PANELS.progress.courses` 不是 `status: "ready"`，在测试里自己构造一个最小 `CourseSummary`，字段照 `@shared/data-protocol.js` 的类型填，并在报告里说明。）

## 第 10 步：新建 `progress-panel.test.tsx`

同样用 `SAMPLE_PANELS.progress` 作基础 props（`tool="progress"`）。用例名称照抄：

1. `"opens the first course and keeps the others closed"`：第一门课的 `nextSession` 文本可见；如果有第二门课，它的 `nextSession` 文本不在文档里。
2. `"submits a plan change with Enter"`：点第一门课里名为 `strings.progress.editPlan` 的按钮，在出现的输入框（`getByLabelText(strings.progress.editPlan)`）里输入 `"周日休息"` 再按 Enter，`onEditPlan` 收到 `(第一门课, "周日休息")`。
3. `"changes a course's style"`：在第一门课里点名为 `"细讲"` 的 radio（`getAllByRole("radio", { name: "细讲" })[0]`），`onCourseStyle` 收到 `(第一门课.slug, "detailed")`。
4. `"keeps 建课 disabled until a title is typed"`：点 `strings.progress.newCourse` 按钮，名为 `strings.progress.create` 的按钮是 disabled；在 `getByLabelText(strings.progress.courseTitle)` 输入 `"新课"` 后变为可用；点它，`onNewCourse` 被调用一次且 `title` 为 `"新课"`。

## 第 11 步：只在必要时改 `shell.test.tsx`

先跑 `npx vitest run src/renderer/skins/bear`。如果 `shell.test.tsx` 里有用例**只因为抽屉关闭有 180ms 退场动画、元素还没移除**而失败，把那条断言改成 `await waitFor(() => expect(...).toBeNull())`（从 `@testing-library/react` import `waitFor`）。不允许做其他修改；其他失败照实报告。

## 第 12 步：验收（必须自己跑，贴最后几行）

`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。

## 结束报告
逐步写：第 1–11 步各自是否照做；任何偏离（包括类型小修）列出原文与改后；所有命令的结果。

## 执行记录（2026-11-05）
Devin 照逐步清单执行，仅有允许范围内的类型小修（两处 `onChange` 包箭头函数、测试里的类型收窄与 `Element.prototype.animate` stub）。真实 Electron 实测：抽屉 203ms 到位（原来 >700ms 且残留 3D 变形），切标签 58ms 显示（原来 900ms 后仍模糊）。Claude 修了本清单自身的两处错误：Tabs 根节点不是 flex 列导致面板区只有 51px 高（加 `bear-drawer-body`）；进度条类名 `bear-bar` 与标题栏同名（改为 `bear-meter`）。
