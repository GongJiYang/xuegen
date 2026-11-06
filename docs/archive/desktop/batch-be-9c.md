# 批次 BE-9c：Bear「今天」与「日历」显示学习周期

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计；某一步做不到时停下，在报告里写清卡在哪一步、报错原文。

## 本批硬约束（压缩后也要记得）

1. 只改 / 新建这些文件：
   - 新建 `apps/desktop/src/renderer/skins/bear/cycle-today.tsx`
   - `apps/desktop/src/renderer/skins/bear/today-panel.tsx`、`today-panel.test.tsx`
   - `apps/desktop/src/renderer/skins/bear/calendar-panel.tsx`、`calendar-panel.test.tsx`
   - `apps/desktop/src/renderer/skins/bear/skin.css`
   - `apps/desktop/src/renderer/core/strings.ts`（只加第 1 步那一项）
   - `docs/desktop/skins/bear.md`（只加第 7 步那几行）
   其他文件一律不动。
2. 不加依赖。界面文案只来自 `core/strings.ts`；皮肤里不写中文（`●`、`!`、`○`、`—` 这类符号可以）。
3. 样式全部限定在 `[data-skin="bear"]` 下；新类名统一 `bear-cy-` 或 `bear-mcal-` 前缀，写之前先 `grep` 确认没有重名。
4. 不读写 `~/.xuegen/`，不碰任何 Obsidian 库，不启动 Electron，不 `git commit` / `git push`。
5. 不加 `eslint-disable`、`@ts-ignore`、`any`；`switch` 穷尽用 `assertNever`。

## 先读

`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/skins/bear.md`；`renderer/core/board/cycle-today.ts`（上一批写好的纯函数：`cycleTodayView`、`weekChecks`、`ankiDueCount`）、`skins/contract.ts` 的 `TodayPanelProps`（`cycleToday`、`cycleTomorrow`、`courses`、`anki`、`onStudyCourse`、`onVerifyCourse`）与 `CalendarPanelProps`（`cycleMonth`）；现有的 `skins/bear/today-panel.tsx`、`calendar-panel.tsx`、`skin.css`；`gallery/panel-samples.ts` 的 `SAMPLE_CYCLE_DAY`、`SAMPLE_CYCLE_MONTH`、`SAMPLE_COURSES`。

设计稿（只看，不要改）：`/Users/gjy/pi-learning/design/animate/src/cycle.jsx`、`cycle.css`。

## 目标（可观察）

- 「今天」：当天在周期内时，整个面板换成周期视图——顶部一行小字标题，一个上方带强调色细线的主攻块（上课：时长、课次名、内容、可能的「顺延」一行、「开始 →」；整合日：每门课一行「本周 x/y」+「核实 →」；低强度日：「不上新课」；休息日：「休息」，细线为灰色），其下是其他课没学的课次（琥珀色 `!`）、Anki 一行（休息日不显示）、最后一行「明天：…」。周期外的日子保持现在的样子。
- 「日历」：周期内每个日期数字下面有一个小字（深 / 整 / 低 / 休），休息日整格变淡；图例下面多一行「深 · 整 · 低 · 休 ＝ 日子类型」；选中日的详情标题下多一行「第 N 周 · X日」。

## 步骤

### 第 1 步：`core/strings.ts` 加一项

在 `cycle: { … }` 对象里，`legend: …,` 之后加：

```ts
    slotLine: (week: number, type: CycleDayType): string => `第 ${week} 周 · ${CYCLE_DAY_TYPE[type]}`,
```

### 第 2 步：新建 `skins/bear/cycle-today.tsx`，原样如下

```tsx
/**
 * Bear 今天 on a study-cycle day (design `?d=cycle`): a small headline, one
 * focus block under an accent rule, other courses' missed lessons, the Anki row,
 * and a line about tomorrow. All decisions come from `core/board/cycle-today`.
 */

import type { AnkiStatus, CourseSummary, CycleDay } from "@shared/data-protocol.js";
import { assertNever } from "@shared/protocol.js";
import type { AsyncState } from "../../core/board/state.js";
import { ankiDueCount, weekChecks, type CycleTodayView } from "../../core/board/cycle-today.js";
import { strings } from "../../core/strings.js";
import { Rich } from "./rich.js";

interface FocusProps {
  view: CycleTodayView;
  day: CycleDay;
  courses: AsyncState<CourseSummary[]>;
  agentReady: boolean;
  onStudyCourse(slug: string): void;
  onVerifyCourse(slug: string): void;
}

function Focus({ view, day, courses, agentReady, onStudyCourse, onVerifyCourse }: FocusProps) {
  const focus = view.focus;
  switch (focus.kind) {
    case "lesson":
      return (
        <div className="bear-cy-focus">
          <div className="bear-cy-k">{strings.cycle.minutes}</div>
          <div className="bear-cy-title">
            {focus.name} {focus.lesson.id}
          </div>
          <p className="bear-muted">
            <Rich text={focus.lesson.content} />
          </p>
          {focus.carriedFrom && <p className="bear-cy-carried">{strings.cycle.carried(focus.carriedFrom)}</p>}
          <button
            type="button"
            className="bear-link bear-link-accent"
            disabled={!agentReady}
            onClick={() => onStudyCourse(focus.lesson.course)}
          >
            {strings.cycle.start}
          </button>
        </div>
      );
    case "verify": {
      const rows = courses.status === "ready" ? weekChecks(day, courses.value) : [];
      return (
        <div className="bear-cy-focus">
          <div className="bear-cy-k">{strings.cycle.verifyTitle}</div>
          <ul className="bear-cy-list">
            {rows.map((row) => (
              <li key={row.slug} className="is-now">
                <span className="bear-cy-mark">●</span>
                <span className="bear-cy-text">{strings.cycle.verifyRow(row.name, row.done, row.total)}</span>
                <button
                  type="button"
                  className="bear-link bear-link-accent"
                  disabled={!agentReady}
                  onClick={() => onVerifyCourse(row.slug)}
                >
                  {strings.cycle.verify}
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "light":
      return (
        <div className="bear-cy-focus">
          <div className="bear-cy-title">{strings.cycle.light}</div>
        </div>
      );
    case "rest":
      return (
        <div className="bear-cy-focus is-rest">
          <div className="bear-cy-title">{strings.cycle.rest}</div>
        </div>
      );
    default:
      return assertNever(focus);
  }
}

export interface CycleTodayProps extends FocusProps {
  anki: AsyncState<AnkiStatus>;
}

export function CycleToday({ view, day, courses, anki, agentReady, onStudyCourse, onVerifyCourse }: CycleTodayProps) {
  const due = anki.status === "ready" ? ankiDueCount(anki.value) : null;
  const ankiMeta = anki.status !== "ready" ? "—" : due === null ? strings.cycle.ankiOff : strings.cycle.ankiDue(due);
  return (
    <>
      <p className="bear-cy-head">{view.headline}</p>
      <Focus
        view={view}
        day={day}
        courses={courses}
        agentReady={agentReady}
        onStudyCourse={onStudyCourse}
        onVerifyCourse={onVerifyCourse}
      />
      {view.missed.length > 0 && (
        <ul className="bear-cy-list">
          {view.missed.map((row) => (
            <li key={`${row.name}-${row.id}`} className="is-warn">
              <span className="bear-cy-mark">!</span>
              <span className="bear-cy-text">{strings.cycle.missed(row.name, row.id)}</span>
              <span className="bear-cy-meta">{strings.cycle.missedNote}</span>
            </li>
          ))}
        </ul>
      )}
      {view.showAnki && (
        <ul className="bear-cy-list">
          <li className="is-plan">
            <span className="bear-cy-mark">○</span>
            <span className="bear-cy-text">{strings.cycle.anki}</span>
            <span className="bear-cy-meta">{ankiMeta}</span>
          </li>
        </ul>
      )}
      {view.tomorrow && <p className="bear-cy-next">{view.tomorrow}</p>}
    </>
  );
}
```

（若 `AsyncState` 实际不在 `core/board/state.js`，用 `skins/contract.ts` 里 import 它的同一路径；报告里说明。）

### 第 3 步：`skins/bear/today-panel.tsx` 在周期内改用周期视图

1. import 区加两行：
   ```tsx
   import { cycleTodayView } from "../../core/board/cycle-today.js";
   import { CycleToday } from "./cycle-today.js";
   ```
2. `TodayPanel` 的参数解构里，在 `agentReady,` 之后加：
   ```tsx
     cycleToday,
     cycleTomorrow,
     courses,
     anki,
     onStudyCourse,
     onVerifyCourse,
   ```
3. 函数体最开头（`const due = …` 之前）插入：
   ```tsx
     const cycleDay = cycleToday.status === "ready" ? cycleToday.value : null;
     const view = cycleDay
       ? cycleTodayView(cycleDay, cycleTomorrow.status === "ready" ? cycleTomorrow.value : null)
       : null;
     if (cycleDay && view) {
       return (
         <section className="bear-today" aria-label={strings.today.title}>
           <CycleToday
             view={view}
             day={cycleDay}
             courses={courses}
             anki={anki}
             agentReady={agentReady}
             onStudyCourse={onStudyCourse}
             onVerifyCourse={onVerifyCourse}
           />
         </section>
       );
     }
   ```
4. 文件顶部注释末尾加一句：`On a study-cycle day the panel shows the cycle view instead (cycle-today.tsx).`

### 第 4 步：`skins/bear/calendar-panel.tsx` 显示日子类型

1. `CalendarPanel` 参数解构里，`courseTitles,` 之后加 `cycleMonth,`。
2. `const days = month.status === "ready" ? month.value.days : {};` 之后加：
   ```tsx
     const cycleDays = cycleMonth.status === "ready" ? cycleMonth.value.days : {};
   ```
3. 在 `cells.map((cell) => {` 里，`if (cell.date === selected) classes.push("is-sel");` 之后加：
   ```tsx
             const slot = cycleDays[cell.date];
             if (slot?.type === "休息") classes.push("is-rest");
   ```
   并在 `<Dots day={days[cell.date]} />` 之后加：
   ```tsx
                 <span className="bear-mcal-type">{slot ? strings.cycle.typeShort[slot.type] : ""}</span>
   ```
4. 在图例 `<div className="bear-mcal-legend">…</div>` 整块之后、`<DayDetail … />` 之前加：
   ```tsx
         {Object.keys(cycleDays).length > 0 && <p className="bear-mcal-cyclegend">{strings.cycle.legend}</p>}
   ```
5. `DayDetail` 增加一个参数 `slotLine: string | null`：
   - 它的参数类型里加 `slotLine: string | null;`，解构里加 `slotLine,`；
   - 在 `<div className="bear-mcal-detail-head">…</div>` 整块之后加：
     ```tsx
           {slotLine && <p className="bear-muted bear-mcal-slot">{slotLine}</p>}
     ```
   - 调用处改为：
     ```tsx
         <DayDetail
           date={selected}
           day={days[selected]}
           courseTitles={courseTitles}
           onEditDay={onEditDay}
           slotLine={cycleDays[selected] ? strings.cycle.slotLine(cycleDays[selected].week, cycleDays[selected].type) : null}
         />
     ```
     （若 `noUncheckedIndexedAccess` 让上面这行报错，先 `const selectedSlot = cycleDays[selected];` 再用 `selectedSlot ? strings.cycle.slotLine(selectedSlot.week, selectedSlot.type) : null`。）

### 第 5 步：`skins/bear/skin.css`

1. 在最上面的 `[data-skin="bear"] { … }` 变量块里，`--danger: #b3261e;` 之后加：
   ```css
     --warn: #c98a12;
     --warn-text: #a86b00;
     --faint: #b8bcc2;
     --hairline: #eceef0;
   ```
2. 在文件**末尾**追加：

```css
/* Study cycle (BE-9c): the 今天 cycle view and the calendar's day types. */
[data-skin="bear"] .bear-cy-head {
  margin: 0 0 0.6em;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-cy-focus {
  padding: 0.7em 0 0.8em;
  border-top: 2px solid var(--accent);
  border-bottom: 1px solid var(--hairline);
}
[data-skin="bear"] .bear-cy-focus.is-rest {
  border-top-color: var(--rule);
}
[data-skin="bear"] .bear-cy-k {
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-cy-title {
  font-weight: 650;
  color: var(--ink);
}
[data-skin="bear"] .bear-cy-carried {
  margin: 0.2em 0 0.3em;
  font-size: 12px;
  color: var(--warn-text);
}
[data-skin="bear"] .bear-cy-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
[data-skin="bear"] .bear-cy-list li {
  display: flex;
  gap: 0.6em;
  align-items: baseline;
  padding: 0.45em 0;
  border-bottom: 1px solid var(--hairline);
}
[data-skin="bear"] .bear-cy-mark {
  width: 1em;
  flex: none;
  text-align: center;
  font-weight: 700;
}
[data-skin="bear"] .bear-cy-text {
  flex: 1;
  min-width: 0;
}
[data-skin="bear"] .bear-cy-meta {
  flex: none;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-cy-list li.is-now .bear-cy-mark {
  color: var(--accent);
}
[data-skin="bear"] .bear-cy-list li.is-warn .bear-cy-mark {
  color: var(--warn);
}
[data-skin="bear"] .bear-cy-list li.is-warn .bear-cy-meta {
  color: var(--warn-text);
}
[data-skin="bear"] .bear-cy-list li.is-plan .bear-cy-mark {
  color: var(--soft);
}
[data-skin="bear"] .bear-cy-next {
  margin: 0.9em 0 0;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-mcal-type {
  min-height: 12px;
  font-size: 10px;
  line-height: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-tabpanels .bear-mcal-day.is-rest,
[data-skin="bear"] .bear-mcal-day.is-rest .bear-mcal-type {
  color: var(--faint);
}
[data-skin="bear"] .bear-mcal-cyclegend {
  margin: 0.3em 0 0;
  font-size: 11px;
  color: var(--soft);
}
[data-skin="bear"] .bear-mcal-slot {
  margin: 0.2em 0 0;
  font-size: 12px;
}
```

### 第 6 步：测试

1. `skins/bear/today-panel.test.tsx`：
   - import 区，`import { SAMPLE_PANELS } from "../../gallery/panel-samples.js";` 改为
     ```tsx
     import { SAMPLE_COURSES, SAMPLE_CYCLE_DAY, SAMPLE_PANELS } from "../../gallery/panel-samples.js";
     ```
   - 在 `describe("Bear 今天 panel", () => {` 块内最后一个 `it(...)` 之后追加：

```tsx
  it("leads a cycle day with the carried lesson, the missed lesson and the Anki row", async () => {
    const onStudyCourse = vi.fn();
    render(<TodayPanel {...baseProps({ cycleToday: { status: "ready", value: SAMPLE_CYCLE_DAY }, onStudyCourse })} />);
    expect(screen.getByText("第 1 周 · 周三 · 深度日")).toBeTruthy();
    expect(screen.getByText("离散 D2")).toBeTruthy();
    expect(screen.getByText(strings.cycle.carried("2026-11-09"))).toBeTruthy();
    expect(screen.getByText(strings.cycle.missed("CTM", "D1"))).toBeTruthy();
    expect(screen.getByText(strings.cycle.anki)).toBeTruthy();
    expect(screen.queryByText(strings.today.todayPlan)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: strings.cycle.start }));
    expect(onStudyCourse).toHaveBeenCalledWith("discrete-math-epp");
  });

  it("lists each cycle course's 本周 count on a 整合 day and opens its 周核实", async () => {
    const onVerifyCourse = vi.fn();
    const friday = {
      ...SAMPLE_CYCLE_DAY,
      date: "2026-11-13",
      weekday: "周五",
      week: 2,
      type: "整合" as const,
      course: null,
      lessons: [],
      overdue: [],
    };
    render(<TodayPanel {...baseProps({ cycleToday: { status: "ready", value: friday }, onVerifyCourse })} />);
    const ctm = SAMPLE_COURSES.find((course) => course.slug === "ctm");
    if (!ctm) throw new Error("sample has no ctm course");
    expect(screen.getByText(strings.cycle.verifyRow("CTM", ctm.week.done, ctm.week.total))).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: strings.cycle.verify }));
    expect(onVerifyCourse).toHaveBeenCalledWith("ctm");
  });

  it("shows only 休息 on a rest day, without the Anki row", () => {
    const sunday = {
      ...SAMPLE_CYCLE_DAY,
      date: "2026-11-15",
      weekday: "周日",
      week: 2,
      type: "休息" as const,
      course: null,
      lessons: [],
      overdue: [],
    };
    render(<TodayPanel {...baseProps({ cycleToday: { status: "ready", value: sunday } })} />);
    expect(screen.getByText(strings.cycle.rest)).toBeTruthy();
    expect(screen.queryByText(strings.cycle.anki)).toBeNull();
  });
```

2. `skins/bear/calendar-panel.test.tsx`：在 `describe(...)` 块内最后一个 `it(...)` 之后追加：

```tsx
  it("labels cycle days with their type and fades rest days", () => {
    render(<CalendarPanel {...baseProps()} />);
    expect(screen.getByRole("button", { name: dayTitle("2026-11-06") }).textContent).toContain(strings.cycle.typeShort.整合);
    expect(screen.getByRole("button", { name: dayTitle("2026-11-08") }).className).toContain("is-rest");
    expect(screen.getByText(strings.cycle.legend)).toBeTruthy();
  });

  it("shows the selected day's week and type under the detail title", () => {
    render(<CalendarPanel {...baseProps({ selected: "2026-11-09" })} />);
    expect(screen.getByText(strings.cycle.slotLine(1, "深度"))).toBeTruthy();
  });
```

### 第 7 步：`docs/desktop/skins/bear.md` 颜色表加四行

在颜色表 `--danger` 那一行之后加：

```
| `--warn` | `#c98a12` | 状态记号 `!`（需注意：没学的课次、顺延） |
| `--warn-text` | `#a86b00` | 「需注意」的小字（对比度 ≥ 4:1） |
| `--faint` | `#b8bcc2` | 很淡的内容：日历里的休息日 |
| `--hairline` | `#eceef0` | 面板列表行之间的分隔线 |
```

并在表格下方加一句：`状态记号（● 现在做 / ! 需注意 / ○ 已排期）只给符号和小字上色，不铺底色；强调色仍只有 --accent。`

## 完成标准（可观察）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && git status --short apps/desktop/src/renderer/skins/bear apps/desktop/src/renderer/core/strings.ts docs/desktop/skins
grep -rn "bear-cy-\|bear-mcal-type\|bear-mcal-cyclegend\|bear-mcal-slot" apps/desktop/src/renderer/skins/bear/skin.css | wc -l
```

- 贴出每条输出的最后 15 行。新增的 5 个测试通过，原有测试全部仍通过。
- 若某个断言与实际行为不符：先不要改测试或代码去迁就，在报告里写出失败的断言、实际值和你判断的原因，停下。

## 结束报告

列出：改了 / 新建了哪些文件；每一步是否照做；偏离清单之处及原因（没有就写「无」）；未完成项。
