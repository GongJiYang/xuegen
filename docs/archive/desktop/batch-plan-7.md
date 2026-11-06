# 批次 PL-7：新课程表单去掉「每天时长」，加「原书」三档

设计稿（用户已确认，并要求去掉「每天时长」）：`/Users/gjy/pi-learning/design/animate/src/newcourse.jsx`（`http://localhost:5181/?d=newcourse`）。

- 每节时长不再由用户定：`course` 技能按资料难度和篇幅估（SKILL.md 已由 Claude 改好）。
- 新增「原书」：带读 / 先读后讲 / 边读边讲，默认带读，选中时下面一行显示说明。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**，代码照抄；不要重新设计。做不通时停下报告。
- 只准改：`renderer/core/board/course-prompts.ts`、`renderer/core/board/course-prompts.test.ts`、`renderer/core/board/use-course-sessions.test.tsx`（只改第 177 行附近的请求对象）、`renderer/core/strings.ts`、`renderer/skins/bear/progress-panel.tsx`、`renderer/skins/bear/skin.css`、`renderer/skins/bare/progress-panel.tsx`、`renderer/skins/chicago/progress-panel.tsx`，以及类型报错需要补字段的测试文件。
- 皮肤里不写中文文案。不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。

以下路径都相对 `apps/desktop/src/`。

## 第 1 步：`renderer/core/board/course-prompts.ts`

1. `NewCourseRequest` 里删掉 `minutesPerDay: number;`，在 `rest: RestDays;` 下面加：

```ts
  /** How the original text is used: 带读 / 先读后讲 / 边读边讲. */
  reading: ReadingMode;
```

2. 在 `export type RestDays = …` 下面加：

```ts
/** How a course uses the original text (the `course` skill's 「原书」 line). */
export const READING_MODES = ["guided", "read-first", "read-along"] as const;
export type ReadingMode = (typeof READING_MODES)[number];

const READING_NAMES: Record<ReadingMode, string> = { guided: "带读", "read-first": "先读后讲", "read-along": "边读边讲" };
```

3. `newCoursePrompt` 返回数组里的第三项（`每天学 ${request.minutesPerDay} 分钟，…讲解风格「…」。`）替换为：

```ts
    `从 ${request.startDate} 开始，${request.endDate} 前学完，${REST_NAMES[request.rest]}，原书「${READING_NAMES[request.reading]}」，讲解风格「${STYLE_NAMES[request.style]}」。`,
    "每节时长由你按资料难度和篇幅估，写在每个课次里；教材有目录就按目录切课次。",
```

## 第 2 步：`renderer/core/board/course-prompts.test.ts`

1. 第一个测试的请求对象：删掉 `minutesPerDay: 60,`，加 `reading: "read-first",`；`expect(text).toContain("每天学 60 分钟，从 2026-11-10 开始");` 改为：

```ts
    expect(text).toContain("从 2026-11-10 开始");
    expect(text).toContain("原书「先读后讲」");
    expect(text).toContain("每节时长由你按资料难度和篇幅估");
    expect(text).not.toContain("每天学");
```

2. 「asks for material when none was given」测试的请求对象：`minutesPerDay: 30,` 改为 `reading: "guided",`，并加 `expect(text).toContain("原书「带读」");`。

## 第 3 步：`renderer/core/board/use-course-sessions.test.tsx`

第 177 行附近请求对象里 `minutesPerDay: 30,` 改为 `reading: "guided",`。

## 第 4 步：`renderer/core/strings.ts`

`progress: {` 块里：删掉 `minutesPerDay: "每天时长",` 和 `minutesOption: …` 两项；在 `restOptions: …` 下面加：

```ts
    reading: "原书",
    readingOptions: { guided: "带读", "read-first": "先读后讲", "read-along": "边读边讲" } as Record<string, string>,
    readingHints: {
      guided: "学根讲，不安排读原文",
      "read-first": "每节先读原书 §x–y，再讲和练；阅读单独打勾",
      "read-along": "课上一起读原文段落，逐段讲",
    } as Record<string, string>,
```

## 第 5 步：Bear `renderer/skins/bear/progress-panel.tsx` 与 `skin.css`

1. 删掉 `const MINUTES_PER_DAY = …` 与 `type MinutesPerDay = …` 两行。
2. import `course-prompts.js` 的那段里加 `READING_MODES,` 和 `type ReadingMode,`。
3. `NewCourseForm` 里：`const [minutes, setMinutes] = useState<MinutesPerDay>(45);` 改为 `const [reading, setReading] = useState<ReadingMode>("guided");`；`onSubmit({ … minutesPerDay: minutes, … })` 改为 `onSubmit({ title: name, material: material.trim(), startDate, endDate, rest, reading, style });`。
4. 删掉「每天时长」那个 `<Segmented … label={strings.progress.minutesPerDay} … />`。在「休息日」那个 `<Segmented … restDays … />` **下面**、「讲解风格」上面插入：

```tsx
      <Segmented
        label={strings.progress.reading}
        value={reading}
        options={READING_MODES.map((id) => ({ id, label: strings.progress.readingOptions[id] ?? id }))}
        onChange={(next) => setReading(next)}
      />
      <p className="bear-muted bear-reading-hint">{strings.progress.readingHints[reading]}</p>
```

5. `skin.css` 末尾追加：

```css
[data-skin="bear"] .bear-tabpanels .bear-reading-hint {
  margin: -0.2em 0 0.4em;
  font-size: 12px;
}
```

## 第 6 步：bare `renderer/skins/bare/progress-panel.tsx`

1. 删掉 `MINUTES_PER_DAY` / `MinutesPerDay` 两行；import 加 `READING_MODES, type ReadingMode`。
2. `const [minutes, setMinutes] = …` 改为 `const [reading, setReading] = useState<ReadingMode>("guided");`；`onSubmit` 同 Bear 第 3 条。
3. 「每天时长」那个 `<fieldset>`（legend 是 `strings.progress.minutesPerDay`）整个删掉；在「休息日」`<fieldset>` 下面插入：

```tsx
      <fieldset>
        <legend>{strings.progress.reading}</legend>
        {READING_MODES.map((id) => (
          <label key={id}>
            <input type="radio" name="new-course-reading" checked={reading === id} onChange={() => setReading(id)} />
            {strings.progress.readingOptions[id] ?? id}
          </label>
        ))}
        <p>{strings.progress.readingHints[reading]}</p>
      </fieldset>
```

## 第 7 步：chicago `renderer/skins/chicago/progress-panel.tsx`

1. 删掉 `MINUTES_PER_DAY` / `MinutesPerDay` 两行；import 加 `READING_MODES, type ReadingMode`。
2. `const [minutes, setMinutes] = …` 改为 `const [reading, setReading] = useState<ReadingMode>("guided");`；`onSubmit` 同 Bear 第 3 条。
3. 「每天时长」那个 `<InRow><RadioGroup … name="new-course-minutes" … /></InRow>` 整段删掉；在「休息日」那个 `<InRow>…</InRow>` 下面插入：

```tsx
      <InRow>
        <RadioGroup<ReadingMode>
          name="new-course-reading"
          value={reading}
          label={`${strings.progress.reading}：`}
          options={READING_MODES.map((id) => ({ id, label: strings.progress.readingOptions[id] ?? id }))}
          onChange={setReading}
        />
      </InRow>
      <Note>{strings.progress.readingHints[reading]}</Note>
```

（`Note` 已从 `./panel-shared.js` import。）

## 第 8 步：类型检查与测试

跑 `npm run typecheck`。其他测试里手写 `NewCourseRequest` 含 `minutesPerDay` 的，换成 `reading: "guided"`。测试里查找「每天时长」/`minutesOption` 的断言，改成查「原书」三个选项（`strings.progress.readingOptions`），在报告里列出改了哪些。

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
grep -rn "minutesPerDay\|MINUTES_PER_DAY\|minutesOption" src/ ; echo "grep exit $?"
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全绿；grep 无结果；新增改动只在允许的文件里。

## 结束报告

改了哪些文件；每一步是否照做；改了哪些测试及原因；未完成项。
