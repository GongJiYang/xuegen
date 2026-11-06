# 批次 BE-3：Bear 日历面板（逐步执行清单）

用户已确认的设计稿：`/Users/gjy/pi-learning/design/animate/src/calendar.jsx` + `calendar.css`（`http://localhost:5181/?d=cal`）。本清单把它搬进正式皮肤。

## 规则（上下文被压缩后先重读本文件）
- **只照下面的步骤做，逐字使用给出的代码。** 不要自己设计、不要改写、不要补充步骤里没有的东西。
- 只改这些文件：`apps/desktop/src/renderer/skins/contract.ts`、`core/strings.ts`、`core/board/shell-panels.ts`、`skins/bear/calendar-panel.tsx`、`skins/bear/skin.css`，新建 `skins/bear/calendar-panel.test.tsx`。其他文件一律不动（chicago、bare 不动）。
- 不 commit、不启动 Electron、不读写 `~/.xuegen`、不加依赖、不加 `eslint-disable` / `@ts-ignore`。
- 某一步做不下去（找不到原文、类型报错），**停下并在报告里写清哪一步、原文、报错**。唯一允许的自行修改：不改行为的类型标注小修，每处列出。

工作目录 `/Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/`，下文路径相对它。

---

## 第 1 步：`skins/contract.ts` 给日历加一个可选回调

在 `export interface CalendarPanelProps extends ToolPanelProps {` 里，找到这两行：

```ts
  /** Open the day editor (double click, or the 写笔记 button). */
  onEditDay(date: string): void;
```

在它们**下面**插入：

```ts
  /** Jump to today's month and select today (optional; a skin may omit the button). */
  onToday?(): void;
```

## 第 2 步：`core/board/shell-panels.ts` 提供这个回调

找到：

```ts
      onEditDay: input.onEditDay,
    },
    skills: input.skillsPanel,
```

替换为：

```ts
      onEditDay: input.onEditDay,
      onToday: () => {
        const today = dateKey(new Date());
        calendar.setMonth(today.slice(0, 7));
        calendar.select(today);
      },
    },
    skills: input.skillsPanel,
```

并把文件顶部这一行：

```ts
import { monthGrid, shiftMonth, type useCalendar } from "./use-calendar.js";
```

改为：

```ts
import { dateKey, monthGrid, shiftMonth, type useCalendar } from "./use-calendar.js";
```

（如果这一行的原文不完全一样，停下报告。）

## 第 3 步：`core/strings.ts` 加 Bear 日历用的文案

在 `calendar: {` 分组里，找到这一行：

```ts
    weekday: ["一", "二", "三", "四", "五", "六", "日"],
```

在它**上面**插入：

```ts
    today: "今天",
    monthTitle: (year: number, month: number): string => `${year}年${month}月`,
    legendPlainPlan: "计划",
    legendPlainDone: "已学",
    legendPlainReading: "阅读",
    legendPlainNote: "笔记",
    kindDone: "已学",
    recordLine: (heading: string): string => `学习记录 ${heading}`,
    dayEmptyHint: "这天没有安排。双击日期或点「写笔记」记一笔。",
```

## 第 4 步：`skins/bear/calendar-panel.tsx` 整个文件替换为

```tsx
/**
 * Bear 日历 panel.
 *
 * A Monday-first month grid in the drawer: today's number in the accent, the
 * selected day as a filled circle, small dots for what a day holds (plan /
 * learned / reading due / note). Below, the selected day's detail with 写笔记.
 * Double-clicking a day opens the day editor, as in Chicago.
 */

import type { CalendarDay } from "@shared/data-protocol.js";
import type { CalendarPanelProps } from "../contract.js";
import { dateKey } from "../../core/board/use-calendar.js";
import { dayTitle } from "../../core/format.js";
import { strings } from "../../core/strings.js";
import { Rich } from "./rich.js";

function hasContent(day: CalendarDay | undefined): day is CalendarDay {
  return (
    day !== undefined &&
    (day.plans.length > 0 || day.records.length > 0 || day.readingDue.length > 0 || day.log.length > 0 || !!day.note)
  );
}

function Dots({ day }: { day: CalendarDay | undefined }) {
  return (
    <span className="bear-mcal-dots" aria-hidden="true">
      {day && day.plans.length > 0 && <i className="bear-mcal-dot is-plan" />}
      {day && day.records.length > 0 && <i className="bear-mcal-dot is-done" />}
      {day && day.readingDue.length > 0 && <i className="bear-mcal-dot is-read" />}
      {day && day.note && <i className="bear-mcal-dot is-note" />}
    </span>
  );
}

function DayDetail({
  date,
  day,
  courseTitles,
  onEditDay,
}: {
  date: string;
  day: CalendarDay | undefined;
  courseTitles: Record<string, string>;
  onEditDay(date: string): void;
}) {
  const titleOf = (slug: string): string => courseTitles[slug] ?? slug;
  return (
    <div className="bear-mcal-detail">
      <div className="bear-mcal-detail-head">
        <span className="bear-mcal-detail-title">{dayTitle(date)}</span>
        <button type="button" className="bear-link bear-link-accent" onClick={() => onEditDay(date)}>
          {day?.note ? strings.calendar.editNote : strings.calendar.writeNote}
        </button>
      </div>
      {!hasContent(day) ? (
        <p className="bear-muted">{strings.calendar.dayEmptyHint}</p>
      ) : (
        <>
          {day.note && <p className="bear-mcal-note">{day.note}</p>}
          {day.plans.length > 0 && (
            <section>
              <h4>{strings.calendar.kindPlan}</h4>
              <ul className="bear-mcal-list">
                {day.plans.map((plan, index) => (
                  <li key={index}>
                    <span className="bear-plan-course">{titleOf(plan.course)}</span>
                    <span>
                      <Rich text={plan.label} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {day.records.length > 0 && (
            <section>
              <h4>{strings.calendar.kindDone}</h4>
              <ul className="bear-mcal-list">
                {day.records.map((record, index) => (
                  <li key={index}>
                    <span className="bear-plan-course">{titleOf(record.course)}</span>
                    <span>{strings.calendar.recordLine(record.heading)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {day.readingDue.length > 0 && (
            <section>
              <h4>{strings.calendar.kindReading}</h4>
              <ul className="bear-mcal-list">
                {day.readingDue.map((reading) => (
                  <li key={reading.slug}>
                    <span>{reading.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {day.log.length > 0 && (
            <section>
              <h4>{strings.calendar.kindLog}</h4>
              <ul className="bear-mcal-list">
                {day.log.map((line, index) => (
                  <li key={index}>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function CalendarPanel({
  month,
  monthKey,
  onPrevMonth,
  onNextMonth,
  cells,
  selected,
  onSelectDay,
  onEditDay,
  onToday,
  courseTitles,
}: CalendarPanelProps) {
  const today = dateKey(new Date());
  const days = month.status === "ready" ? month.value.days : {};
  const [year, monthNumber] = monthKey.split("-").map(Number);
  return (
    <section className="bear-mcal" aria-label={strings.calendar.title}>
      <div className="bear-mcal-head">
        <span className="bear-mcal-month">{strings.calendar.monthTitle(year ?? 0, monthNumber ?? 0)}</span>
        <span className="bear-mcal-nav">
          <button type="button" className="bear-link" aria-label={strings.calendar.prevMonth} onClick={onPrevMonth}>
            ‹
          </button>
          {onToday && (
            <button type="button" className="bear-link" onClick={onToday}>
              {strings.calendar.today}
            </button>
          )}
          <button type="button" className="bear-link" aria-label={strings.calendar.nextMonth} onClick={onNextMonth}>
            ›
          </button>
        </span>
      </div>
      {month.status === "error" && <p role="alert">{month.message}</p>}
      <div className="bear-mcal-grid">
        {strings.calendar.weekday.map((label) => (
          <span key={label} className="bear-mcal-wd">
            {label}
          </span>
        ))}
        {cells.map((cell) => {
          const classes = ["bear-mcal-day"];
          if (cell.out) classes.push("is-out");
          if (cell.date === today) classes.push("is-today");
          if (cell.date === selected) classes.push("is-sel");
          return (
            <button
              key={cell.date}
              type="button"
              className={classes.join(" ")}
              aria-label={dayTitle(cell.date)}
              aria-pressed={cell.date === selected}
              onClick={() => onSelectDay(cell.date)}
              onDoubleClick={() => onEditDay(cell.date)}
            >
              <span className="bear-mcal-num">{cell.day}</span>
              <Dots day={days[cell.date]} />
            </button>
          );
        })}
      </div>
      <div className="bear-mcal-legend">
        <span>
          <i className="bear-mcal-dot is-plan" />
          {strings.calendar.legendPlainPlan}
        </span>
        <span>
          <i className="bear-mcal-dot is-done" />
          {strings.calendar.legendPlainDone}
        </span>
        <span>
          <i className="bear-mcal-dot is-read" />
          {strings.calendar.legendPlainReading}
        </span>
        <span>
          <i className="bear-mcal-dot is-note" />
          {strings.calendar.legendPlainNote}
        </span>
      </div>
      <DayDetail date={selected} day={days[selected]} courseTitles={courseTitles} onEditDay={onEditDay} />
    </section>
  );
}
```

## 第 5 步：`skins/bear/skin.css` 末尾追加（原样粘贴）

```css
/* ── 日历 (BE-3) ───────────────────────────────────────────────────────── */

[data-skin="bear"] .bear-mcal-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.9em;
}
[data-skin="bear"] .bear-mcal-month {
  font-size: 15px;
  font-weight: 650;
  color: var(--ink);
}
[data-skin="bear"] .bear-mcal-nav {
  display: flex;
  gap: 0.9em;
  font-size: 13px;
}
[data-skin="bear"] .bear-mcal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  row-gap: 2px;
}
[data-skin="bear"] .bear-mcal-wd {
  padding-bottom: 0.4em;
  text-align: center;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-tabpanels .bear-mcal-day {
  height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 3px;
  padding: 6px 0 0;
  border-radius: 4px;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  transition: background 120ms ease-out;
}
[data-skin="bear"] .bear-tabpanels .bear-mcal-day:hover {
  background: var(--code-bg);
  color: var(--ink);
}
[data-skin="bear"] .bear-tabpanels .bear-mcal-day.is-out {
  color: #c4c8cc;
}
[data-skin="bear"] .bear-mcal-num {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 13px;
  transition: background 120ms ease-out, color 120ms ease-out;
}
[data-skin="bear"] .bear-mcal-day.is-today .bear-mcal-num {
  color: var(--accent);
  font-weight: 650;
}
[data-skin="bear"] .bear-mcal-day.is-sel .bear-mcal-num {
  background: var(--ink);
  color: var(--paper);
}
[data-skin="bear"] .bear-mcal-day.is-sel.is-today .bear-mcal-num {
  background: var(--accent);
  color: #fff;
}
[data-skin="bear"] .bear-mcal-dots {
  display: flex;
  gap: 3px;
  height: 4px;
}
[data-skin="bear"] .bear-mcal-dot {
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
}
[data-skin="bear"] .bear-mcal-dot.is-plan {
  background: var(--ink);
}
[data-skin="bear"] .bear-mcal-dot.is-done {
  background: var(--accent);
}
[data-skin="bear"] .bear-mcal-dot.is-read {
  box-shadow: inset 0 0 0 1px var(--soft);
}
[data-skin="bear"] .bear-mcal-dot.is-note {
  background: var(--soft);
}
[data-skin="bear"] .bear-mcal-legend {
  display: flex;
  gap: 1.1em;
  margin-top: 0.6em;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-mcal-legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}
[data-skin="bear"] .bear-mcal-detail {
  margin-top: 1.2em;
  padding-top: 0.9em;
  border-top: 1px solid #eceef0;
}
[data-skin="bear"] .bear-mcal-detail-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
[data-skin="bear"] .bear-mcal-detail-title {
  font-weight: 650;
  color: var(--ink);
}
[data-skin="bear"] .bear-mcal-detail section {
  margin-top: 0.9em;
}
[data-skin="bear"] .bear-tabpanels .bear-mcal-detail h4 {
  margin: 0 0 0.3em;
  font-size: 12px;
  font-weight: 500;
  color: var(--soft);
}
[data-skin="bear"] .bear-tabpanels .bear-mcal-list li {
  display: flex;
  flex-direction: column;
  padding: 0.35em 0;
  border-bottom: none;
}
[data-skin="bear"] .bear-tabpanels .bear-mcal-note {
  margin: 0.7em 0 0;
  padding-left: 0.9em;
  border-left: 2px solid var(--rule);
  color: var(--ink);
}
```

## 第 6 步：新建 `skins/bear/calendar-panel.test.tsx`

参照同目录 `today-panel.test.tsx` 的 import 方式。基础 props 用 `gallery/panel-samples.ts` 的 `SAMPLE_PANELS.calendar`，再加 `tool: "calendar"`。用例名称照抄：

1. `"shows the month title and seven weekday labels"`：能找到 `strings.calendar.monthTitle(年, 月)`（年、月取自 `SAMPLE_PANELS.calendar.monthKey`）；`strings.calendar.weekday` 的 7 个字都能找到。
2. `"selects a day on click and opens the editor on double click"`：取 `cells` 里第一个 `out: false` 的格子，用 `getByRole("button", { name: dayTitle(cell.date) })` 找到它；单击后 `onSelectDay` 收到 `cell.date`；双击后 `onEditDay` 收到 `cell.date`。（`dayTitle` 从 `../../core/format.js` import。）
3. `"shows the empty hint for a day with nothing"`：`month: { status: "ready", value: { month: monthKey, days: {} } }`、`selected` 取第一个 `out: false` 格子的日期，能找到 `strings.calendar.dayEmptyHint`。
4. `"lists a day's plan with the course title"`：`days` 里给选中日期一条 `{ records: [], plans: [{ course: "py", label: "`@` 只是缩写" }], readingDue: [], log: [], note: null }`，`courseTitles: { py: "Python 装饰器入门" }`；能找到 `"Python 装饰器入门"`，并且 `container.querySelector(".bear-mcal-detail code")?.textContent` 是 `"@"`。
5. `"hides the 今天 button when onToday is not given and calls it when given"`：不传 `onToday` 时找不到名为 `strings.calendar.today` 的按钮；传一个 `vi.fn()` 时点它被调用一次。

## 第 7 步：验收（必须自己跑，贴最后几行）

`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。

## 结束报告
第 1–6 步各自是否照做；任何偏离（含类型小修）列原文与改后；所有命令结果。

## 执行记录（2026-11-05）
Devin 照清单执行，零偏离；测试副本真实 Electron 截图与设计稿一致；用户正式窗口已重载到新版。
