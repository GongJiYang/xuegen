# 批次 BE-9b：周期数据接到「今天」与「日历」的接口（Bear 界面下一批做）

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计；某一步做不到时停下，在报告里写清卡在哪一步、报错原文。

## 本批硬约束（压缩后也要记得）

1. 只改 / 新建这些文件：
   - `skills/cycle-plan/cycle.mjs`、`skills/cycle-plan/cycle.test.mjs`
   - `apps/desktop/src/shared/data-protocol.ts`、`apps/desktop/src/main/data/handler.test.ts`（只在第 3 步说明的情况下才改）
   - 新建 `apps/desktop/src/renderer/core/board/cycle-today.ts`、`cycle-today.test.ts`、`use-cycle.ts`
   - `apps/desktop/src/renderer/core/strings.ts`
   - `apps/desktop/src/renderer/skins/contract.ts`
   - `apps/desktop/src/renderer/core/board/shell-panels.ts`
   - `apps/desktop/src/renderer/App.tsx`
   - `apps/desktop/src/renderer/gallery/panel-samples.ts`
   - `apps/desktop/src/renderer/skins/bare/panels.tsx`、`apps/desktop/src/renderer/skins/chicago/today-panel.tsx`
   - `apps/desktop/src/renderer/core/board/README.md`（加一行）
   **不动 `skins/bear/` 下任何文件**（Bear 界面是下一批 BE-9c）；不动 `skills/cycle-plan/SKILL.md`。
2. 不加依赖。界面文案只写在 `core/strings.ts`；皮肤里不写中文。
3. 不读写 `~/.xuegen/`，不碰任何 Obsidian 库（`/Users/gjy/Documents/` 下的东西），不启动 Electron，不 `git commit` / `git push`。
4. 不加 `eslint-disable`、`@ts-ignore`、`any`。`App.tsx` 改完必须 ≤ 450 行。
5. 新的决策逻辑都是纯函数（`cycle-today.ts`），不读时间、不做 I/O。

## 先读

`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`；`skills/cycle-plan/SKILL.md`（「周期页」「脚本」两节）；`apps/desktop/src/shared/data-protocol.ts` 里的 `CycleDay`、`CycleMonth`；`renderer/core/today.ts`、`core/board/use-cards.ts`、`core/board/shell-panels.ts`、`core/board/use-course-sessions.ts`（`handleStudy`、`handleStartSession`）、`skins/contract.ts` 的 `TodayPanelProps`、`CalendarPanelProps`、`gallery/panel-samples.ts`。

## 背景

上一批（BE-9a）已让数据通道有 `cycle.day`、`cycle.month`。本批：(1) 脚本给出课程短名；(2) 写把一天的周期数据变成「今天」窗口内容的纯函数；(3) 加 hook、契约字段、面板组装和两个动作（开始某门课、去做周核实）；(4) bare 与 chicago 在「今天」顶部显示一行周期信息。Bear 的完整界面在下一批。

## 步骤

### 第 1 步：`cycle.mjs` 读出课程短名

1. 在 `parseCycle` 里，`const template = {};` 之后加一行 `const names = {};`。
2. 把这一行
   ```js
       const link = /\[\[courses\/([^\]|\\]+)/.exec(cells[2] ?? "");
   ```
   改为
   ```js
       const link = /\[\[courses\/([^\]|\\]+)(?:\\?\|([^\]]+))?\]\]/.exec(cells[2] ?? "");
   ```
3. 在 `template[day] = { type, course: link ? link[1].trim() : null };` 之后加一行：
   ```js
       if (link) names[link[1].trim()] = (link[2] ?? link[1]).trim();
   ```
4. 把 `return { cycle, start, end, template };` 改为 `return { cycle, start, end, template, names };`，函数上方注释改为 `/** 解析周期页：{ cycle, start, end, template: { 0..6: { type, course } }, names: { slug: 短名 } }（0 = 周日）。格式不对就抛错。 */`。
5. `dayInfo` 里：
   - 不在周期内的那行 `return { ...base, cycle: null, week: null, type: null, course: null, lessons: [], overdue: [] };` 改为在 `course: null,` 后加 `names: {},`；
   - 最后的 `return { ...base, cycle: cycle.cycle, … course: slot.course, lessons, overdue };` 改为在 `course: slot.course,` 后加 `names: cycle.names,`。

### 第 2 步：`cycle.test.mjs` 追加测试

在文件末尾追加：

```js
test("parseCycle reads each course's short name from the link text; dayInfo passes the names on", () => {
  const cycle = parseCycle(CYCLE);
  assert.deepEqual(cycle.names, { a: "离散", b: "范式" });
  assert.deepEqual(parseCycle(CYCLE.replaceAll("\\|离散", "").replaceAll("\\|范式", "")).names, { a: "a", b: "b" });
  const courses = coursesFrom({ a: courseText(aRows, A_DAYS), b: courseText(bRows, B_DAYS) });
  assert.deepEqual(dayInfo(cycle, courses, "2026-11-09").names, { a: "离散", b: "范式" });
  assert.deepEqual(dayInfo(null, new Map(), "2026-11-09").names, {});
});
```

### 第 3 步：`shared/data-protocol.ts` 的 `CycleDay` 加 `names`

在 `CycleDay` 接口的 `course: string | null;` 之后加：

```ts
  /** Course slug → the short name the weekly template links it with. */
  names: Record<string, string>;
```

（`main/data/handler.test.ts` 里 BE-9a 的 `toMatchObject` 断言不受影响，**不用改**；若 typecheck 报它有问题，报告原文后停下。）

### 第 4 步：`core/strings.ts`

1. 文件顶部注释块之后、`export const strings = {` 之前插入：

```ts
import type { CycleDayType } from "@shared/data-protocol.js";

const CYCLE_DAY_TYPE: Record<CycleDayType, string> = {
  深度: "深度日",
  整合: "整合日",
  低强度: "低强度日",
  休息: "休息日",
};
```

2. 在 `strings` 对象里，`today: { … },` 整块之后插入：

```ts
  cycle: {
    dayType: CYCLE_DAY_TYPE,
    typeShort: { 深度: "深", 整合: "整", 低强度: "低", 休息: "休" } as Record<CycleDayType, string>,
    headline: (week: number, weekday: string, type: CycleDayType, extra: boolean): string =>
      `第 ${week} 周 · ${weekday} · ${CYCLE_DAY_TYPE[type]}${extra ? "（加课）" : ""}`,
    minutes: "90 分钟",
    start: "开始 →",
    carried: (date: string): string => `! 原定 ${date.slice(5)}，顺延到今天`,
    missed: (name: string, id: string): string => `${name} ${id} 没学`,
    missedNote: "下次顺延",
    verifyTitle: "周核实",
    verifyRow: (name: string, done: number, total: number): string => `${name}：本周 ${done}/${total}`,
    verify: "核实 →",
    light: "不上新课",
    rest: "休息",
    anki: "Anki",
    ankiDue: (count: number): string => `${count} 张待复习`,
    ankiOff: "未打开",
    tomorrow: (weekday: string, type: CycleDayType, lesson: string | null): string =>
      `明天：${weekday} · ${CYCLE_DAY_TYPE[type]}${lesson ? ` · ${lesson}` : ""}`,
    verifyPrompt: (slug: string): string =>
      `做本周周核实：按收课流程逐项提问，核对后再打勾（课程文件：wiki/courses/${slug}.md）`,
    legend: "深 · 整 · 低 · 休 ＝ 日子类型",
  },
```

### 第 5 步：新建 `renderer/core/board/cycle-today.ts`，原样如下

```ts
/**
 * The 今天 window on a study-cycle day.
 *
 * `cycle.mjs` reports where a day sits in its cycle (week, 深度/整合/低强度/休息,
 * lessons, missed lessons). These pure functions turn that into what the window
 * leads with: one headline, one focus block, the missed lessons of other
 * courses, and a line about tomorrow. No clock, no I/O.
 */

import type { AnkiStatus, CourseSummary, CycleDay, CycleLesson } from "@shared/data-protocol.js";
import { strings } from "../strings.js";

/** What the 今天 window leads with on a cycle day. */
export type CycleFocus =
  | { kind: "lesson"; lesson: CycleLesson; name: string; carriedFrom: string | null }
  | { kind: "verify" }
  | { kind: "light" }
  | { kind: "rest" };

export interface CycleTodayView {
  headline: string;
  focus: CycleFocus;
  /** Other courses' lessons that were missed; they shift when that course is opened. */
  missed: { name: string; id: string }[];
  /** Every day but 休息 shows the Anki row. */
  showAnki: boolean;
  /** 「明天：…」, or null when tomorrow is outside every cycle. */
  tomorrow: string | null;
}

/** One course's row on the 整合 day: its 本周 count. */
export interface WeekCheck {
  slug: string;
  name: string;
  done: number;
  total: number;
}

/** The short name the weekly template links a course with, else its slug. */
export function cycleName(day: CycleDay, slug: string): string {
  return day.names[slug] ?? slug;
}

/** 「第 1 周 · 周五 · 整合日（加课）」, or null outside every cycle. */
export function cycleHeadline(day: CycleDay): string | null {
  if (day.cycle === null || day.week === null || day.type === null) return null;
  const extra = day.type !== "深度" && day.lessons.length > 0;
  return strings.cycle.headline(day.week, day.weekday, day.type, extra);
}

/** 「明天：周六 · 低强度日」 (plus the lesson), or null outside every cycle. */
export function tomorrowLine(day: CycleDay): string | null {
  if (day.type === null) return null;
  const lesson = day.lessons[0];
  return strings.cycle.tomorrow(day.weekday, day.type, lesson ? `${cycleName(day, lesson.course)} ${lesson.id}` : null);
}

/**
 * The view for a cycle day, or null outside every cycle.
 *
 * A missed lesson of the course being studied today is carried: the course
 * skill shifts it to today when the course is opened, so it (not today's
 * planned lesson) is the one to start.
 */
export function cycleTodayView(day: CycleDay, tomorrow: CycleDay | null): CycleTodayView | null {
  const headline = cycleHeadline(day);
  if (headline === null) return null;
  const focusCourse = day.lessons[0]?.course ?? day.course;
  const carried = day.overdue.find((row) => row.course === focusCourse) ?? null;
  const lesson = carried ?? day.lessons[0] ?? null;
  const focus: CycleFocus = lesson
    ? {
        kind: "lesson",
        lesson: { course: lesson.course, id: lesson.id, content: lesson.content },
        name: cycleName(day, lesson.course),
        carriedFrom: carried ? carried.date : null,
      }
    : day.type === "整合"
      ? { kind: "verify" }
      : day.type === "休息"
        ? { kind: "rest" }
        : { kind: "light" };
  const missed = day.overdue
    .filter((row) => row !== carried)
    .map((row) => ({ name: cycleName(day, row.course), id: row.id }));
  return {
    headline,
    focus,
    missed,
    showAnki: day.type !== "休息",
    tomorrow: tomorrow ? tomorrowLine(tomorrow) : null,
  };
}

/** The 整合 day's rows: each cycle course's 本周 done/total, in template order. */
export function weekChecks(day: CycleDay, courses: CourseSummary[]): WeekCheck[] {
  return Object.keys(day.names).flatMap((slug) => {
    const course = courses.find((item) => item.slug === slug);
    return course ? [{ slug, name: cycleName(day, slug), done: course.week.done, total: course.week.total }] : [];
  });
}

/** Cards due in Anki today, or null when Anki is not running. */
export function ankiDueCount(status: AnkiStatus): number | null {
  if (!status.running) return null;
  return (status.due ?? []).reduce((sum, deck) => sum + deck.count, 0);
}
```

### 第 6 步：新建 `renderer/core/board/cycle-today.test.ts`，原样如下

```ts
import { describe, expect, it } from "vitest";
import type { CourseSummary, CycleDay } from "@shared/data-protocol.js";
import { ankiDueCount, cycleHeadline, cycleTodayView, tomorrowLine, weekChecks } from "./cycle-today.js";

const NAMES = { epp: "离散", ctm: "CTM" };
const D2 = { course: "epp", id: "D2", content: "真值表" };

function day(overrides: Partial<CycleDay>): CycleDay {
  return {
    date: "2026-11-09",
    weekday: "周一",
    cycle: "C1",
    week: 1,
    type: "深度",
    course: "epp",
    names: NAMES,
    lessons: [],
    overdue: [],
    ...overrides,
  };
}

function course(slug: string, done: number, total: number): CourseSummary {
  return {
    slug,
    title: slug,
    weekLabel: null,
    week: { done, total, tasks: [] },
    overall: { done: 0, total: 0 },
    lastRecord: null,
    nextSession: null,
    styleHint: null,
  };
}

describe("cycleHeadline", () => {
  it("names the week, weekday and day type", () => {
    expect(cycleHeadline(day({}))).toBe("第 1 周 · 周一 · 深度日");
  });
  it("marks an extra lesson on a non-深度 day", () => {
    const friday = day({ weekday: "周五", type: "整合", course: null, lessons: [{ course: "epp", id: "D1", content: "Ch1" }] });
    expect(cycleHeadline(friday)).toBe("第 1 周 · 周五 · 整合日（加课）");
  });
  it("is null outside every cycle", () => {
    expect(cycleHeadline(day({ cycle: null, week: null, type: null, course: null }))).toBeNull();
  });
});

describe("cycleTodayView", () => {
  it("leads a 深度 day with its lesson", () => {
    const view = cycleTodayView(day({ lessons: [D2] }), null);
    expect(view?.focus).toEqual({ kind: "lesson", lesson: D2, name: "离散", carriedFrom: null });
    expect(view?.missed).toEqual([]);
    expect(view?.showAnki).toBe(true);
    expect(view?.tomorrow).toBeNull();
  });
  it("carries a missed lesson of today's course and lists other courses' missed lessons", () => {
    const view = cycleTodayView(
      day({
        date: "2026-11-11",
        weekday: "周三",
        lessons: [{ course: "epp", id: "D3", content: "论证" }],
        overdue: [
          { ...D2, date: "2026-11-09" },
          { course: "ctm", id: "D1", content: "阶梯", date: "2026-11-10" },
        ],
      }),
      null,
    );
    expect(view?.focus).toEqual({ kind: "lesson", lesson: D2, name: "离散", carriedFrom: "2026-11-09" });
    expect(view?.missed).toEqual([{ name: "CTM", id: "D1" }]);
  });
  it("uses verify / light / rest when a day has no lesson", () => {
    expect(cycleTodayView(day({ type: "整合", course: null }), null)?.focus).toEqual({ kind: "verify" });
    expect(cycleTodayView(day({ type: "低强度", course: null }), null)?.focus).toEqual({ kind: "light" });
    const rest = cycleTodayView(day({ type: "休息", course: null }), null);
    expect(rest?.focus).toEqual({ kind: "rest" });
    expect(rest?.showAnki).toBe(false);
  });
  it("adds tomorrow's line", () => {
    const tomorrow = day({ date: "2026-11-10", weekday: "周二", course: "ctm", lessons: [{ course: "ctm", id: "D1", content: "阶梯" }] });
    expect(cycleTodayView(day({}), tomorrow)?.tomorrow).toBe("明天：周二 · 深度日 · CTM D1");
    expect(tomorrowLine(day({ weekday: "周六", type: "低强度", course: null }))).toBe("明天：周六 · 低强度日");
  });
  it("is null outside every cycle", () => {
    expect(cycleTodayView(day({ cycle: null, week: null, type: null, course: null }), null)).toBeNull();
  });
});

describe("weekChecks and ankiDueCount", () => {
  it("lists each cycle course's 本周 count in template order", () => {
    expect(weekChecks(day({ type: "整合" }), [course("ctm", 1, 3), course("epp", 2, 3), course("other", 0, 1)])).toEqual([
      { slug: "epp", name: "离散", done: 2, total: 3 },
      { slug: "ctm", name: "CTM", done: 1, total: 3 },
    ]);
  });
  it("sums the due decks, null when Anki is closed", () => {
    expect(ankiDueCount({ running: true, due: [{ deck: "A", count: 30 }, { deck: "B", count: 7 }] })).toBe(37);
    expect(ankiDueCount({ running: true })).toBe(0);
    expect(ankiDueCount({ running: false })).toBeNull();
  });
});
```

### 第 7 步：新建 `renderer/core/board/use-cycle.ts`，原样如下

```ts
/**
 * Study-cycle view model: today's and tomorrow's place in the cycle (for 今天)
 * and the displayed month's day types (for 日历), loaded from `cycle.mjs`
 * through the data channel.
 */

import type { CycleDay, CycleMonth } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { useBoardResource, type BoardResource } from "./use-resource.js";

export interface CycleResource {
  today: BoardResource<CycleDay>;
  tomorrow: BoardResource<CycleDay>;
  month: BoardResource<CycleMonth>;
  reload(): void;
}

/**
 * @param today    `YYYY-MM-DD` of today (the caller reads the clock).
 * @param tomorrow `YYYY-MM-DD` of tomorrow.
 * @param month    The `YYYY-MM` the calendar is showing.
 */
export function useCycle(today: string, tomorrow: string, month: string): CycleResource {
  const todayResource = useBoardResource(() => client.data({ kind: "cycle.day", date: today }), [today]);
  const tomorrowResource = useBoardResource(() => client.data({ kind: "cycle.day", date: tomorrow }), [tomorrow]);
  const monthResource = useBoardResource(() => client.data({ kind: "cycle.month", month }), [month]);
  return {
    today: todayResource,
    tomorrow: tomorrowResource,
    month: monthResource,
    reload: () => {
      todayResource.reload();
      tomorrowResource.reload();
      monthResource.reload();
    },
  };
}
```

### 第 8 步：`skins/contract.ts`

1. 从 `@shared/data-protocol.js` 的 import 列表里按字母序加入 `CycleDay`、`CycleMonth`（放在 `CourseSummary` 之后）。
2. `TodayPanelProps` 接口里，在 `startedToday: Record<string, boolean>;` 那一行（连同它上面的注释）之后插入：

```ts
  /** Today's and tomorrow's place in the study cycle; `cycle` is null outside every cycle. */
  cycleToday: AsyncState<CycleDay>;
  cycleTomorrow: AsyncState<CycleDay>;
  /** The course list, for the 整合 day's 本周 counts. */
  courses: AsyncState<CourseSummary[]>;
  /** Anki status, for the 「Anki」 row's due count. */
  anki: AsyncState<AnkiStatus>;
  /** Start a cycle lesson in its course's session (same as 总进度's 开始学习). */
  onStudyCourse(slug: string): void;
  /** Open a course's session and ask for this week's 周核实. */
  onVerifyCourse(slug: string): void;
```

3. `CalendarPanelProps` 接口里，在 `courseTitles: Record<string, string>;` 之后插入：

```ts
  /** The displayed month's study-cycle day types; days outside every cycle are absent. */
  cycleMonth: AsyncState<CycleMonth>;
```

### 第 9 步：`core/board/shell-panels.ts`

1. 文件顶部 import 区加：`import type { CycleResource } from "./use-cycle.js";`
2. `ShellPanelsInput` 接口里，`calendar: ReturnType<typeof useCalendar>;` 之后加 `cycle: CycleResource;`；`onEditDay(date: string): void;` 之后加：
   ```ts
     onStudyCourse(slug: string): void;
     onVerifyCourse(slug: string): void;
   ```
3. `shellPanels` 里 `today: { … }` 对象的 `startedToday: input.startedToday,` 之后加：
   ```ts
         cycleToday: input.cycle.today.state,
         cycleTomorrow: input.cycle.tomorrow.state,
         courses: courses.state,
         anki: anki.state,
         onStudyCourse: input.onStudyCourse,
         onVerifyCourse: input.onVerifyCourse,
   ```
4. `calendar: { … }` 对象的 `courseTitles: input.courseTitles,` 之后加：
   ```ts
         cycleMonth: input.cycle.month.state,
   ```

### 第 10 步：`App.tsx`

1. import 区，`import { useCalendar, dateKey } from "./core/board/use-calendar.js";` 之后加：
   ```ts
   import { useCycle } from "./core/board/use-cycle.js";
   ```
2. `const calendar = useCalendar(currentMonth());` 之后加：
   ```ts
     const cycle = useCycle(dateKey(new Date()), dateKey(new Date(new Date().setHours(24, 0, 0, 0))), calendar.month);
   ```
3. `useCourseSessions(...)` 的解构列表里，`handleResume,` 之后加 `handleStartSession,`。
4. `reloadBoard` 里，`calendar.resource.reload();` 之后加 `cycle.reload();`，依赖数组改为 `[courses, reading, cards, calendar.resource, cycle]`。
5. `shellPanels({ … })` 的参数里，`calendar,` 之后加 `cycle,`；`onEditDay: (date) => { … },` 整项之后加：
   ```ts
       onStudyCourse: (slug) => {
         const course = courses.state.status === "ready" ? courses.state.value.find((item) => item.slug === slug) : undefined;
         if (course) handleStudy(course);
       },
       onVerifyCourse: (slug) => handleStartSession(slug, strings.cycle.verifyPrompt(slug)),
   ```
6. 改完 `wc -l App.tsx` 必须 ≤ 450。

### 第 11 步：`gallery/panel-samples.ts`

1. 第一行 import 里按字母序加入 `CycleDay`、`CycleMonth`。
2. 在 `SAMPLE_CALENDAR_CELLS` 那行之前插入：

```ts
/** A day outside every cycle: the 今天 window keeps its plain layout. */
export const SAMPLE_CYCLE_OUTSIDE: CycleDay = {
  date: "2026-11-05",
  weekday: "周四",
  cycle: null,
  week: null,
  type: null,
  course: null,
  names: {},
  lessons: [],
  overdue: [],
};

/** A 深度 day: today's lesson, one carried over from Monday, one missed in the other course. */
export const SAMPLE_CYCLE_DAY: CycleDay = {
  date: "2026-11-11",
  weekday: "周三",
  cycle: "C1",
  week: 1,
  type: "深度",
  course: "discrete-math-epp",
  names: { "discrete-math-epp": "离散", ctm: "CTM" },
  lessons: [{ course: "discrete-math-epp", id: "D3", content: "Ch2 §2.3：有效论证、推理规则、谬误" }],
  overdue: [
    { course: "discrete-math-epp", id: "D2", date: "2026-11-09", content: "Ch2 §2.1–2.2：真值表、逻辑等价、条件语句与逆否" },
    { course: "ctm", id: "D1", date: "2026-11-10", content: "Ch1 概念阶梯 + Ch2 §2.2–2.3" },
  ],
};

/** The first cycle week of November 2026, for the calendar's day-type labels. */
export const SAMPLE_CYCLE_MONTH: CycleMonth = {
  month: "2026-11",
  days: {
    "2026-11-06": { cycle: "C1", week: 1, type: "整合", course: null },
    "2026-11-07": { cycle: "C1", week: 1, type: "低强度", course: null },
    "2026-11-08": { cycle: "C1", week: 1, type: "休息", course: null },
    "2026-11-09": { cycle: "C1", week: 1, type: "深度", course: "discrete-math-epp" },
    "2026-11-10": { cycle: "C1", week: 1, type: "深度", course: "ctm" },
    "2026-11-11": { cycle: "C1", week: 1, type: "深度", course: "discrete-math-epp" },
    "2026-11-12": { cycle: "C1", week: 1, type: "深度", course: "ctm" },
  },
};
```

3. `SAMPLE_PANELS.today` 里，`startedToday: { ctm: true },` 之后加：
   ```ts
       cycleToday: { status: "ready", value: SAMPLE_CYCLE_OUTSIDE },
       cycleTomorrow: { status: "ready", value: SAMPLE_CYCLE_OUTSIDE },
       courses: { status: "ready", value: SAMPLE_COURSES },
       anki: { status: "ready", value: SAMPLE_ANKI },
       onStudyCourse: noop,
       onVerifyCourse: noop,
   ```
   （`SAMPLE_COURSES`、`SAMPLE_ANKI` 都定义在 `SAMPLE_PANELS` 之前，可以直接用；`noop` 也是。若 `SAMPLE_CYCLE_*` 定义的位置在 `SAMPLE_PANELS` 之后导致报错，把它们挪到 `SAMPLE_PANELS` 之前。）
4. `SAMPLE_PANELS.calendar` 里，`courseTitles` 那一项之后加：
   ```ts
       cycleMonth: { status: "ready", value: SAMPLE_CYCLE_MONTH },
   ```

### 第 12 步：bare 与 chicago 在「今天」顶部显示周期一行

1. `skins/bare/panels.tsx`：
   - import 区加 `import { cycleHeadline } from "../../core/board/cycle-today.js";`
   - `TodayPanel` 的参数解构里加 `cycleToday,`（放在 `agentReady,` 之后）。
   - 函数体 `return (` 之前加：
     ```tsx
       const cycleLine = cycleToday.status === "ready" ? cycleHeadline(cycleToday.value) : null;
     ```
   - `<h2>{strings.today.title}</h2>` 之后加：
     ```tsx
           {cycleLine && <p data-slot="cycle-headline">{cycleLine}</p>}
     ```
2. `skins/chicago/today-panel.tsx`：
   - import 区加 `import { cycleHeadline } from "../../core/board/cycle-today.js";`
   - `TodayPanel` 的参数解构里加 `cycleToday,`（放在 `agentReady,` 之后）。
   - `const pending = …;` 之后加：
     ```tsx
       const cycleLine = cycleToday.status === "ready" ? cycleHeadline(cycleToday.value) : null;
     ```
   - `<div className="chicago-pane-inner">` 之后的第一行加：
     ```tsx
           {cycleLine && <div className="chicago-small">{cycleLine}</div>}
     ```

### 第 13 步：`core/board/README.md`

在列文件的地方加两行（没有列表就加在末尾）：
```
- `cycle-today.ts`：把一天的周期数据（cycle.day）变成「今天」窗口的标题、主攻块、没学的课、明天一行（纯函数）。
- `use-cycle.ts`：读今天、明天的 cycle.day 和日历当月的 cycle.month。
```

## 完成标准（可观察）

下面的命令全部通过，贴出每条输出的最后 15 行：

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen && wc -l apps/desktop/src/renderer/App.tsx
cd /Users/gjy/pi-learning/xuegen && git status --short apps/desktop/src skills/cycle-plan
```

- `cycle-today.test.ts` 的 10 个用例与 `cycle.test.mjs` 新增的 1 个测试通过，原有测试全部仍通过（Bear 的今天/日历测试不应受影响，因为样例里的 `cycleToday` 是周期外的一天）。
- `App.tsx` ≤ 450 行。
- 若某个断言与实际行为不符：先不要改测试或代码去迁就，在报告里写出失败的断言、实际值和你判断的原因，停下。

## 结束报告

列出：改了 / 新建了哪些文件；每一步是否照做；偏离清单之处及原因（没有就写「无」）；未完成项；`App.tsx` 行数。
