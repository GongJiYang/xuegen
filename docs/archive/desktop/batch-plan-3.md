# 批次 PL-3：总进度第二版（只留预计结束、12 周期 × 7 周进度条、课程按科目分组、资料可排课）

设计稿（用户已批准第二版）：`/Users/gjy/pi-learning/design/animate/src/plan.jsx` + `plan.css`（`http://localhost:5181/?d=plan`）。PL-1/PL-2 已完成（任务单在 `docs/archive/desktop/batch-plan-1.md`、`batch-plan-2.md`，可参考）。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**，代码照抄；不要重新设计、改名或「顺手优化」。做不通时停下，在报告里写清卡在哪。
- 只准改：`renderer/core/board/plan-view.ts`、`renderer/core/board/plan-view.test.ts`、`renderer/core/strings.ts`、`renderer/skins/bear/plan-top.tsx`、`renderer/skins/bear/progress-groups.tsx`、`renderer/skins/bear/progress-panel.tsx`、`renderer/skins/bear/progress-panel.test.tsx`、`renderer/skins/bear/skin.css`。
- 皮肤里不写中文文案。不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。

以下路径都相对 `apps/desktop/src/`。

---

## 第 1 步：`renderer/core/board/plan-view.ts`

1. 在 `export type SegmentState = …` 下面加：

```ts
/** One week cell of a cycle segment: passed, this week, still ahead in this cycle, or a later cycle. */
export type WeekState = "done" | "now" | "left" | "plan";
```

2. `RouteView` 里 `segments` 的类型改为：

```ts
  /** One per cycle, labelled 「C1」; `weeks` has 7 cells; `restAfter` when a recovery week follows it. */
  segments: { id: string; label: string; state: SegmentState; restAfter: boolean; weeks: WeekState[] }[];
```

3. 在 `function isNow(…)` 下面加：

```ts
function weekStates(state: SegmentState, start: string, today: string): WeekState[] {
  if (state === "done") return Array.from({ length: 7 }, () => "done");
  if (state === "plan") return Array.from({ length: 7 }, () => "plan");
  const current = Math.min(7, Math.floor(daysBetween(start, today) / 7) + 1);
  return Array.from({ length: 7 }, (_, index) => (index + 1 < current ? "done" : index + 1 === current ? "now" : "left"));
}
```

4. `routeView` 里 `segments: route.cycles.map((cycle) => ({ … }))` 整段替换为：

```ts
    segments: route.cycles.map((cycle) => {
      const state: SegmentState =
        cycle.status === "完成" || cycle.end < today ? "done" : isNow(cycle.start, cycle.end, today) ? "now" : "plan";
      return {
        id: cycle.id,
        label: cycle.id,
        state,
        restAfter: route.recovery.some((rest) => daysBetween(cycle.end, rest.start) === 1),
        weeks: weekStates(state, cycle.start, today),
      };
    }),
```

## 第 2 步：`renderer/core/board/plan-view.test.ts`

1. `routeView` 的第一个测试里 `expect(view?.segments).toEqual([ … ]);` 整段替换为：

```ts
    const plan = ["plan", "plan", "plan", "plan", "plan", "plan", "plan"];
    expect(view?.segments).toEqual([
      { id: "C1", label: "C1", state: "now", restAfter: false, weeks: ["now", "left", "left", "left", "left", "left", "left"] },
      { id: "C2", label: "C2", state: "plan", restAfter: true, weeks: plan },
      { id: "C3", label: "C3", state: "plan", restAfter: false, weeks: plan },
    ]);
    expect(routeView(OVERVIEW, "2026-11-20")?.segments[0]?.weeks).toEqual(["done", "done", "now", "left", "left", "left", "left"]);
```

2. 第二个测试里 `expect(routeView(done, "2026-12-26")?.segments.map((s) => s.state)).toEqual(["done", "now", "plan"]);` 下面加：

```ts
    expect(routeView(done, "2026-12-26")?.segments[0]?.weeks).toEqual(["done", "done", "done", "done", "done", "done", "done"]);
    expect(routeView(OVERVIEW, "2026-12-26")?.segments[0]?.state).toBe("done");
```

## 第 3 步：`renderer/core/strings.ts`

`plan: {` 块里 `sectionDone: "已学完",` 下面加一行：

```ts
    planMaterial: "排课",
```

## 第 4 步：`renderer/skins/bear/plan-top.tsx`

`RouteCard` 的 return 里：

1. 删掉 `<div className="bear-plan-label">{strings.plan.routeLabel}</div>` 这一行。
2. 删掉 `<p className="bear-plan-sub">{view.sub}</p>` 这一行。
3. 把 strip 按钮里每个 segment 的内容

```tsx
            <i />
            <em>{segment.label}</em>
```

替换为

```tsx
            <span className="bear-plan-weeks">
              {segment.weeks.map((week, index) => (
                <i key={index} className={`is-${week}`} />
              ))}
            </span>
            <em>{segment.label}</em>
```

4. 文件头注释第一行改为：`Bear 总进度 top (design \`?d=plan\`): the expected end date and the 12 cycles as 7 week cells each, then the current cycle's dates and days left.`

## 第 5 步：`renderer/skins/bear/progress-groups.tsx`

1. `Materials` 组件：参数改为 `{ group, onPlan }: { group: SubjectGroup; onPlan?: (title: string) => void }`。列表项里 `<span className="bear-pg-meta">{strings.progress.materialNote(item.role, item.status)}</span>` 下面加：

```tsx
                    {onPlan && item.mark === "none" && (
                      <button type="button" className="bear-link bear-link-accent" onClick={() => onPlan(item.title)}>
                        {strings.plan.planMaterial}
                      </button>
                    )}
```

2. `Subject` 组件：参数加 `onPlan?: (title: string) => void`（类型和解构都加），`<Materials group={group} />` 改为 `<Materials group={group} onPlan={onPlan} />`。

3. `GroupedProgress`：参数加

```tsx
  /** Open the new-course form for an unplanned material (compact mode only). */
  onPlanMaterial?: (title: string) => void;
```

（类型和解构都加，解构写 `onPlanMaterial,`）。compact 分支里

```tsx
            <Subject key={group.slug} group={group} renderCourse={renderCourse} hideName />
```

改为

```tsx
            <Subject key={group.slug} group={group} renderCourse={renderCourse} onPlan={onPlanMaterial} />
```

（即 compact 下也显示科目名；`hideName` 参数保留不删。）

## 第 6 步：`renderer/skins/bear/progress-panel.tsx`

1. `NewCourseForm`：参数加 `initialTitle?: string;`（类型和解构都加）。`const [title, setTitle] = useState("");` 改为 `const [title, setTitle] = useState(initialTitle ?? "");`，`const [material, setMaterial] = useState("");` 改为 `const [material, setMaterial] = useState(initialTitle ?? "");`。

2. `ProgressPanel` 里 `const [creating, setCreating] = useState(false);` 下面加：

```tsx
  const [draft, setDraft] = useState<string | null>(null);
```

3. `const form = creating && ( <NewCourseForm … /> );` 改为：

```tsx
  const form = creating && (
    <NewCourseForm
      key={draft ?? ""}
      initialTitle={draft ?? undefined}
      sources={sources}
      onSubmit={(request) => {
        onNewCourse(request);
        setCreating(false);
        setDraft(null);
      }}
      onCancel={() => {
        setCreating(false);
        setDraft(null);
      }}
    />
  );
```

4. `newCourseButton` 的 `onClick` 改为 `onClick={() => { setDraft(null); setCreating((value) => !value); }}`。

5. `<section className="bear-progress" …>` 改为 `<section className={cycleTop ? "bear-progress is-plan" : "bear-progress"} aria-label={strings.tools.progress}>`。

6. `<GroupedProgress` 加属性：

```tsx
              onPlanMaterial={(title) => {
                setDraft(title);
                setCreating(true);
              }}
```

## 第 7 步：`renderer/skins/bear/skin.css`

1. 删除这几条规则（PL-2 加的单格进度条，已被周格替代）：`.bear-plan-seg i`、`.bear-plan-seg.is-now i`、`.bear-plan-seg.is-done i`。
2. `.bear-tabpanels .bear-plan-strip` 规则整条替换为：

```css
[data-skin="bear"] .bear-tabpanels .bear-plan-strip {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  column-gap: 6px;
  row-gap: 8px;
  width: 100%;
  margin-top: 12px;
  padding: 0;
}
```

3. `.bear-plan-seg` 规则里 `align-items: center;` 改为 `align-items: stretch;`；`.bear-plan-seg.has-rest` 规则整条删除；`.bear-plan-seg em` 规则里加 `text-align: left;`。
4. `.bear-plan-route` 规则里 `padding-bottom: 18px;` 不变。文件末尾追加：

```css
/* 总进度 second version: 12 cycles × 7 week cells, subjects shown. */
[data-skin="bear"] .bear-plan-weeks {
  display: flex;
  gap: 1px;
}
[data-skin="bear"] .bear-plan-weeks i {
  flex: 1;
  height: 10px;
  background: var(--hairline);
}
[data-skin="bear"] .bear-plan-weeks i:first-child {
  border-radius: 2px 0 0 2px;
}
[data-skin="bear"] .bear-plan-weeks i:last-child {
  border-radius: 0 2px 2px 0;
}
[data-skin="bear"] .bear-plan-weeks i.is-done {
  background: var(--done);
}
[data-skin="bear"] .bear-plan-weeks i.is-now {
  background: var(--accent);
}
[data-skin="bear"] .bear-plan-weeks i.is-left {
  background: #d6ecfb;
}
[data-skin="bear"] .bear-progress.is-plan .bear-pg-subject {
  margin-top: 16px;
}
[data-skin="bear"] .bear-progress.is-plan .bear-course.is-card {
  margin-top: 6px;
}
[data-skin="bear"] .bear-progress.is-plan .bear-course:not(.is-card) {
  padding: 6px 0 0 2px;
  border-bottom: none;
}
[data-skin="bear"] .bear-progress.is-plan .bear-course:not(.is-card) .bear-meter {
  display: none;
}
[data-skin="bear"] .bear-progress.is-plan .bear-pg-mats-toggle {
  margin-left: 2px;
}
[data-skin="bear"] .bear-progress.is-plan .bear-pg-mats-group {
  margin-left: 2px;
}
```

## 第 8 步：`renderer/skins/bear/progress-panel.test.tsx`

`with the cycle overview …` 这个测试里，`expect(screen.getByText(strings.plan.auxEmpty)).toBeTruthy();` 下面加：

```tsx
    expect(screen.getByText("编程语言与编程范式")).toBeTruthy();
    expect(screen.getByText("C1", { selector: "em" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: `▸ ${strings.progress.materials(3, 2)}` }));
    await user.click(screen.getAllByRole("button", { name: strings.plan.planMaterial })[0]!);
    expect((screen.getByLabelText(strings.progress.courseTitle) as HTMLInputElement).value).toBe("SICP");
```

（若 `▸ 资料 3 · 2 本未排课` 按钮有两个，用 `getAllByRole(...)[0]`，并在报告里说明。）

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全绿；新增改动只在「只准改」的文件里。

## 结束报告

改了哪些文件；每一步是否照做；偏离之处与原因；未完成项。
