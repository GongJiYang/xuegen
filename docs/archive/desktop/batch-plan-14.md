# 批次 PL-14：「排课」按周期排（表单与建课消息）

设计稿（用户已批准）：`/Users/gjy/pi-learning/design/animate/src/newcourse.jsx` 的下半部分 `CycleForm`（`http://localhost:5181/?d=newcourse`）。

问题：总进度里辅助行 / 科目资料的「排课」打开的是普通新课程表单，建课消息写「从今天开始、4 周后学完、不休息」，学根就排成了每天一节。改法：从**周期视图**里点「排课」时带上周期位置（周期、科目、主项/辅助、上课日、周期结束日），表单只填课程名、资料、原书、讲解风格，顶部显示「C1 辅助 · 周一 · 周三 · 每节 ≤ 45 分钟 · 排到 12-24（C1 结束）」；建课消息写明这些限制，并指向 `course` 技能「学习周期里的课」一节（已由 Claude 写好）。「＋ 新课程」与非周期布局保持原样。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**，代码照抄；不要重新设计。做不通时停下报告。
- 只准改：`src/renderer/core/board/course-prompts.ts`、`course-prompts.test.ts`、`src/renderer/core/board/plan-view.ts`、`plan-view.test.ts`、`src/renderer/core/strings.ts`、`src/renderer/skins/bear/plan-progress.tsx`、`plan-progress.test.tsx`、`src/renderer/skins/bear/progress-panel.tsx`、`src/renderer/skins/bear/skin.css`。路径相对 `apps/desktop/`。
- 皮肤里不写中文文案。不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。

## 第 1 步：`course-prompts.ts`

1. 在 `NewCourseRequest` 上面加：

```ts
/** Where a course sits in the current study cycle, when it is planned from the cycle view. */
export interface CyclePlacement {
  /** 「C1」. */
  cycle: string;
  /** Subject slug and display name. */
  subject: string;
  subjectName: string;
  role: "main" | "aux";
  /** The subject's days in the weekly template: 「周一」「周三」. */
  days: string[];
  /** The cycle's last day, `YYYY-MM-DD`. */
  end: string;
}
```

2. `NewCourseRequest` 里加 `/** Set when planned from the cycle view: dates come from the cycle, not the form. */ cycle?: CyclePlacement;`（分两行写）。
3. `newCoursePrompt` 函数开头（`const material = …` 之后）加：

```ts
  if (request.cycle) {
    const placement = request.cycle;
    const role = placement.role === "aux" ? "辅助" : "主项";
    const length =
      placement.role === "aux"
        ? "每节不超过 45 分钟、只做了解、不出检查题"
        : "每节时长按资料难度估（一般不超过 2 小时）";
    return [
      `/skill:course 新建课程「${request.title.trim()}」。`,
      material,
      `这是 ${placement.cycle} ${role}课（科目：${placement.subjectName}），只排在${placement.days.join("、")}，${length}，从今天之后第一个上课日排到 ${placement.end}（${placement.cycle} 结束），排不下的留到下个周期；原书「${READING_NAMES[request.reading]}」，讲解风格「${STYLE_NAMES[request.style]}」。`,
      "按 course 技能「学习周期里的课」排期（--days 用这几天，--reviews anki），建好后在科目页资料行补短名链接，并跑 cycle.mjs check。",
      "建好后先用三五行告诉我本周期能学到哪里，再开始第一课。",
    ].join("");
  }
```

4. `course-prompts.test.ts` 追加：

```ts
  it("plans a cycle course on the subject's days, not the form's dates", () => {
    const text = newCoursePrompt({
      title: "C 语言",
      material: "",
      startDate: "2026-11-06",
      endDate: "2026-12-24",
      rest: "none",
      reading: "guided",
      style: "plain",
      cycle: { cycle: "C1", subject: "c-systems-programming", subjectName: "C 与系统编程", role: "aux", days: ["周一", "周三"], end: "2026-12-24" },
    });
    expect(text).toContain("这是 C1 辅助课（科目：C 与系统编程），只排在周一、周三，每节不超过 45 分钟");
    expect(text).toContain("排到 2026-12-24（C1 结束）");
    expect(text).toContain("学习周期里的课");
    expect(text).not.toContain("不休息");
    const main = newCoursePrompt({
      title: "SICP", material: "SICP", startDate: "2026-11-06", endDate: "2026-12-24", rest: "none", reading: "read-first", style: "deep",
      cycle: { cycle: "C1", subject: "programming-paradigms", subjectName: "编程语言与编程范式", role: "main", days: ["周二", "周四"], end: "2026-12-24" },
    });
    expect(main).toContain("这是 C1 主项课");
    expect(main).toContain("一般不超过 2 小时");
  });
```

## 第 2 步：`plan-view.ts`

import 加 `type { CyclePlacement } from "./course-prompts.js"`；文件末尾加：

```ts
/** Where a course planned for `subject` would sit in the current cycle, or null outside a cycle. */
export function cyclePlacement(
  overview: CycleOverview,
  subject: string,
  subjectName: string,
  role: "main" | "aux",
): CyclePlacement | null {
  const cycle = overview.cycle;
  if (!cycle) return null;
  return { cycle: cycle.cycle, subject, subjectName, role, days: cycle.subjectDays[subject] ?? [], end: cycle.end };
}
```

`plan-view.test.ts` 追加：`cyclePlacement(OVERVIEW, "discrete-math", "离散数学", "main")` 等于 `{ cycle: "C1", subject: "discrete-math", subjectName: "离散数学", role: "main", days: ["周一", "周三"], end: "2026-12-24" }`；`cycle: null` 时返回 `null`。

## 第 3 步：`strings.ts`

`progress: {` 块里 `readingHints: …` 下面加：

```ts
    placementTitle: (subject: string): string => `排课 · ${subject}`,
    placementTag: (cycle: string, role: "main" | "aux"): string => `${cycle} ${role === "aux" ? "辅助" : "主项"}`,
    placementLine: (days: string[], role: "main" | "aux", end: string, cycle: string): string =>
      `${days.join(" · ")}　${role === "aux" ? "每节 ≤ 45 分钟　" : ""}排到 ${end.slice(5)}（${cycle} 结束）`,
    placementHint: (role: "main" | "aux"): string =>
      role === "aux"
        ? "辅助只做了解，不出检查题；周期内排不下的留到下个周期。"
        : "按资料难度估每节时长；周期内排不下的留到下个周期。",
    placementSubmit: "交给学根排课",
```

## 第 4 步：`plan-progress.tsx`

1. import 加 `cyclePlacement`（从 `plan-view.js`）与 `type { CyclePlacement } from "../../core/board/course-prompts.js"`。
2. `PlanProgressProps` 里 `onPlanMaterial(title: string): void;` 改为 `onPlanMaterial(title: string, placement: CyclePlacement | null): void;`。
3. 主项科目块里 `<Materials group={group} onPlan={props.onPlanMaterial} />` 改为：

```tsx
          <Materials
            group={group}
            onPlan={(title) => props.onPlanMaterial(title, cyclePlacement(overview, group.slug, group.title, "main"))}
          />
```

4. 辅助行的「排课」按钮 `onClick={() => props.onPlanMaterial(row.subjectName)}` 改为：

```tsx
                onClick={() => props.onPlanMaterial("", cyclePlacement(overview, row.subject, row.subjectName, "aux"))}
```

## 第 5 步：`progress-panel.tsx`

1. import 加 `type CyclePlacement`（从 `course-prompts.js` 那行一起）。
2. `const [draft, setDraft] = useState<string | null>(null);` 改为：

```tsx
  const [draft, setDraft] = useState<{ title: string; placement: CyclePlacement | null } | null>(null);
```

   所有 `setDraft(title)` 改为 `setDraft({ title, placement: null })`（旧布局的 `GroupedProgress` 回调），`setDraft(null)` 不变。
3. `NewCourseForm` 参数加 `placement?: CyclePlacement | null;`（类型和解构都加）。在它的 `submit()` 里，`onSubmit({ … })` 改为：

```tsx
    onSubmit(
      placement
        ? { title: name, material: material.trim(), startDate: todayIso(), endDate: placement.end, rest: "none", reading, style, cycle: placement }
        : { title: name, material: material.trim(), startDate, endDate, rest, reading, style },
    );
```

4. `NewCourseForm` 的 JSX：
   - 标题 `<span>{strings.progress.newCourse}</span>` 改为 `<span>{placement ? strings.progress.placementTitle(placement.subjectName) : strings.progress.newCourse}</span>`。
   - 标题下面的 `<p className="bear-muted">{strings.progress.newCourseHint}</p>` 改为：

```tsx
      {placement ? (
        <>
          <div className="bear-nc-cycle">
            <span className="bear-nc-tag">{strings.progress.placementTag(placement.cycle, placement.role)}</span>
            <span>{strings.progress.placementLine(placement.days, placement.role, placement.end, placement.cycle)}</span>
          </div>
          <p className="bear-muted">{strings.progress.placementHint(placement.role)}</p>
        </>
      ) : (
        <p className="bear-muted">{strings.progress.newCourseHint}</p>
      )}
```

   - 「开始日期」「截止日期」两个 `TextField` 与「休息日」`Segmented` 外面包 `{!placement && ( <> … </> )}`。
   - 「建课」按钮文字改为 `{placement ? strings.progress.placementSubmit : strings.progress.create}`。
5. `const form = creating && ( <NewCourseForm key={draft ?? ""} initialTitle={draft ?? undefined} …` 改为 `key={draft ? `${draft.title}|${draft.placement?.subject ?? ""}` : ""}`、`initialTitle={draft?.title || undefined}`，并加属性 `placement={draft?.placement ?? null}`。
6. 传给 `PlanProgress` 的 `onPlanMaterial={(title) => { setDraft(title); setCreating(true); }}` 改为 `onPlanMaterial={(title, placement) => { setDraft({ title, placement }); setCreating(true); }}`。
7. 若 `initialTitle` 同时预填了「资料」（PL-3 的写法），在 `placement` 存在且 `initialTitle` 为空时资料框保持空。

## 第 6 步：`skin.css` 末尾追加

```css
/* 排课 from the cycle view (design ?d=newcourse, CycleForm). */
[data-skin="bear"] .bear-nc-cycle {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 10px 0 2px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--code-bg);
  font-size: 12.5px;
  color: #4a4f55;
}
[data-skin="bear"] .bear-nc-tag {
  flex: none;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--rule);
  font-size: 11.5px;
  color: var(--ink);
}
```

## 第 7 步：`plan-progress.test.tsx` 追加

渲染带周期总览的 `ProgressPanel`（照本文件已有写法），点辅助行「C」那一行的 `strings.plan.planMaterial` 按钮（辅助样例在 `SAMPLE_OVERVIEW.cycle.auxSubjects`；若样例里辅助都已有课程、没有「排课」按钮，把 `SAMPLE_OVERVIEW` 里 `data-structures` 那门保持无课程，用它测试），断言：
- 出现 `strings.progress.placementTitle(...)` 标题和 `strings.progress.placementSubmit` 按钮；
- 没有「开始日期」输入框（`queryByLabelText(strings.progress.startDate)` 为 null）；
- 填课程名后点提交，`onNewCourse` 收到的请求带 `cycle.role === "aux"` 且 `cycle.days` 等于样例里该科目的 `subjectDays`。

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && git status --short
```

## 结束报告

改了哪些文件；每一步是否照做；偏离之处与原因；未完成项。
