# 批次 PL-2：Bear「总进度」「日历」按新设计稿改界面

设计稿（用户已批准，像素依据）：`/Users/gjy/pi-learning/design/animate/src/plan.jsx` + `plan.css`（`http://localhost:5181/?d=plan`）。
数据与纯函数已在 PL-1 做好：`core/board/plan-view.ts`（`routeView` `cycleView` `courseCards` `cellTag` `cellFlag` `daySlotLine` `dayLessons` `legendNames`）、`strings.plan`、`ProgressPanelProps.overview`、`CycleMonth.lessons/names/cycles/recovery`。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**，代码照抄；不要重新设计、改名或「顺手优化」。做不通时停下，在报告里写清卡在哪。
- 只准改：`skins/bear/progress-panel.tsx`、`skins/bear/progress-groups.tsx`、`skins/bear/calendar-panel.tsx`、`skins/bear/skin.css`、新建 `skins/bear/plan-top.tsx`、`skins/bear/progress-panel.test.tsx`、`skins/bear/calendar-panel.test.tsx`、`skins/bare/progress-panel.tsx`、`skins/chicago/progress-panel.tsx`。
- 皮肤里不写中文文案，全部用 `strings`（已有的够用；缺的停下报告，不要自己加）。
- 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。

---

## 第 1 步：新文件 `apps/desktop/src/renderer/skins/bear/plan-top.tsx`

```tsx
/**
 * Bear 总进度 top (design `?d=plan`): the two-year route with its end date and
 * one segment per cycle, then the current cycle's dates and days left. The
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
      <div className="bear-plan-label">{strings.plan.routeLabel}</div>
      <div className="bear-plan-end">
        <span>{strings.plan.routeEndLabel}</span>
        <strong>{view.end}</strong>
      </div>
      <p className="bear-plan-sub">{view.sub}</p>
      <button type="button" className="bear-plan-strip" aria-expanded={open} onClick={toggle}>
        {view.segments.map((segment) => (
          <span
            key={segment.id}
            className={`bear-plan-seg is-${segment.state}${segment.restAfter ? " has-rest" : ""}`}
          >
            <i />
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
```

## 第 2 步：`skins/bear/progress-groups.tsx`

1. import 区：`import type { GroupedCourse, ProgressGroups, SubjectGroup } from "../../core/board/progress-groups.js";` 保持不变；不需要新 import。

2. `Section` 组件：参数里加 `warn?: string;`（类型和解构都加），并把按钮内容改成：

```tsx
        <span>{title}</span>
        {warn && <span className="bear-pg-warn">! {warn}</span>}
        <span className="bear-pg-meta">
          {meta} {open ? "▾" : "▸"}
        </span>
```

3. `Subject` 组件：参数加 `hideName?: boolean`，把 `<div className="bear-pg-subject-name">{group.title}</div>` 改成 `{!hideName && <div className="bear-pg-subject-name">{group.title}</div>}`。

4. `GroupedProgress`：参数改为

```tsx
export function GroupedProgress({
  groups,
  renderCourse,
  compact = false,
  auxPlanned = null,
}: {
  groups: ProgressGroups;
  renderCourse(item: GroupedCourse): ReactNode;
  /** The route / cycle cards are shown above: drop the cycle line and the 主项 / 辅助 headings. */
  compact?: boolean;
  /** 「原定 …」 for the empty auxiliary slots, from the route page. */
  auxPlanned?: string | null;
}) {
```

   在 `const otherCount = …` 下面加：

```tsx
  const otherWarn = groups.other.reduce(
    (sum, group) => sum + group.courses.filter((item) => item.mark === "warn").length,
    0,
  );
```

   然后把 `return ( <> … </> );` 里**从 `{cycle && (` 第一段（`bear-pg-cycle`）到辅助那段 `Section` 结束**替换为：

```tsx
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
            <Subject key={group.slug} group={group} renderCourse={renderCourse} hideName />
          ))}
          {cycle && (
            <p className="bear-plan-aux">
              <span className="bear-pg-mark">{groups.auxEmpty ? MARKS.none : MARKS.plan}</span>
              <span>{groups.auxEmpty ? strings.plan.auxEmpty : groups.aux}</span>
              {groups.auxEmpty && auxPlanned && <span className="bear-pg-meta">{auxPlanned}</span>}
            </p>
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
```

   「路线外」那段 `Section` 加一个属性：`warn={compact && otherWarn > 0 ? strings.plan.otherWarn(otherWarn) : undefined}`。其余（已学专题、图例）不变。

## 第 3 步：`skins/bear/progress-panel.tsx`

1. import 区加：

```tsx
import { courseCards, cycleView, routeView, type CourseCard } from "../../core/board/plan-view.js";
import { CycleCard, RouteCard } from "./plan-top.js";
```

2. 文件头注释最后一句后面加一句：`With the cycle overview, the route and cycle cards (plan-top.tsx) sit on top and the cycle's courses become cards with lesson counts, end date and next lesson (design \`?d=plan\`).`

3. `CourseRow`：参数加 `card: CourseCard | null;`（类型和解构都加，放在 `meta` 后面）。然后：

   - `<AccordionItem value={course.slug} className="bear-course">` 改为 `<AccordionItem value={course.slug} className={card ? "bear-course is-card" : "bear-course"}>`。
   - 把 trigger 里的内容（从 `{mark && …}` 到 `meta` 的三元结束）替换为：

```tsx
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
```

   - 把 `<div className="bear-meter" aria-hidden="true">…</div>`（AccordionHeader 后面那个）替换为：

```tsx
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
```

   - 展开内容里 `<p className="bear-course-next">…</p>` 外面包一层条件：`{!card && ( … )}`（有卡片时「下一节」已在上面显示）。

4. `ProgressPanel`：

   - 解构参数加 `overview,`。
   - 在 `const [creating, setCreating] = useState(false);` 下面加：

```tsx
  const today = todayIso();
  const ready = overview.status === "ready" ? overview.value : null;
  const route = ready ? routeView(ready, today) : null;
  const cycleTop = ready ? cycleView(ready, today) : null;
  const cards = new Map((ready ? courseCards(ready, today) : []).map((card) => [card.slug, card]));
```

   - `renderRow` 里 `<CourseRow` 加属性 `card={cards.get(course.slug) ?? null}`。
   - 把整个 `return ( <section className="bear-progress" …> … </section> );` 改为：

```tsx
  const newCourseButton = (
    <button type="button" className="bear-link" aria-expanded={creating} onClick={() => setCreating((value) => !value)}>
      {strings.progress.newCourse}
    </button>
  );
  const form = creating && (
    <NewCourseForm
      sources={sources}
      onSubmit={(request) => {
        onNewCourse(request);
        setCreating(false);
      }}
      onCancel={() => setCreating(false)}
    />
  );
  return (
    <section className="bear-progress" aria-label={strings.tools.progress}>
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
```

注意：`courses.status` 的两个提前 return 在 `useState` 之后、上面新加的 `const today …` 之前或之后都可以，但**不能**把 hook 放到提前 return 之后（`useState` 已经在最前面，保持不动）。

## 第 4 步：`skins/bear/calendar-panel.tsx`

1. import 区加：

```tsx
import type { CycleDayType } from "@shared/data-protocol.js";
import { cellFlag, cellTag, dayLessons, daySlotLine, legendNames } from "../../core/board/plan-view.js";
```

   （`CalendarDay` 的 import 改成 `import type { CalendarDay, CycleDayType } from "@shared/data-protocol.js";`，不要重复 import 同一模块。）

2. 文件头注释改为：

```
 * Bear 日历 panel (design `?d=plan`).
 *
 * A Monday-first month grid in the drawer. Inside a study cycle each cell says
 * what the day is for — the lesson's course short name, 整合, Anki, 恢复, or
 * nothing on a rest day — and a cycle's first / last day carries a 「C1 起 /
 * C1 完」 flag. Today is a filled accent circle; the selected day a white card.
 * Days outside every cycle keep the small dots. Below, the selected day's
 * cycle line, its lessons and fixed items, then notes / records / reading.
 * Double-clicking a day opens the day editor, as in Chicago.
```

3. `DayDetail`：参数加 `lessons: { name: string; id: string; content: string }[];`、`slotType: CycleDayType | null;`、`isToday: boolean;`（类型和解构都加）。在 `{slotLine && …}` 这一行下面插入：

```tsx
      {(lessons.length > 0 || slotType) && (
        <ul className="bear-mcal-items">
          {lessons.map((lesson) => (
            <li key={`${lesson.name}-${lesson.id}`} className={isToday ? "is-now" : ""}>
              <span className="bear-pg-mark">{isToday ? "●" : "○"}</span>
              <span>
                <b>
                  {lesson.name} {lesson.id}
                </b>{" "}
                <Rich text={lesson.content} />
                <small> · {strings.cycle.minutes}</small>
              </span>
            </li>
          ))}
          {slotType === "整合" && (
            <li>
              <span className="bear-pg-mark">○</span>
              <span>{strings.plan.verifyItem}</span>
            </li>
          )}
          {slotType && slotType !== "休息" && (
            <li>
              <span className="bear-pg-mark">○</span>
              <span>{strings.plan.ankiItem}</span>
            </li>
          )}
          {slotType === "休息" && lessons.length === 0 && <li className="is-empty">{strings.plan.restItem}</li>}
        </ul>
      )}
```

   然后把整段 `{!hasContent(day) ? ( <p …dayEmptyHint…/> ) : ( <> … </> )}` 替换为下面的结构（`…原样…` 处保留原来的代码不动）：

```tsx
      {!hasContent(day) ? (
        lessons.length === 0 && !slotType && <p className="bear-muted">{strings.calendar.dayEmptyHint}</p>
      ) : (
        <>
          {day.note && <p className="bear-mcal-note">{day.note}</p>}
          {day.plans.length > 0 && lessons.length === 0 && (
            …原来的「计划」section 原样…
          )}
          …原来的 records / readingDue / log 三个 section 原样…
        </>
      )}
```

   （即：有课次时不再显示重复的「计划」段；其余段落代码不动。）

4. `CalendarPanel`：

   - 把 `const cycleDays = …` 与 `const selectedSlot = …` 两行替换为：

```tsx
  const cycle = cycleMonth.status === "ready" ? cycleMonth.value : null;
  const cycleDays = cycle ? cycle.days : {};
  const selectedType = cycleDays[selected]?.type ?? null;
```

   - 格子循环里：在 `if (slot?.type === "休息") classes.push("is-rest");` 下面加：

```tsx
          const tag = cell.out ? "" : cellTag(cycle, cell.date);
          const flag = cell.out ? null : cellFlag(cycle, cell.date);
          if (!cell.out && (cycle?.lessons[cell.date]?.length || slot?.type === "深度")) classes.push("is-deep");
          if (!cell.out && cycle?.recovery.includes(cell.date)) classes.push("is-recover");
```

   - 按钮内容（`<span className="bear-mcal-num">` 到 `bear-mcal-type` 那行）替换为：

```tsx
              <span className="bear-mcal-num">{cell.day}</span>
              {slot || tag ? <span className="bear-mcal-tag">{tag}</span> : <Dots day={days[cell.date]} />}
              {flag && <span className="bear-mcal-flag">{flag}</span>}
              {(slot || tag) && days[cell.date]?.note && <i className="bear-mcal-notedot" aria-hidden="true" />}
```

   - 图例：把 `<div className="bear-mcal-legend">…</div>` 和下面 `{Object.keys(cycleDays).length > 0 && <p className="bear-mcal-cyclegend">…</p>}` 两段替换为：

```tsx
      {Object.keys(cycleDays).length > 0 ? (
        <p className="bear-mcal-cyclegend">{strings.plan.legend(legendNames(cycle))}</p>
      ) : (
        <div className="bear-mcal-legend">
          …原来 bear-mcal-legend 里的四个 span 原样…
        </div>
      )}
```

   - `<DayDetail …>` 的属性：`slotLine={…}` 改为 `slotLine={daySlotLine(cycle, selected)}`，并加 `lessons={dayLessons(cycle, selected)}`、`slotType={selectedType}`、`isToday={selected === today}`。

## 第 5 步：`skins/bear/skin.css`

1. 把 `.bear-mcal-day.is-today .bear-mcal-num`、`.bear-mcal-day.is-sel .bear-mcal-num`、`.bear-mcal-day.is-sel.is-today .bear-mcal-num` 三条规则替换为：

```css
[data-skin="bear"] .bear-mcal-day.is-today .bear-mcal-num {
  background: var(--accent);
  color: #fff;
  font-weight: 650;
}
[data-skin="bear"] .bear-tabpanels .bear-mcal-day.is-sel {
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--rule);
}
```

2. `.bear-tabpanels .bear-mcal-day` 规则里：`height: 44px;` 改为 `height: 52px;`，`gap: 3px;` 改为 `gap: 1px;`，`padding: 6px 0 0;` 改为 `padding: 5px 0 0;`，`border-radius: 4px;` 改为 `border-radius: 7px;`，并加一行 `position: relative;`。`.bear-mcal-num` 里 `width: 24px; height: 24px;` 改为 `22px`。

3. 在文件**末尾**追加：

```css
/* 总进度 / 日历 redesign (design ?d=plan). */
[data-skin="bear"] .bear-plan-label {
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--soft);
}
[data-skin="bear"] .bear-tabpanels .bear-plan-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-plan-route {
  padding-bottom: 18px;
  border-bottom: 1px solid var(--hairline);
}
[data-skin="bear"] .bear-plan-end {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 4px;
}
[data-skin="bear"] .bear-plan-end span {
  font-size: 13px;
  color: var(--soft);
}
[data-skin="bear"] .bear-plan-end strong {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
}
[data-skin="bear"] .bear-tabpanels .bear-plan-strip {
  display: flex;
  gap: 3px;
  width: 100%;
  margin-top: 12px;
  padding: 0;
}
[data-skin="bear"] .bear-plan-seg {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
[data-skin="bear"] .bear-plan-seg.has-rest {
  margin-right: 4px;
}
[data-skin="bear"] .bear-plan-seg i {
  width: 100%;
  height: 6px;
  border-radius: 2px;
  background: var(--hairline);
}
[data-skin="bear"] .bear-plan-seg.is-now i {
  background: var(--accent);
}
[data-skin="bear"] .bear-plan-seg.is-done i {
  background: var(--done);
}
[data-skin="bear"] .bear-plan-seg em {
  font-style: normal;
  font-size: 10px;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-plan-seg.is-now em {
  color: var(--accent);
  font-weight: 600;
}
[data-skin="bear"] .bear-tabpanels .bear-plan-more {
  margin-top: 6px;
  font-size: 12px;
}
[data-skin="bear"] .bear-plan-cycles {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
}
[data-skin="bear"] .bear-tabpanels .bear-plan-cycles li {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 0;
  border-bottom: none;
  font-size: 12.5px;
}
[data-skin="bear"] .bear-plan-cid {
  width: 26px;
  color: var(--soft);
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-plan-cycles li.is-now .bear-plan-cid {
  color: var(--accent);
  font-weight: 600;
}
[data-skin="bear"] .bear-plan-cname {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-skin="bear"] .bear-plan-cycle {
  padding: 18px 0 4px;
}
[data-skin="bear"] .bear-plan-cycle-head {
  display: flex;
  justify-content: space-between;
}
[data-skin="bear"] .bear-plan-title {
  margin-top: 2px;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
}
[data-skin="bear"] .bear-plan-range {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--soft);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-plan-range-end {
  color: var(--ink);
  font-weight: 500;
}
[data-skin="bear"] .bear-plan-bar {
  position: relative;
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--hairline);
}
[data-skin="bear"] .bear-plan-bar i {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 2px;
  background: var(--accent);
}
[data-skin="bear"] .bear-course.is-card {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: #fff;
}
[data-skin="bear"] .bear-plan-count {
  flex: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
[data-skin="bear"] .bear-plan-count small {
  font-size: 12px;
  font-weight: 400;
  color: var(--soft);
}
[data-skin="bear"] .bear-plan-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 1.5em;
}
[data-skin="bear"] .bear-plan-line .bear-meter {
  flex: 1;
  margin-top: 0;
}
[data-skin="bear"] .bear-plan-line .bear-meter-fill {
  background: var(--accent);
}
[data-skin="bear"] .bear-tabpanels .bear-plan-next {
  margin: 6px 0 0 1.5em;
  font-size: 12.5px;
  color: var(--soft);
}
[data-skin="bear"] .bear-plan-next b {
  font-weight: 500;
  color: var(--ink);
}
[data-skin="bear"] .bear-plan-next.is-warn b {
  color: var(--warn-text);
}
[data-skin="bear"] .bear-course.is-card .bear-pg-subject-name {
  display: none;
}
[data-skin="bear"] .bear-tabpanels .bear-plan-aux {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 12px 0 4px;
  font-size: 12.5px;
  color: var(--soft);
}
[data-skin="bear"] .bear-plan-aux .bear-pg-meta {
  margin-left: auto;
  color: var(--faint);
}
[data-skin="bear"] .bear-pg-warn {
  font-size: 12px;
  font-weight: 400;
  color: var(--warn-text);
}
[data-skin="bear"] .bear-plan-foot {
  display: flex;
  justify-content: flex-start;
  margin-top: 14px;
}
[data-skin="bear"] .bear-mcal-tag {
  min-height: 14px;
  font-size: 11px;
  line-height: 14px;
  color: var(--soft);
  white-space: nowrap;
}
[data-skin="bear"] .bear-mcal-day.is-deep .bear-mcal-tag {
  font-weight: 600;
  color: var(--ink);
}
[data-skin="bear"] .bear-mcal-day.is-recover .bear-mcal-tag {
  color: var(--faint);
}
[data-skin="bear"] .bear-mcal-flag {
  position: absolute;
  top: -1px;
  right: 1px;
  padding: 0 3px;
  border-radius: 3px;
  font-size: 9px;
  line-height: 13px;
  color: #fff;
  background: var(--ink);
}
[data-skin="bear"] .bear-mcal-notedot {
  position: absolute;
  bottom: 4px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--soft);
}
[data-skin="bear"] .bear-mcal-items {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
}
[data-skin="bear"] .bear-tabpanels .bear-mcal-items li {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 0;
  border-bottom: none;
  font-size: 13px;
}
[data-skin="bear"] .bear-mcal-items li > span:nth-child(2) {
  flex: 1;
}
[data-skin="bear"] .bear-mcal-items b {
  font-weight: 600;
}
[data-skin="bear"] .bear-mcal-items small {
  color: var(--soft);
}
[data-skin="bear"] .bear-mcal-items .is-empty {
  color: var(--faint);
}
```

## 第 6 步：Bear 测试

### `skins/bear/progress-panel.test.tsx`

1. `baseProps` 改为（旧测试测的是没有周期总览时的旧布局）：

```tsx
function baseProps(overrides: Partial<ProgressPanelProps> = {}): ProgressPanelProps {
  return { ...SAMPLE_PANELS.progress, tool: "progress", overview: { status: "loading" }, ...overrides };
}
```

2. import 里加 `SAMPLE_OVERVIEW`（从 `../../gallery/panel-samples.js`）。在 `describe` 末尾加：

```tsx
  it("with the cycle overview shows the route end, the cycle dates and course cards", async () => {
    const user = userEvent.setup();
    render(<ProgressPanel {...baseProps({ groups: SAMPLE_GROUPS, overview: { status: "ready", value: SAMPLE_OVERVIEW } })} />);
    expect(screen.getByText("2028 年 7 月 20 日")).toBeTruthy();
    expect(screen.getByText(strings.plan.routeEndLabel)).toBeTruthy();
    expect(screen.getByText("C1 · 离散数学 + 编程语言与编程范式")).toBeTruthy();
    expect(screen.getByText("12-24 周四 结束")).toBeTruthy();
    expect(screen.queryByText(strings.progress.caption)).toBeNull();
    expect(screen.queryByText(strings.progress.cycleTop("C1", 1, 7))).toBeNull();
    expect(screen.getByText(strings.plan.courseEnd("12-24"))).toBeTruthy();
    expect(screen.getByText(strings.plan.lessonTotal(14).trim())).toBeTruthy();
    expect(screen.getByText(strings.plan.auxEmpty)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: strings.plan.showCycles(3) }));
    expect(screen.getByText("计算机体系结构 + 计算理论")).toBeTruthy();
    expect(screen.getByRole("button", { name: strings.progress.newCourse })).toBeTruthy();
  });
```

（`SAMPLE_GROUPS` 里有 `ctm` 课程；`SAMPLE_OVERVIEW.courses` 里也有 `ctm`，所以它变成卡片。若 `getByRole(... showCycles(3))` 因为同名按钮有两个而报错，改用 `getAllByRole(...)[0]`，并在报告里说明。）

### `skins/bear/calendar-panel.test.tsx`

把最后两个测试（`labels cycle days…` 和 `shows the selected day's week…`）替换为：

```tsx
  it("writes the lesson's course or the day's use in each cycle cell, with the cycle start flag", () => {
    render(<CalendarPanel {...baseProps()} />);
    const nov6 = screen.getByRole("button", { name: dayTitle("2026-11-06") });
    expect(nov6.textContent).toContain("离散");
    expect(nov6.textContent).toContain(strings.plan.flagStart("C1"));
    expect(screen.getByRole("button", { name: dayTitle("2026-11-07") }).textContent).toContain("Anki");
    expect(screen.getByRole("button", { name: dayTitle("2026-11-10") }).textContent).toContain("CTM");
    expect(screen.getByRole("button", { name: dayTitle("2026-11-08") }).className).toContain("is-rest");
    expect(screen.getByText(strings.plan.legend(["离散", "CTM"]))).toBeTruthy();
  });

  it("shows the selected day's cycle line and its lessons", () => {
    render(<CalendarPanel {...baseProps({ selected: "2026-11-09" })} />);
    expect(screen.getByText(strings.plan.slotLine("C1", 1, "深度", false))).toBeTruthy();
    expect(screen.getByText("离散 D2")).toBeTruthy();
    expect(screen.getByText(strings.plan.ankiItem)).toBeTruthy();
  });
```

## 第 7 步：bare 与 chicago（只加一行路线结束日期）

### `skins/bare/progress-panel.tsx`

- import 加 `import { routeView } from "../../core/board/plan-view.js";`
- 解构参数加 `overview,`
- 在 `<p>{strings.progress.caption}</p>` **上面**加：

```tsx
      {overview.status === "ready" && overview.value.route && (
        <p data-slot="progress-route">
          {strings.plan.routeEndLabel} {routeView(overview.value, overview.value.date)?.end}
        </p>
      )}
```

### `skins/chicago/progress-panel.tsx`

- import 加 `import { routeView } from "../../core/board/plan-view.js";`
- 解构参数加 `overview,`
- 在 `{groups?.cycle && <Note>…</Note>}` **上面**加：

```tsx
      {overview.status === "ready" && overview.value.route && (
        <Note>
          {strings.plan.routeEndLabel} {routeView(overview.value, overview.value.date)?.end}
        </Note>
      )}
```

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen && git status --short
wc -l apps/desktop/src/renderer/skins/bear/progress-panel.tsx apps/desktop/src/renderer/skins/bear/calendar-panel.tsx
```

完成标准：全绿；`git status` 新增变化只在本单「只准改」列出的文件里。

## 结束报告

列出：改了哪些文件；每一步是否照做；偏离之处与原因；未完成项；两个 bear 文件的行数。
