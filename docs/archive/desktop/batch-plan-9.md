# 批次 PL-9：Bear 界面显示「主项 + 辅助」（日历、今天、总进度）

设计稿（用户已批准）：`/Users/gjy/pi-learning/design/animate/src/plan.jsx`（`?d=plan`：总进度的「辅助」区、日历每格第二行、详情里的辅助课）与 `?d=today-aux`（今天：主项下面一行辅助）。
数据已在 PL-8 做好：`CycleDay.aux/auxCourse/roles`、`CycleMonth.roles`、`CycleSlot.aux/auxCourse`、`CycleOverview.cycle.subjects/auxSubjects`、`CycleCourseProgress.role`、`plan-view.ts` 的 `cellAuxTag`、`dayLessons(...).aux`、`CycleTodayView.aux`。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**，代码照抄；不要重新设计。做不通时停下报告。
- 只准改：`renderer/core/strings.ts`、`renderer/core/board/cycle-today.ts`、`cycle-today.test.ts`、`renderer/core/board/plan-view.ts`、`plan-view.test.ts`、`renderer/skins/bear/cycle-today.tsx`、`renderer/skins/bear/calendar-panel.tsx`、`calendar-panel.test.tsx`、`renderer/skins/bear/progress-groups.tsx`、`renderer/skins/bear/progress-panel.tsx`、`progress-panel.test.tsx`、`renderer/skins/bear/skin.css`、`renderer/gallery/panel-samples.ts`。
- 皮肤里不写中文文案。不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。

以下路径都相对 `apps/desktop/src/`。

## 第 1 步：`renderer/core/strings.ts`

1. `cycle: {` 块里：`tomorrow: …` 整项替换为：

```ts
    tomorrow: (weekday: string, type: CycleDayType, lesson: string | null, aux: string | null = null): string =>
      `明天：${weekday} · ${CYCLE_DAY_TYPE[type]}${lesson ? ` · ${lesson}` : ""}${aux ? ` + 辅助 ${aux}` : ""}`,
    auxTag: "辅助",
```

2. `plan: {` 块里 `legend: …` 下面加：

```ts
    legendAux: "上行主项 · 下行辅助　整合 = 周核实　Anki = 低强度　空白 = 休息",
    auxTitle: "辅助",
    auxNote: "只做了解 · 不考核 · 每次 ≤ 45 分钟",
    auxProgress: (done: number, total: number): string => `${done} / ${total} 节`,
```

## 第 2 步：`renderer/core/board/cycle-today.ts`

`tomorrowLine` 整个替换为：

```ts
/** 「明天：周六 · 低强度日」 (plus the main lesson and 「+ 辅助 X」), or null outside every cycle. */
export function tomorrowLine(day: CycleDay): string | null {
  if (day.type === null) return null;
  const lesson = day.lessons.find((item) => day.roles[item.course] !== "aux");
  const auxLesson = day.lessons.find((item) => day.roles[item.course] === "aux");
  const aux = auxLesson ? cycleName(day, auxLesson.course) : day.aux ? (day.subjects[day.aux] ?? day.aux) : null;
  return strings.cycle.tomorrow(day.weekday, day.type, lesson ? `${cycleName(day, lesson.course)} ${lesson.id}` : null, aux);
}
```

`cycle-today.test.ts` 追加：明天是周二、`aux: "ds"`、`subjects: { ds: "数据结构" }`、`lessons` 只有一条 ctm D1（`roles.ctm = "main"`）时，`tomorrowLine` 返回 `明天：周二 · 深度日 · CTM D1 + 辅助 数据结构`（`names.ctm = "CTM"`）。

## 第 3 步：`renderer/core/board/plan-view.ts`

文件末尾追加：

```ts
export interface AuxRow {
  subject: string;
  /** The subject's short name from the weekly template. */
  subjectName: string;
  /** Its course this cycle, or null when none is scheduled yet. */
  course: { slug: string; name: string; done: number; total: number } | null;
}

/** One row per auxiliary subject of the current cycle, with its course if any. */
export function auxRows(overview: CycleOverview): AuxRow[] {
  const cycle = overview.cycle;
  if (!cycle) return [];
  return cycle.auxSubjects.map((subject) => {
    const course = overview.courses.find((item) => item.role === "aux" && item.subject === subject) ?? null;
    return {
      subject,
      subjectName: cycle.subjects[subject] ?? subject,
      course: course ? { slug: course.slug, name: course.name, done: course.done, total: course.total } : null,
    };
  });
}

/** Whether the month has any auxiliary day (the legend then explains the second line). */
export function hasAux(month: CycleMonth | null): boolean {
  return month ? Object.values(month.days).some((slot) => slot.aux !== null) : false;
}
```

`plan-view.test.ts` 追加：

```ts
describe("auxRows and hasAux", () => {
  it("lists aux subjects with their course, or none", () => {
    const withAux: CycleOverview = {
      ...OVERVIEW,
      cycle: { ...OVERVIEW.cycle!, subjects: { ...OVERVIEW.cycle!.subjects, c: "C", ds: "数据结构" }, auxSubjects: ["c", "ds"] },
      courses: [...OVERVIEW.courses, { slug: "effc", subject: "c", role: "aux" as const, name: "Effective C", total: 7, done: 1, end: "2026-12-23", next: null }],
    };
    expect(auxRows(withAux)).toEqual([
      { subject: "c", subjectName: "C", course: { slug: "effc", name: "Effective C", done: 1, total: 7 } },
      { subject: "ds", subjectName: "数据结构", course: null },
    ]);
    expect(auxRows(OVERVIEW)).toEqual([]);
    expect(auxRows({ ...OVERVIEW, cycle: null })).toEqual([]);
  });
  it("hasAux", () => {
    expect(hasAux(MONTH)).toBe(false);
    expect(hasAux({ ...MONTH, days: { "2026-12-21": { cycle: "C1", week: 7, type: "深度", subject: "x", course: null, aux: "c", auxCourse: null } } })).toBe(true);
    expect(hasAux(null)).toBe(false);
  });
});
```

（import 里加 `auxRows`、`hasAux`。）

## 第 4 步：Bear 今天 `renderer/skins/bear/cycle-today.tsx`

在 `CycleToday` 的 `<Focus … />` **后面**、`{view.missed.length > 0 && (` 前面插入：

```tsx
      {view.aux && (
        <ul className="bear-cy-list">
          <li className="is-aux">
            <span className="bear-cy-auxtag">{strings.cycle.auxTag}</span>
            <span className="bear-cy-text">
              <b>
                {view.aux.name} {view.aux.lesson.id}
              </b>{" "}
              <Rich text={view.aux.lesson.content} />
            </span>
            <button
              type="button"
              className="bear-link bear-link-accent"
              disabled={!agentReady}
              onClick={() => onStudyCourse(view.aux!.lesson.course)}
            >
              {strings.cycle.start}
            </button>
          </li>
        </ul>
      )}
```

（若 lint 不允许 `!`，先 `const aux = view.aux;` 再用 `aux`。）

## 第 5 步：Bear 日历 `renderer/skins/bear/calendar-panel.tsx`

1. import `plan-view.js` 那行加 `cellAuxTag, hasAux`。
2. 格子循环里 `const flag = …` 下面加 `const auxTag = cell.out ? "" : cellAuxTag(cycle, cell.date);`；按钮内容里 `bear-mcal-tag` 那一行（`{slot || tag ? <span className="bear-mcal-tag">{tag}</span> : <Dots … />}`）**下面**加 `{auxTag && <span className="bear-mcal-aux">{auxTag}</span>}`。
3. 图例：`<p className="bear-mcal-cyclegend">{strings.plan.legend(legendNames(cycle))}</p>` 改为 `<p className="bear-mcal-cyclegend">{hasAux(cycle) ? strings.plan.legendAux : strings.plan.legend(legendNames(cycle))}</p>`。
4. `DayDetail` 的 lessons 列表：`lessons` 的类型加 `aux: boolean`；每个 `<li>` 里把

```tsx
                <b>
                  {lesson.name} {lesson.id}
                </b>{" "}
                <Rich text={lesson.content} />
                <small> · {strings.cycle.minutes}</small>
```

   改为

```tsx
                {lesson.aux && <span className="bear-cy-auxtag">{strings.cycle.auxTag}</span>}{" "}
                <b>
                  {lesson.name} {lesson.id}
                </b>{" "}
                <Rich text={lesson.content} />
                {!lesson.aux && <small> · {strings.cycle.minutes}</small>}
```

## 第 6 步：Bear 总进度

### `renderer/skins/bear/progress-groups.tsx`

1. import 加 `import type { AuxRow } from "../../core/board/plan-view.js";`
2. `GroupedProgress` 参数加：

```tsx
  /** The cycle's auxiliary subjects (compact mode): shown as their own block instead of the 辅助位空着 line. */
  aux?: AuxRow[];
```

   （类型和解构都加，解构写 `aux = [],`。）
3. compact 分支里 `{cycle && ( <p className="bear-plan-aux"> … </p> )}` 整段替换为：

```tsx
          {aux.length > 0 ? (
            <div className="bear-plan-auxsec">
              <div className="bear-plan-auxhead">
                <span>{strings.plan.auxTitle}</span>
                <span className="bear-pg-meta">{strings.plan.auxNote}</span>
              </div>
              {aux.map((row) => (
                <div key={row.subject} className="bear-plan-auxrow">
                  <span className={row.course ? "bear-pg-mark is-now" : "bear-pg-mark"}>
                    {row.course ? MARKS.now : MARKS.none}
                  </span>
                  <span className="bear-pg-title">
                    {row.subjectName}
                    {row.course && (
                      <>
                        {" · "}
                        <b>{row.course.name}</b>
                      </>
                    )}
                  </span>
                  {row.course ? (
                    <span className="bear-pg-meta">{strings.plan.auxProgress(row.course.done, row.course.total)}</span>
                  ) : (
                    onPlanMaterial && (
                      <button type="button" className="bear-link bear-link-accent" onClick={() => onPlanMaterial(row.subjectName)}>
                        {strings.plan.planMaterial}
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          ) : (
            cycle && (
              <p className="bear-plan-aux">
                <span className="bear-pg-mark">{groups.auxEmpty ? MARKS.none : MARKS.plan}</span>
                <span>{groups.auxEmpty ? strings.plan.auxEmpty : groups.aux}</span>
                {groups.auxEmpty && auxPlanned && <span className="bear-pg-meta">{auxPlanned}</span>}
              </p>
            )
          )}
```

4. 「路线外」：compact 且有 `aux` 时，辅助科目不再出现在路线外。在 `const otherCount = …` **上面**加：

```tsx
  const auxSlugs = new Set(aux.map((row) => row.subject));
  const other = compact ? groups.other.filter((group) => !auxSlugs.has(group.slug)) : groups.other;
```

   然后把本函数里所有 `groups.other` 改为 `other`（`otherCount`、`otherWarn`、路线外 Section 的条件与 map）。

### `renderer/skins/bear/progress-panel.tsx`

1. import `plan-view.js` 那行加 `auxRows`。
2. `const cards = …` 下面加 `const aux = ready ? auxRows(ready) : [];`
3. `<GroupedProgress` 加属性 `aux={aux}`。

### `renderer/skins/bear/skin.css` 末尾追加

```css
/* 主项 + 辅助 (design ?d=plan third version). */
[data-skin="bear"] .bear-tabpanels .bear-mcal-day {
  height: 60px;
}
[data-skin="bear"] .bear-mcal-aux {
  font-size: 10px;
  line-height: 1.2;
  color: var(--soft);
  white-space: nowrap;
}
[data-skin="bear"] .bear-cy-auxtag {
  display: inline-block;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--hairline);
  color: var(--soft);
  font-size: 10.5px;
  line-height: 1.5;
}
[data-skin="bear"] .bear-cy-list li.is-aux b {
  font-weight: 500;
}
[data-skin="bear"] .bear-plan-auxsec {
  margin-top: 18px;
  padding-top: 10px;
  border-top: 1px dashed var(--hairline);
}
[data-skin="bear"] .bear-plan-auxhead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-plan-auxrow {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 5px 0 0;
  font-size: 13px;
  color: var(--soft);
}
[data-skin="bear"] .bear-plan-auxrow b {
  font-weight: 500;
  color: var(--ink);
}
```

## 第 7 步：样例与测试

1. `renderer/gallery/panel-samples.ts`：
   - `SAMPLE_OVERVIEW.cycle.subjects` 加 `"c-systems-programming": "C", "data-structures": "数据结构"`，`auxSubjects` 改为 `["c-systems-programming", "data-structures"]`；`SAMPLE_OVERVIEW.courses` 末尾加 `{ slug: "effective-c", subject: "c-systems-programming", role: "aux", name: "Effective C", total: 7, done: 0, end: "2026-12-23", next: { id: "D1", date: "2026-11-09", content: "Ch1 起步" } },`。
   - `SAMPLE_CYCLE_MONTH`：`2026-11-09` 与 `2026-11-11` 两天的 slot 改 `aux: "c-systems-programming"`（`auxCourse` 2026-11-09 为 `"effective-c"`，11-11 为 `null`），`2026-11-10` 与 `2026-11-12` 改 `aux: "data-structures"`；`subjects` 加 `"c-systems-programming": "C", "data-structures": "数据结构"`；`names` 加 `"effective-c": "Effective C"`；`roles` 加 `"effective-c": "aux"`；`lessons["2026-11-09"]` 末尾加 `{ course: "effective-c", id: "D1", content: "Ch1 起步" }`。
2. `skins/bear/calendar-panel.test.tsx` 追加：

```tsx
  it("shows the aux line in cells and an aux lesson in the detail", () => {
    render(<CalendarPanel {...baseProps({ selected: "2026-11-09" })} />);
    expect(screen.getByRole("button", { name: dayTitle("2026-11-09") }).textContent).toContain("Effective C");
    expect(screen.getByRole("button", { name: dayTitle("2026-11-10") }).textContent).toContain("数据结构");
    expect(screen.getByText("Effective C D1")).toBeTruthy();
    expect(screen.getByText(strings.plan.legendAux, { normalizer: (text) => text })).toBeTruthy();
  });
```

   已有的「writes the lesson's course …」测试里断言 `strings.plan.legend([...])` 的那一行，改为断言 `strings.plan.legendAux`（同样带 `{ normalizer: (text) => text }`）。
3. `skins/bear/progress-panel.test.tsx` 的 `with the cycle overview …` 测试里，`expect(screen.getByText(strings.plan.auxEmpty)).toBeTruthy();` 改为：

```tsx
    expect(screen.getByText(strings.plan.auxNote)).toBeTruthy();
    expect(screen.getByText("Effective C")).toBeTruthy();
    expect(screen.getByText(strings.plan.auxProgress(0, 7))).toBeTruthy();
```

4. 跑测试；其他测试因样例变化失败的（例如日历格子文字、今天面板），按新样例更新期望，在报告里逐个列出。

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && git status --short
wc -l apps/desktop/src/renderer/skins/bear/progress-groups.tsx apps/desktop/src/renderer/skins/bear/calendar-panel.tsx
```

## 结束报告

改了哪些文件；每一步是否照做；偏离之处与原因；改了哪些测试期望及原因；未完成项。
