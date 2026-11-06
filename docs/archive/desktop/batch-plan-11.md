# 批次 PL-11：总进度第四版（周期视图重做成一个独立组件）

设计稿（用户已批准）：`/Users/gjy/pi-learning/design/animate/src/progress4.jsx` + `progress4.css`（`http://localhost:5181/?d=progress4`）。像素以设计稿为准。

要点：
- 顶部：小字「预计结束」，下面大字日期，再下面 12 周期 × 7 周格（已有，样式微调）。
- 本周期一行：黑底小标签「C1」+ 名称 + 右侧「第 1 / 7 周」；下一行「11-06 → 12-24（周四）· 还剩 48 天」。
- 每个主项科目一块：科目名 + 右侧上课日（「周一 · 周三」）；本周期的课是卡片（圆点、课名、`0/15`、细进度条、一行「今天 · D1 …　结课 12-23」单行截断）；卡片展开：接下来 3 节（课次 · 内容 · 日期，单行截断）+「全部 15 节 ›」+ 讲解风格三段小切换 + 改计划 + 开始 →。
- 科目块底部一行：左「资料 4 · 2 未排课」（点开资料清单，未排课的有「排课」），右「已学完 1 ▸」（点开浅灰的 ✓ 行）。**已学完的课不再以课程行出现。**
- 辅助：每科一行（空心圈、科目名、上课日、「排课」，或排了课时显示课名与 `x / y 节`）。
- 路线外、已学专题：各一行，点开（沿用现有折叠内容）。
- 底部「＋ 新课程」。

做法：新建 `skins/bear/plan-progress.tsx`，周期视图整块由它画；`progress-panel.tsx` 在有周期总览时只调用它，否则保持旧布局不变。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**，代码照抄；不要重新设计。做不通时停下报告；测试期望与实际不符时不要改实现去凑。
- 只准改 / 新建：`skills/cycle-plan/cycle.mjs`、`cycle.test.mjs`、`apps/desktop/src/shared/data-protocol.ts`、`renderer/core/strings.ts`、`renderer/core/board/plan-view.ts`、`plan-view.test.ts`、`renderer/skins/bear/plan-progress.tsx`（新）、`renderer/skins/bear/plan-progress.test.tsx`（新）、`renderer/skins/bear/plan-top.tsx`、`renderer/skins/bear/progress-groups.tsx`（只加 `export`）、`renderer/skins/bear/progress-panel.tsx`、`progress-panel.test.tsx`、`renderer/skins/bear/skin.css`、`renderer/gallery/panel-samples.ts`，以及类型报错需要补字段的测试文件。
- 皮肤里不写中文文案。不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。

## 第 1 步：`skills/cycle-plan/cycle.mjs` 的 `planInfo`

1. `cycleInfo` 里 `auxSubjects: cycleAuxSubjects(cycle),` 下面加：

```js
    subjectDays: Object.fromEntries(
      Object.keys(cycle.subjects).map((slug) => [
        slug,
        [1, 2, 3, 4, 5, 6, 0]
          .filter((day) => cycle.template[day].subject === slug || cycle.template[day].aux === slug)
          .map((day) => WEEKDAY_ZH[day]),
      ]),
    ),
```

2. `list` 每项里 `next: …` 后面加：

```js
      lessons: lessons.map((row) => ({ id: row.id, date: row.date, content: row.content, done: info.done.has(row.id) })),
```

3. 注释里 cycle 字段加 `subjectDays`，courses 字段加 `lessons`。

`cycle.test.mjs`：`planInfo gives …` 测试里 `info.cycle` 的期望对象加 `subjectDays: { x: ["周一", "周三"], y: ["周二", "周四"] }`；`info.courses[0]` 的期望对象加 `lessons: aRows.filter((row) => row.kind === "new").map((row) => ({ id: row.id, date: row.date, content: row.content, done: row.id === "D1" }))`。其他用 `deepEqual` 比整个 `cycle` / `courses[n]` 的地方同样补这两个字段（`CYCLE_AUX` 的 `subjectDays` 里 `z` 为 `["周一", "周三"]`）。

## 第 2 步：`apps/desktop/src/shared/data-protocol.ts`

- `CycleCourseProgress` 的 `next` 后面加：

```ts
  /** Every new lesson in schedule order, with whether it is done. */
  lessons: { id: string; date: string; content: string; done: boolean }[];
```

- `CycleOverview.cycle` 的 `auxSubjects` 后面加：

```ts
    /** Subject slug → its days in the template (main or aux column), Monday first: 「周一」… */
    subjectDays: Record<string, string[]>;
```

## 第 3 步：`renderer/core/strings.ts`

`plan: {` 块里 `auxProgress: …` 下面加：

```ts
    cycleRange: (start: string, end: string, weekday: string, daysLeft: number): string =>
      `${start} → ${end}（${weekday}）· 还剩 ${daysLeft} 天`,
    days: (days: string[]): string => days.join(" · "),
    allLessons: (total: number): string => `全部 ${total} 节 ›`,
    fewerLessons: "收起",
    finished: (count: number): string => `已学完 ${count}`,
    finishedNote: (total: number): string => `${total} 节`,
    materialsShort: (count: number, unplanned: number): string =>
      `资料 ${count}${unplanned > 0 ? ` · ${unplanned} 未排课` : ""}`,
```

## 第 4 步：`renderer/core/board/plan-view.ts` 与测试

1. `CycleView` 接口加：

```ts
  /** 「C1」. */
  id: string;
  /** The title without 「C1 · 」, or the id when there is no title. */
  name: string;
  /** 「11-06 → 12-24（周四）· 还剩 48 天」. */
  range: string;
```

   `cycleView` 返回对象里加：

```ts
    id: cycle.cycle,
    name: cycle.title || cycle.cycle,
    range: strings.plan.cycleRange(cycle.start.slice(5), cycle.end.slice(5), shortDay(cycle.end).split(" ")[1] ?? "", cycle.daysLeft),
```

2. `CourseCard` 接口加：

```ts
  subject: string;
  /** Every lesson: id, 「11-06」, content, done. */
  lessons: { id: string; date: string; content: string; done: boolean }[];
```

   `courseCards` 返回对象里加 `subject: course.subject,` 和 `lessons: course.lessons.map((lesson) => ({ ...lesson, date: lesson.date.slice(5) })),`。

3. 文件末尾加：

```ts
/** 「周一 · 周三」 for a subject of the current cycle, or "". */
export function subjectDaysLine(overview: CycleOverview, subject: string): string {
  return strings.plan.days(overview.cycle?.subjectDays[subject] ?? []);
}
```

4. `plan-view.test.ts`：`OVERVIEW.cycle` 加 `subjectDays: { "discrete-math": ["周一", "周三"], "programming-paradigms": ["周二", "周四"] }`；`OVERVIEW.courses` 每项加 `lessons: []`（epp 那项改为 `lessons: [{ id: "D1", date: "2026-11-06", content: "Ch1 全章", done: false }]`）；其他手写的课程对象补 `lessons: []`；`cycleView` 的 `toEqual` 期望加 `id: "C1", name: "离散数学 + 编程语言与编程范式", range: "11-06 → 12-24（周四）· 还剩 48 天"`（无标题那个测试里 `view?.name` 应为 `"C1"`）；`courseCards` 第一个测试的期望加 `subject: "discrete-math", lessons: [{ id: "D1", date: "11-06", content: "Ch1 全章", done: false }]`。追加：

```ts
describe("subjectDaysLine", () => {
  it("joins the subject's days", () => {
    expect(subjectDaysLine(OVERVIEW, "discrete-math")).toBe("周一 · 周三");
    expect(subjectDaysLine(OVERVIEW, "nope")).toBe("");
    expect(subjectDaysLine({ ...OVERVIEW, cycle: null }, "discrete-math")).toBe("");
  });
});
```

## 第 5 步：`renderer/skins/bear/progress-groups.tsx`

只把 `function Section(` 改成 `export function Section(`，`function Materials(` 改成 `export function Materials(`。其他不动。

## 第 6 步：`renderer/skins/bear/plan-top.tsx`

在文件末尾加（`CycleCard` 保留不删）：

```tsx
/** The cycle line of 总进度 v4: 「C1」 badge, name, week; the range and days left under it. */
export function CycleLine({ view }: { view: CycleView }) {
  return (
    <section className="bear-p4-cycle">
      <div className="bear-p4-cycle-row">
        <span className="bear-p4-cid">{view.id}</span>
        <span className="bear-p4-ctitle">{view.name}</span>
        <span className="bear-pg-meta">{view.week}</span>
      </div>
      <div className="bear-p4-cycle-sub">{view.range}</div>
    </section>
  );
}
```

## 第 7 步：新文件 `renderer/skins/bear/plan-progress.tsx`

```tsx
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
import type { AuxRow, CourseCard, CycleView, RouteView } from "../../core/board/plan-view.js";
import { subjectDaysLine } from "../../core/board/plan-view.js";
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
  onPlanMaterial(title: string): void;
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
      style={props.courseStyles[card.slug] ?? "plain"}
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
          <Materials group={group} onPlan={props.onPlanMaterial} />
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
                <button type="button" className="bear-link bear-link-accent" onClick={() => props.onPlanMaterial(row.subjectName)}>
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
```

（`Materials` 的 `onPlan` 参数若是可选，传函数没问题。`MARKS.done` 是 `✓`。若 lint 对 `renderCard` 作为 `map` 回调的参数个数有意见，照 lint 提示写成箭头函数。）

## 第 8 步：`renderer/skins/bear/progress-panel.tsx`

1. import 加 `import { PlanProgress } from "./plan-progress.js";`；`plan-view.js` 的 import 保持（`courseCards`、`cycleView`、`routeView`、`auxRows`）。
2. `const cards = new Map(…)` 那行**上面**加 `const cardList = ready ? courseCards(ready, today) : [];`，并把 `const cards = new Map((ready ? courseCards(ready, today) : []).map(…))` 改为 `const cards = new Map(cardList.map((card) => [card.slug, card]));`。
3. `return (` 之前加：

```tsx
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
          onPlanMaterial={(title) => {
            setDraft(title);
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
```

   原有的 `return ( … )` 保持不变（没有周期总览时仍用旧布局；其中 `cycleTop` 分支此后到不了，但保留，不要删）。

## 第 9 步：`renderer/skins/bear/skin.css` 末尾追加

```css
/* 总进度 v4 (design ?d=progress4). */
[data-skin="bear"] .bear-progress.is-p4 .bear-plan-route {
  padding-bottom: 16px;
  border-bottom: none;
}
[data-skin="bear"] .bear-progress.is-p4 .bear-plan-end {
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  margin: 0 0 12px;
}
[data-skin="bear"] .bear-progress.is-p4 .bear-plan-end span {
  font-size: 12px;
}
[data-skin="bear"] .bear-progress.is-p4 .bear-plan-end strong {
  font-size: 24px;
}
[data-skin="bear"] .bear-p4-cycle {
  padding: 12px 0 4px;
  border-top: 1px solid var(--hairline);
}
[data-skin="bear"] .bear-p4-cycle-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
[data-skin="bear"] .bear-p4-cid {
  padding: 0 5px;
  border-radius: 4px;
  background: var(--ink);
  color: var(--paper);
  font-size: 12px;
  font-weight: 600;
}
[data-skin="bear"] .bear-p4-ctitle {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}
[data-skin="bear"] .bear-p4-cycle-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-p4-subject {
  margin-top: 18px;
}
[data-skin="bear"] .bear-p4-shead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
}
[data-skin="bear"] .bear-p4-sname {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}
[data-skin="bear"] .bear-p4-sname.is-soft {
  font-weight: 500;
  color: var(--soft);
}
[data-skin="bear"] .bear-p4-sdays {
  font-size: 11.5px;
  color: var(--faint);
}
[data-skin="bear"] .bear-p4-card {
  margin-top: 6px;
  padding: 10px 12px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  background: #fff;
}
[data-skin="bear"] .bear-tabpanels .bear-p4-top {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  color: var(--ink);
}
[data-skin="bear"] .bear-p4-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}
[data-skin="bear"] .bear-p4-dot.is-warn {
  background: var(--warn);
}
[data-skin="bear"] .bear-p4-dot.is-done {
  background: var(--done);
}
[data-skin="bear"] .bear-p4-ring {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1.2px solid var(--faint);
}
[data-skin="bear"] .bear-p4-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  text-align: left;
}
[data-skin="bear"] .bear-p4-count {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-p4-count small {
  margin-left: 1px;
  font-size: 12px;
  font-weight: 400;
  color: var(--soft);
}
[data-skin="bear"] .bear-p4-bar {
  height: 3px;
  margin: 8px 0 0 15px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--hairline);
}
[data-skin="bear"] .bear-p4-bar i {
  display: block;
  height: 100%;
  background: var(--accent);
}
[data-skin="bear"] .bear-p4-next {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  margin: 7px 0 0 15px;
  font-size: 12.5px;
}
[data-skin="bear"] .bear-p4-when {
  flex: none;
  font-weight: 600;
  color: var(--accent);
}
[data-skin="bear"] .bear-p4-next.is-warn .bear-p4-when {
  color: var(--warn-text);
}
[data-skin="bear"] .bear-p4-ntext,
[data-skin="bear"] .bear-p4-ltext {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #4a4f55;
}
[data-skin="bear"] .bear-p4-end,
[data-skin="bear"] .bear-p4-ldate {
  flex: none;
  font-size: 11.5px;
  color: var(--faint);
}
[data-skin="bear"] .bear-p4-body {
  margin: 10px 0 0 15px;
  padding-top: 8px;
  border-top: 1px dashed var(--hairline);
}
[data-skin="bear"] .bear-p4-lessons {
  list-style: none;
  margin: 0;
  padding: 0;
}
[data-skin="bear"] .bear-tabpanels .bear-p4-lessons li {
  display: flex;
  gap: 8px;
  padding: 3px 0;
  border-bottom: none;
  font-size: 12.5px;
}
[data-skin="bear"] .bear-p4-lessons li.is-done .bear-p4-ltext {
  color: var(--faint);
  text-decoration: line-through;
}
[data-skin="bear"] .bear-p4-lid {
  flex: none;
  width: 26px;
  color: var(--soft);
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-tabpanels .bear-p4-more,
[data-skin="bear"] .bear-tabpanels .bear-p4-link {
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-p4-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 10px;
  font-size: 12px;
}
[data-skin="bear"] .bear-p4-pills {
  display: flex;
  gap: 2px;
  margin-right: auto;
  padding: 2px;
  border-radius: 6px;
  background: #f4f5f6;
}
[data-skin="bear"] .bear-tabpanels .bear-p4-pill {
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-tabpanels .bear-p4-pill[data-state="checked"] {
  background: #fff;
  color: var(--ink);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}
[data-skin="bear"] .bear-p4-foot {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 2px 0;
}
[data-skin="bear"] .bear-p4-foot .bear-pg-mats {
  flex: 1;
  min-width: 0;
}
[data-skin="bear"] .bear-p4-foot .bear-pg-mats-toggle,
[data-skin="bear"] .bear-p4-foot .bear-pg-mats-group {
  margin-left: 0;
}
[data-skin="bear"] .bear-p4-done {
  list-style: none;
  margin: 4px 0 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: #f4f5f6;
}
[data-skin="bear"] .bear-tabpanels .bear-p4-done li {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 0;
  border-bottom: none;
  font-size: 12.5px;
  color: var(--soft);
}
[data-skin="bear"] .bear-p4-check {
  font-size: 11px;
  color: var(--done);
}
[data-skin="bear"] .bear-p4-dname {
  flex: 1;
  min-width: 0;
}
[data-skin="bear"] .bear-p4-dmeta {
  font-size: 11.5px;
  color: var(--faint);
}
[data-skin="bear"] .bear-p4-aux {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--hairline);
}
[data-skin="bear"] .bear-p4-auxrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px;
  font-size: 13px;
}
[data-skin="bear"] .bear-p4-aname {
  flex: 1;
  min-width: 0;
  color: #4a4f55;
}
[data-skin="bear"] .bear-p4-aname b {
  font-weight: 500;
  color: var(--ink);
}
[data-skin="bear"] .bear-p4-rest {
  margin-top: 14px;
  border-top: 1px solid var(--hairline);
}
[data-skin="bear"] .bear-p4-rest .bear-pg-section {
  margin-top: 0;
}
[data-skin="bear"] .bear-tabpanels .bear-p4-rest .bear-pg-section-head {
  padding: 10px 2px;
  border-bottom: 1px solid var(--hairline);
  font-size: 13px;
  font-weight: 500;
}
```

## 第 10 步：样例与测试

1. `renderer/gallery/panel-samples.ts`：`SAMPLE_OVERVIEW.cycle` 加 `subjectDays: { "discrete-math": ["周一", "周三"], "programming-paradigms": ["周二", "周四"], "c-systems-programming": ["周一", "周三"], "data-structures": ["周二", "周四"] }`；`SAMPLE_OVERVIEW.courses` 每项加 `lessons`：离散那项 `[{ id: "D1", date: "2026-11-06", content: "Ch1 全章", done: false }, { id: "D2", date: "2026-11-09", content: "Ch2 真值表", done: false }, { id: "D3", date: "2026-11-11", content: "Ch2 有效论证", done: false }, { id: "D4", date: "2026-11-16", content: "Ch3 量词", done: false }]`，其余 `[]`。
2. 新建 `renderer/skins/bear/plan-progress.test.tsx`：渲染 `ProgressPanel`（照 `progress-panel.test.tsx` 的 `baseProps` 与 `Element.prototype.animate` 桩写法），`groups: SAMPLE_GROUPS, overview: { status: "ready", value: SAMPLE_OVERVIEW }`，断言：
   - 能看到 `"2028 年 7 月 20 日"`、`"C1"`（`.bear-p4-cid`）、`"11-06 → 12-24（周四）· 还剩 48 天"`、`"周二 · 周四"`；
   - `SAMPLE_GROUPS` 里已完成的课（`programming-paradigms`，若样例里它不是已完成，就把样例里那门课的 `overall` 改成 `{ done: 6, total: 6 }` 并在报告里说明）**不**作为课名直接出现，点 `strings.plan.finished(1)` 开头的按钮后才出现；
   - 第一张卡片展开时能看到 `"D2"` 与 `strings.plan.allLessons(4)`，点它后能看到 `"D4"`；
   - 点「改计划」出现输入框（`getByLabelText(strings.progress.editPlan)`）。
3. `progress-panel.test.tsx` 里 `with the cycle overview …` 测试若因布局改变失败，按新布局改期望（例如 `strings.plan.auxNote` 仍在、`Effective C` 仍在），在报告里逐条列出。

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && git status --short
wc -l apps/desktop/src/renderer/skins/bear/plan-progress.tsx apps/desktop/src/renderer/skins/bear/progress-panel.tsx
```

## 结束报告

改了哪些文件；每一步是否照做；偏离之处与原因；改了哪些测试期望；未完成项。
