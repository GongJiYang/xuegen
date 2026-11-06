# 批次 BE-10b：「总进度」按科目分组 + 状态记号

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计；某一步做不到时停下，在报告里写清卡在哪一步、报错原文。

## 本批硬约束（压缩后也要记得）

1. 只改 / 新建这些文件：
   - 新建 `apps/desktop/src/renderer/core/board/progress-groups.ts`、`progress-groups.test.ts`、`use-subjects.ts`
   - 新建 `apps/desktop/src/renderer/skins/bear/progress-groups.tsx`
   - `apps/desktop/src/renderer/core/strings.ts`
   - `apps/desktop/src/renderer/skins/contract.ts`
   - `apps/desktop/src/renderer/core/board/shell-panels.ts`
   - `apps/desktop/src/renderer/App.tsx`
   - `apps/desktop/src/renderer/gallery/panel-samples.ts`
   - `apps/desktop/src/renderer/skins/bear/progress-panel.tsx`、`progress-panel.test.tsx`、`skin.css`
   - `apps/desktop/src/renderer/skins/bare/progress-panel.tsx`、`apps/desktop/src/renderer/skins/chicago/progress-panel.tsx`
   - `apps/desktop/src/renderer/core/board/README.md`（加两行）
   其他文件一律不动。
2. 不加依赖。文案只写在 `core/strings.ts`（皮肤里只允许 `● ! ✓ ○ ◌ ▸ ▾` 这类符号）。
3. 样式限定在 `[data-skin="bear"]` 下，新类名 `bear-pg-` 前缀，写之前 `grep` 确认无重名。
4. 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 `git commit` / `git push`。
5. 不加 `eslint-disable`、`@ts-ignore`、`any`。`App.tsx` ≤ 450 行。决策逻辑只在 `core/board/progress-groups.ts`（纯函数，不读时间）。

## 先读

`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/skins/bear.md`；`shared/data-protocol.ts` 的 `SubjectsOverview`、`SubjectInfo`、`SubjectMaterial`（上一批 BE-10a 加的）；`core/board/use-cycle.ts`（照它写 `use-subjects.ts`）、`core/board/shell-panels.ts`、`skins/bear/progress-panel.tsx` 全文与它的测试、`gallery/panel-samples.ts`。

设计稿（只看不改）：`/Users/gjy/pi-learning/design/animate/src/progress2.jsx`、`progress2.css`。

## 目标（可观察）

有科目数据时，Bear「总进度」变成：顶部一行「C1 · 第 1 / 7 周」和 7 格周进度条；「主项」（默认展开，按科目分组，每门课一行：记号 + 课程名 + 「本周 x/y · 总 a/b」，点开仍是原来的任务、下次起点、风格、改计划、开始学习；课下有「▸ 资料 N · M 本未排课」可展开）；「辅助」（显示周期页写的辅助说明）；「路线外」（默认收起，课程行右侧是「上次 MM-DD」）；「已学专题」（默认收起）；底部图例。记号：完成 ✓、超过 14 天没学 !、还没开始 ○、其余 ●。没有科目数据时保持现在的平铺列表。

## 步骤

### 第 1 步：`core/strings.ts`

在 `progress: { … }` 对象里，`submit: "提交",` 之后加：

```ts
    cycleTop: (cycle: string, week: number, weeks: number): string => `${cycle} · 第 ${week} / ${weeks} 周`,
    sectionMain: "主项",
    sectionAux: "辅助",
    sectionOther: "路线外",
    sectionLearned: "已学专题",
    countCourses: (count: number): string => `${count} 门`,
    countSubjects: (count: number): string => `${count} 个科目`,
    auxEmpty: "空",
    unassigned: "未归科目",
    courseMeta: (weekDone: number, weekTotal: number, done: number, total: number): string =>
      `本周 ${weekDone}/${weekTotal} · 总 ${done}/${total}`,
    lastSeen: (date: string | null): string => (date ? `上次 ${date.slice(5)}` : "还没开始"),
    materials: (count: number, unplanned: number): string =>
      `资料 ${count}${unplanned > 0 ? ` · ${unplanned} 本未排课` : ""}`,
    materialNote: (role: string, status: string): string => `${role} · ${status}`,
    learnedNote: (count: number): string => `${count} 份资料已摄取`,
    legend: "● 在学　! 要注意　✓ 完成　○ 已排期　◌ 未排课",
```

### 第 2 步：新建 `core/board/progress-groups.ts`，原样如下

```ts
/**
 * 总进度 grouped by subject (design `?d=progress`).
 *
 * `subjects.mjs` says which subjects are this cycle's main subjects and which
 * courses and materials each subject has; the course list says how far each
 * course is. These pure functions combine them into the panel's sections. The
 * date is an argument; no clock.
 */

import type { CourseSummary, SubjectInfo, SubjectMaterial, SubjectsOverview } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

/** A course untouched for more than this many days is marked ! (需注意). */
export const STALE_DAYS = 14;

export type CourseMark = "now" | "warn" | "done" | "plan";

export interface GroupedCourse {
  course: CourseSummary;
  mark: CourseMark;
}

export interface SubjectGroup {
  slug: string;
  title: string;
  courses: GroupedCourse[];
  materials: SubjectMaterial[];
  /** Materials registered but not yet in any plan (◌). */
  unplanned: number;
}

export interface LearnedSubject {
  slug: string;
  title: string;
  /** How many of its materials are ingested (✓). */
  done: number;
}

export interface ProgressGroups {
  cycle: { cycle: string; week: number; weeks: number } | null;
  /** The cycle page's 辅助 line, or null outside a cycle. */
  aux: string | null;
  /** True when the auxiliary slots are empty (the line starts with 「（空）」) or there is no cycle. */
  auxEmpty: boolean;
  main: SubjectGroup[];
  /** Other subjects that have courses, then 「未归科目」 for courses no subject claims. */
  other: SubjectGroup[];
  /** Subjects without courses whose materials include ingested ones. */
  learned: LearnedSubject[];
}

function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000;
}

/** ✓ finished, ○ not started, ! untouched for more than {@link STALE_DAYS} days, else ●. */
export function courseMark(course: CourseSummary, today: string): CourseMark {
  if (course.overall.total > 0 && course.overall.done === course.overall.total) return "done";
  if (!course.lastRecord) return "plan";
  return dayNumber(today) - dayNumber(course.lastRecord.date) > STALE_DAYS ? "warn" : "now";
}

export function groupProgress(overview: SubjectsOverview, courses: CourseSummary[], today: string): ProgressGroups {
  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  const assigned = new Set<string>();
  const toGroup = (subject: SubjectInfo): SubjectGroup => {
    const grouped = subject.courses.flatMap((slug) => {
      const course = bySlug.get(slug);
      if (!course) return [];
      assigned.add(slug);
      return [{ course, mark: courseMark(course, today) }];
    });
    return {
      slug: subject.slug,
      title: subject.title,
      courses: grouped,
      materials: subject.materials,
      unplanned: subject.materials.filter((item) => item.mark === "none").length,
    };
  };
  const main = overview.subjects.filter((subject) => subject.main).map(toGroup);
  const rest = overview.subjects.filter((subject) => !subject.main).map(toGroup);
  const other = rest.filter((group) => group.courses.length > 0);
  const learned = rest
    .filter((group) => group.courses.length === 0 && group.materials.some((item) => item.mark === "done"))
    .map((group) => ({
      slug: group.slug,
      title: group.title,
      done: group.materials.filter((item) => item.mark === "done").length,
    }));
  const unassigned = courses
    .filter((course) => !assigned.has(course.slug))
    .map((course) => ({ course, mark: courseMark(course, today) }));
  if (unassigned.length > 0) {
    other.push({ slug: "", title: strings.progress.unassigned, courses: unassigned, materials: [], unplanned: 0 });
  }
  const aux = overview.cycle?.aux ?? null;
  return {
    cycle: overview.cycle
      ? { cycle: overview.cycle.cycle, week: overview.cycle.week, weeks: overview.cycle.weeks }
      : null,
    aux,
    auxEmpty: aux === null || aux.startsWith("（空）"),
    main,
    other,
    learned,
  };
}
```

### 第 3 步：新建 `core/board/progress-groups.test.ts`，原样如下

```ts
import { describe, expect, it } from "vitest";
import type { CourseSummary, SubjectsOverview } from "@shared/data-protocol.js";
import { courseMark, groupProgress } from "./progress-groups.js";
import { strings } from "../strings.js";

function course(slug: string, done: number, total: number, last: string | null): CourseSummary {
  return {
    slug,
    title: slug,
    weekLabel: null,
    week: { done: 0, total: 0, tasks: [] },
    overall: { done, total },
    lastRecord: last ? { date: last, seq: "01" } : null,
    nextSession: null,
    styleHint: null,
  };
}

const OVERVIEW: SubjectsOverview = {
  date: "2026-11-06",
  cycle: { cycle: "C1", week: 1, weeks: 7, aux: "（空）；（空）——路线原定数据结构与算法" },
  subjects: [
    { slug: "ai", title: "AI", layer: "C", route: "路线外", main: false, courses: ["mi", "gone"], materials: [] },
    {
      slug: "dm",
      title: "离散",
      layer: "A",
      route: "C1 主项",
      main: true,
      courses: ["epp"],
      materials: [
        { type: "书籍", mark: "now", status: "学习中", role: "主线", title: "Epp", course: "epp" },
        { type: "书籍", mark: "none", status: "未制定计划", role: "预习", title: "Walk", course: null },
      ],
    },
    {
      slug: "se",
      title: "软件工程",
      layer: "D",
      route: "C10 主项",
      main: false,
      courses: [],
      materials: [{ type: "文章", mark: "done", status: "已摄取", role: "参考", title: "Command", course: null }],
    },
    { slug: "empty", title: "空科目", layer: "A", route: "C2 主项", main: false, courses: [], materials: [] },
  ],
};

describe("courseMark", () => {
  it("marks finished, not started, stale and active courses", () => {
    expect(courseMark(course("a", 4, 4, "2026-10-01"), "2026-11-06")).toBe("done");
    expect(courseMark(course("a", 0, 4, null), "2026-11-06")).toBe("plan");
    expect(courseMark(course("a", 0, 4, "2026-10-22"), "2026-11-06")).toBe("warn");
    expect(courseMark(course("a", 0, 4, "2026-10-23"), "2026-11-06")).toBe("now");
  });
});

describe("groupProgress", () => {
  const courses = [course("epp", 0, 4, "2026-11-05"), course("mi", 0, 4, "2026-10-18"), course("loose", 0, 1, null)];
  const groups = groupProgress(OVERVIEW, courses, "2026-11-06");

  it("puts the main subjects first with their courses and unplanned count", () => {
    expect(groups.cycle).toEqual({ cycle: "C1", week: 1, weeks: 7 });
    expect(groups.auxEmpty).toBe(true);
    expect(groups.main.map((group) => [group.title, group.courses.map((item) => [item.course.slug, item.mark]), group.unplanned])).toEqual([
      ["离散", [["epp", "now"]], 1],
    ]);
  });

  it("lists other subjects with courses, then the courses no subject claims", () => {
    expect(groups.other.map((group) => [group.title, group.courses.map((item) => [item.course.slug, item.mark])])).toEqual([
      ["AI", [["mi", "warn"]]],
      [strings.progress.unassigned, [["loose", "plan"]]],
    ]);
  });

  it("lists subjects with only ingested materials as learned", () => {
    expect(groups.learned).toEqual([{ slug: "se", title: "软件工程", done: 1 }]);
  });

  it("has no cycle line outside a cycle", () => {
    const outside = groupProgress({ ...OVERVIEW, cycle: null }, courses, "2026-11-06");
    expect(outside.cycle).toBeNull();
    expect(outside.aux).toBeNull();
    expect(outside.auxEmpty).toBe(true);
  });
});
```

### 第 4 步：新建 `core/board/use-subjects.ts`，原样如下

```ts
/** The subject skeleton for 总进度 (`subjects.mjs list`), for the given day. */

import type { SubjectsOverview } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { useBoardResource, type BoardResource } from "./use-resource.js";

/** @param today `YYYY-MM-DD` of today (the caller reads the clock). */
export function useSubjects(today: string): BoardResource<SubjectsOverview> {
  return useBoardResource(() => client.data({ kind: "subjects.list", date: today }), [today]);
}
```

### 第 5 步：`skins/contract.ts`

1. 在 import 区（`import type { CalendarCell } from "../core/board/use-calendar.js";` 之后）加：
   ```ts
   import type { ProgressGroups } from "../core/board/progress-groups.js";
   ```
2. `ProgressPanelProps` 里 `sources: AsyncState<ReadingSource[]>;` 之后加：
   ```ts
     /** Courses grouped by subject for the current cycle, or null to show the plain list. */
     groups: ProgressGroups | null;
   ```

### 第 6 步：`core/board/shell-panels.ts`

1. import 区加：
   ```ts
   import type { SubjectsOverview } from "@shared/data-protocol.js";
   import { groupProgress } from "./progress-groups.js";
   import type { BoardResource } from "./use-resource.js";
   ```
   （若 `BoardResource` 已从别处 import，就不要重复。）
2. `ShellPanelsInput` 里 `cycle: CycleResource;` 之后加：
   ```ts
     subjects: BoardResource<SubjectsOverview>;
     /** `YYYY-MM-DD` of today, for the 总进度 marks. */
     today: string;
   ```
3. `progress: { … }` 对象里 `sources: reading.sources.state,` 之后加：
   ```ts
         groups:
           input.subjects.state.status === "ready" &&
           courses.state.status === "ready" &&
           input.subjects.state.value.subjects.length > 0
             ? groupProgress(input.subjects.state.value, courses.state.value, input.today)
             : null,
   ```

### 第 7 步：`App.tsx`

1. import 区 `import { useCycle } from "./core/board/use-cycle.js";` 之后加 `import { useSubjects } from "./core/board/use-subjects.js";`
2. `const cycle = useCycle(…);` 之后加 `const subjects = useSubjects(dateKey(new Date()));`
3. `reloadBoard` 里 `cycle.reload();` 之后加 `subjects.reload();`，依赖数组末尾加 `subjects`。
4. `shellPanels({ … })` 参数里 `cycle,` 之后加：
   ```ts
       subjects,
       today: dateKey(new Date()),
   ```
5. 改完 `wc -l App.tsx` ≤ 450。

### 第 8 步：`gallery/panel-samples.ts`

1. 第一行 import 里按字母序加入 `SubjectsOverview`；再加一行 `import { groupProgress } from "../core/board/progress-groups.js";`
2. 在 `SAMPLE_CALENDAR_CELLS` 那行之前插入：

```ts
/** A small subject skeleton: one main subject with two courses, one subject only with ingested material. */
export const SAMPLE_SUBJECTS: SubjectsOverview = {
  date: "2026-11-06",
  cycle: { cycle: "C1", week: 1, weeks: 7, aux: "（空）；（空）——路线原定数据结构与算法、C 与系统编程" },
  subjects: [
    {
      slug: "programming-paradigms",
      title: "编程语言与编程范式",
      layer: "A 数学与理论基础",
      route: "C1 主项",
      main: true,
      courses: ["ctm", "programming-paradigms"],
      materials: [
        { type: "书籍", mark: "now", status: "学习中", role: "主线", title: "CTM", course: "ctm" },
        { type: "书籍", mark: "none", status: "未制定计划", role: "主线（进阶）", title: "SICP", course: null },
        { type: "在线书籍", mark: "none", status: "未制定计划", role: "练习", title: "Seven Languages in Seven Weeks", course: null },
      ],
    },
    {
      slug: "software-engineering",
      title: "软件工程",
      layer: "D 工程与职业能力",
      route: "C10 主项",
      main: false,
      courses: [],
      materials: [{ type: "文章", mark: "done", status: "已摄取", role: "参考", title: "Command Pattern", course: null }],
    },
  ],
};

/** SAMPLE_SUBJECTS grouped as on 2026-11-06 (ctm last studied 10-16, so it is marked !). */
export const SAMPLE_GROUPS = groupProgress(SAMPLE_SUBJECTS, SAMPLE_COURSES, "2026-11-06");
```

   （`SAMPLE_COURSES` 定义在这之前；若不是，把这两段挪到 `SAMPLE_COURSES` 之后。）
3. `SAMPLE_PANELS.progress` 里 `sources: …,` 之后加 `groups: null,`（保持平铺，原有测试不变）。

### 第 9 步：新建 `skins/bear/progress-groups.tsx`，原样如下

```tsx
/**
 * Bear 总进度 grouped by subject (design `?d=progress`): the cycle line, then
 * 主项 / 辅助 / 路线外 / 已学专题. Course rows are drawn by the caller
 * (`renderCourse`), so the existing row with its actions is reused.
 */

import { Fragment, useState, type ReactNode } from "react";
import type { SubjectMaterial } from "@shared/data-protocol.js";
import type { GroupedCourse, ProgressGroups, SubjectGroup } from "../../core/board/progress-groups.js";
import { strings } from "../../core/strings.js";

/** The state marks every Bear status line uses. */
export const MARKS: Record<SubjectMaterial["mark"], string> = { now: "●", warn: "!", done: "✓", plan: "○", none: "◌" };

function Section({
  title,
  meta,
  defaultOpen,
  children,
}: {
  title: string;
  meta: string;
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
        <span className="bear-pg-meta">
          {meta} {open ? "▾" : "▸"}
        </span>
      </button>
      {open && children}
    </section>
  );
}

function Materials({ group }: { group: SubjectGroup }) {
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
                  </li>
                ))}
            </ul>
          </div>
        ))}
    </div>
  );
}

function Subject({ group, renderCourse }: { group: SubjectGroup; renderCourse(item: GroupedCourse): ReactNode }) {
  return (
    <div className="bear-pg-subject">
      <div className="bear-pg-subject-name">{group.title}</div>
      {group.courses.map((item) => (
        <Fragment key={item.course.slug}>{renderCourse(item)}</Fragment>
      ))}
      <Materials group={group} />
    </div>
  );
}

export function GroupedProgress({
  groups,
  renderCourse,
}: {
  groups: ProgressGroups;
  renderCourse(item: GroupedCourse): ReactNode;
}) {
  const cycle = groups.cycle;
  const otherCount = groups.other.reduce((sum, group) => sum + group.courses.length, 0);
  return (
    <>
      {cycle && (
        <div className="bear-pg-cycle">
          <span>{strings.progress.cycleTop(cycle.cycle, cycle.week, cycle.weeks)}</span>
          <span className="bear-pg-weeks" aria-hidden="true">
            {Array.from({ length: cycle.weeks }, (_, index) => (
              <i key={index} className={index < cycle.week ? "is-on" : ""} />
            ))}
          </span>
        </div>
      )}
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
      {groups.other.length > 0 && (
        <Section title={strings.progress.sectionOther} meta={strings.progress.countCourses(otherCount)} defaultOpen={false}>
          {groups.other.map((group) => (
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
```

### 第 10 步：`skins/bear/progress-panel.tsx`

1. 把 `import { useState } from "react";` 改为 `import { useState, type ReactNode } from "react";`
2. import 区（`import { Rich } from "./rich.js";` 之后）加：
   ```tsx
   import type { CourseMark } from "../../core/board/progress-groups.js";
   import { GroupedProgress, MARKS } from "./progress-groups.js";
   ```
3. `CourseRow` 的参数解构与类型：在 `course,` 之后加 `mark,` 和 `meta,`；类型里在 `course: CourseSummary;` 之后加 `mark: CourseMark | null;` 和 `meta: string | null;`。
4. `CourseRow` 里把这一段
   ```tsx
             <span className="bear-course-title">{course.title}</span>
             <span className="bear-course-pct">
               <SlidingNumber number={percent} initiallyStable />%
             </span>
   ```
   替换为
   ```tsx
             {mark && <span className={`bear-pg-mark is-${mark}`}>{MARKS[mark]}</span>}
             <span className="bear-course-title">{course.title}</span>
             {meta !== null ? (
               <span className="bear-pg-meta">{meta}</span>
             ) : (
               <span className="bear-course-pct">
                 <SlidingNumber number={percent} initiallyStable />%
               </span>
             )}
   ```
5. `ProgressPanel` 的参数解构里 `sources,` 之后加 `groups,`。
6. 在 `if (courses.status === "error") return <p role="alert">{courses.message}</p>;` 之后插入：

```tsx
  const mainSlugs = new Set(groups?.main.flatMap((group) => group.courses.map((item) => item.course.slug)) ?? []);
  const renderRow = (course: CourseSummary, mark: CourseMark | null, meta: string | null): ReactNode => (
    <CourseRow
      key={course.slug}
      course={course}
      mark={mark}
      meta={meta}
      style={courseStyles[course.slug] ?? "plain"}
      started={startedToday[course.slug] === true}
      onCourseStyle={(next) => onCourseStyle(course.slug, next)}
      onStudy={() => onStudy(course)}
      onEditPlan={(next) => onEditPlan(course, next)}
    />
  );
```

7. 把原来的
   ```tsx
           <Accordion type="single" collapsible defaultValue={courses.value[0]?.slug} className="bear-courses">
             {courses.value.map((course) => (
               <CourseRow
                 …（整个 CourseRow 元素）
               />
             ))}
           </Accordion>
   ```
   整块替换为：

```tsx
        <Accordion
          type="single"
          collapsible
          defaultValue={groups?.main[0]?.courses[0]?.course.slug ?? courses.value[0]?.slug}
          className="bear-courses"
        >
          {groups ? (
            <GroupedProgress
              groups={groups}
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
```

8. 文件顶部注释末尾加一句：`With a subject skeleton (groups) the rows are grouped by subject instead (progress-groups.tsx).`

### 第 11 步：`skins/bear/skin.css`

1. 顶部变量块里 `--hairline: #eceef0;` 之后加 `--done: #3a8a5c;`
2. 文件末尾追加：

```css
/* 总进度 by subject (BE-10b). */
[data-skin="bear"] .bear-pg-cycle {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0.4em 0 0.2em;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-pg-weeks {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}
[data-skin="bear"] .bear-pg-weeks i {
  height: 2px;
  background: var(--rule);
}
[data-skin="bear"] .bear-pg-weeks i.is-on {
  background: var(--accent);
}
[data-skin="bear"] .bear-pg-section {
  margin-top: 1em;
}
[data-skin="bear"] .bear-tabpanels .bear-pg-section-head {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 0 0 0.25em;
  border-bottom: 1px solid var(--rule);
  font-weight: 650;
  color: var(--ink);
}
[data-skin="bear"] .bear-pg-subject {
  margin-top: 0.6em;
}
[data-skin="bear"] .bear-pg-subject-name {
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-pg-mark {
  width: 1em;
  flex: none;
  text-align: center;
  font-weight: 700;
  color: var(--soft);
}
[data-skin="bear"] .bear-pg-mark.is-now,
[data-skin="bear"] li.is-now .bear-pg-mark {
  color: var(--accent);
}
[data-skin="bear"] .bear-pg-mark.is-warn {
  color: var(--warn);
}
[data-skin="bear"] .bear-pg-mark.is-done,
[data-skin="bear"] li.is-done .bear-pg-mark {
  color: var(--done);
}
[data-skin="bear"] li.is-none .bear-pg-mark {
  color: var(--faint);
}
[data-skin="bear"] li.is-none .bear-pg-title {
  color: var(--soft);
}
[data-skin="bear"] .bear-pg-meta {
  flex: none;
  font-size: 12px;
  font-weight: 400;
  color: var(--soft);
}
[data-skin="bear"] .bear-course-trigger:has(.bear-pg-mark.is-warn) .bear-pg-meta {
  color: var(--warn-text);
}
[data-skin="bear"] .bear-tabpanels .bear-pg-mats-toggle {
  margin: 0.2em 0 0 1.5em;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-pg-mats-group {
  margin: 0.3em 0 0 1.5em;
}
[data-skin="bear"] .bear-pg-mats-type {
  font-size: 11px;
  color: var(--soft);
}
[data-skin="bear"] .bear-pg-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
[data-skin="bear"] .bear-pg-list li {
  display: flex;
  gap: 0.6em;
  align-items: baseline;
  padding: 0.3em 0;
  border-bottom: 1px solid var(--hairline);
  font-size: 13px;
}
[data-skin="bear"] .bear-pg-title {
  flex: 1;
  min-width: 0;
}
[data-skin="bear"] .bear-pg-aux {
  margin: 0.3em 0 0;
  font-size: 12px;
}
[data-skin="bear"] .bear-pg-legend {
  margin: 1.2em 0 0;
  font-size: 11px;
  color: var(--soft);
}
```

### 第 12 步：`skins/bear/progress-panel.test.tsx`

1. 把 `SAMPLE_PANELS` 的 import 改为同时引入 `SAMPLE_GROUPS`（同一个 import 语句里加）。
2. 在 `describe(...)` 块内最后一个 `it(...)` 之后追加：

```tsx
  it("groups courses by subject with marks, materials and the learned list", async () => {
    render(<ProgressPanel {...baseProps({ groups: SAMPLE_GROUPS })} />);
    expect(screen.getByText(strings.progress.cycleTop("C1", 1, 7))).toBeTruthy();
    expect(screen.getByText("编程语言与编程范式")).toBeTruthy();
    expect(screen.getByText(strings.progress.courseMeta(1, 4, 1, 5))).toBeTruthy();
    expect(screen.getByText("!")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: `▸ ${strings.progress.materials(3, 2)}` }));
    expect(screen.getByText("SICP")).toBeTruthy();
    expect(screen.queryByText("软件工程")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: new RegExp(strings.progress.sectionLearned) }));
    expect(screen.getByText("软件工程")).toBeTruthy();
    expect(screen.getByText(strings.progress.learnedNote(1))).toBeTruthy();
    expect(screen.getByText(strings.progress.legend)).toBeTruthy();
  });
```

### 第 13 步：bare 与 chicago 显示周期一行

1. `skins/bare/progress-panel.tsx`：`ProgressPanel` 参数解构里 `sources,` 之后加 `groups,`；`<p>{strings.progress.caption}</p>` 之后加：
   ```tsx
         {groups?.cycle && (
           <p data-slot="progress-cycle">
             {strings.progress.cycleTop(groups.cycle.cycle, groups.cycle.week, groups.cycle.weeks)}
           </p>
         )}
   ```
2. `skins/chicago/progress-panel.tsx`：`ProgressPanel` 参数解构里 `sources,` 之后加 `groups,`；`<div className="chicago-pane-inner">` 之后第一行加：
   ```tsx
         {groups?.cycle && <Note>{strings.progress.cycleTop(groups.cycle.cycle, groups.cycle.week, groups.cycle.weeks)}</Note>}
   ```

### 第 14 步：`core/board/README.md`

加两行：
```
- `progress-groups.ts`：把科目骨架（subjects.list）和课程列表组合成总进度的主项 / 路线外 / 已学专题，并给课程打记号（纯函数）。
- `use-subjects.ts`：读当天的 subjects.list。
```

## 完成标准（可观察）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && wc -l apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/skins/bear/progress-panel.tsx
cd /Users/gjy/pi-learning/xuegen && git status --short apps/desktop/src
```

- 贴出每条输出的最后 15 行。`progress-groups.test.ts` 的 5 个用例和 Bear 总进度的新用例通过，原有测试全部仍通过；`App.tsx` ≤ 450 行。
- 若某个断言与实际行为不符：先不要改测试或代码去迁就，在报告里写出失败的断言、实际值和你判断的原因，停下。

## 结束报告

列出：改了 / 新建了哪些文件；每一步是否照做；偏离之处及原因；未完成项；`App.tsx` 与 `progress-panel.tsx` 行数。
