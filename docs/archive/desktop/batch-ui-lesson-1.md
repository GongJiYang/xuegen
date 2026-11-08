# batch-ui-lesson-1：自动指令折叠成一行、上课按钮、「默认 · 细讲」

设计稿：`design/animate/?d=fix1` 的「① 上课的对话窗口」（用户 2026-11-08 批准）。前一批 `batch-ui-words-1` 已改好 `/` 菜单与用词，本批在其上做。

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/platform/PRINCIPLES.md`。
- 文案只在 `core/strings.ts`；决策逻辑是 `core/` 纯函数并有测试；契约改动 **bare、bear、chicago 都实现**，画廊（`src/renderer/gallery/`）补样例。
- `App.tsx` 改完 ≤ 450 行。技能脚本零依赖。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖；不放宽 eslint。

## 第 1 步 动作标记 `src/renderer/core/chat/action-marker.ts`（新文件，纯函数）

界面替用户发的指令（开课、接着上次、改计划、总结、制卡、收课、存档、从存档点接着上）在**末尾**加一行标记，对话里据此把这条消息折叠成一行标签。放末尾是为了不挡住开头的 `/skill:…` 与 `[风格：…]`。

```ts
/**
 * A marker on the last line of a message the interface sends for the user
 * (开课, 收课 …): `⟦xuegen:<action>⟧` or `⟦xuegen:<action>|<slug>|<course title>⟧`.
 * The transcript folds such a message into a one-line label (see message-renderer).
 */
import { strings } from "../strings.js";

export const ACTION_KINDS = ["open", "resume", "plan", "summary", "cards", "close", "checkpoint", "continue"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export function withActionMarker(text: string, action: ActionKind, course?: { slug: string; title: string }): string {
  const tail = course ? `|${course.slug}|${course.title.replace(/[|⟧\n]/g, " ")}` : "";
  return `${text}\n⟦xuegen:${action}${tail}⟧`;
}

const MARKER = /\n?⟦xuegen:([a-z]+)(?:\|([^|⟧\n]+)\|([^⟧\n]+))?⟧\s*$/;

export function splitActionMarker(body: string): { action: ActionKind | null; slug: string | null; courseTitle: string | null; body: string } {
  const match = MARKER.exec(body);
  const action = match?.[1] as ActionKind | undefined;
  if (!match || !action || !(ACTION_KINDS as readonly string[]).includes(action)) {
    return { action: null, slug: null, courseTitle: null, body };
  }
  return { action, slug: match[2] ?? null, courseTitle: match[3] ?? null, body: body.slice(0, match.index).trimEnd() };
}

/** The folded label: 「开今天的课 · 离散数学（Epp, 5th ed）」, or just the action name. */
export function actionLabel(action: ActionKind, courseTitle: string | null): string {
  const name = strings.actions[action];
  return courseTitle ? `${name} · ${courseTitle}` : name;
}
```

`action-marker.test.ts`：往返（带课程 / 不带课程）、没有标记时原样返回、未知 action 原样返回、标记前有 `/skill:course` 与 `[风格：细讲]` 时 `splitStyleTag` 后再 `splitActionMarker` 仍能拆出、课程名里的 `|` 被替换。

## 第 2 步 `core/strings.ts`

1. 新增顶层：

```ts
  actions: {
    open: "开今天的课",
    resume: "接着上次",
    plan: "改计划",
    summary: "总结",
    cards: "制卡",
    close: "收课",
    checkpoint: "存档",
    continue: "从存档点接着上",
  },
  lesson: {
    summary: "总结",
    cards: "制卡",
    close: "收课",
    label: "上课",
  },
```

2. `commands` 加 `endTodayPrompt: "今天学到这里，写进 wiki，更新计划",`。
3. `input` 对象加 `defaultStyle: (name: string): string => \`默认 · ${name}\`,`。

## 第 3 步 给界面发出的指令加标记

- `core/today.ts`：`studyPrompt` 返回值包一层 `withActionMarker(…, "open", { slug: course.slug, title: course.title })`；`resumePrompt` 用 `"resume"` 与 `resume.course`。
- `core/board/course-prompts.ts`：`editPlanPrompt` 返回值包 `withActionMarker(…, "plan", { slug: course.slug, title: course.title })`。
- `core/commands/run-command.ts`：`/总结` → `withActionMarker(strings.commands.summarizePrompt, "summary")`；`/制卡` → `withActionMarker(strings.cards.draftPrompt, "cards")`；`/收课` → `withActionMarker(strings.commands.endTodayPrompt, "close")`。
- `core/board/use-session-freshness.ts`：`controller.sendCommand(strings.chat.checkpointPrompt)` 改为 `controller.sendCommand(withActionMarker(strings.chat.checkpointPrompt, "checkpoint"))`；`onContinueFresh(course.slug, strings.chat.checkpointResume)` 的文本改为 `withActionMarker(strings.chat.checkpointResume, "continue", { slug: course.slug, title: course.title })`。
- 相关测试里断言整句提示词的，改成断言 `splitActionMarker(text).body` 等于原句、`action` 正确。

## 第 4 步 对话里折叠显示

1. `skins/contract.ts` 的 `UserMessageProps` 加：

```ts
  /**
   * Set when the interface sent this message for the user (开课, 收课 …): a
   * one-line label such as 「开今天的课 · 离散数学（Epp, 5th ed）」. The skin
   * shows the label folded and reveals {@link body} only on demand.
   */
  actionLabel: string | null;
```

2. `core/chat/message-renderer.tsx` 用户消息分支（约 98 行）改为：

```tsx
    const { body: styled, styleTag } = splitStyleTag(message.markdown);
    const marked = splitActionMarker(styled);
    const label = marked.action ? actionLabel(marked.action, marked.courseTitle) : null;
    return <slots.UserMessage message={message} body={marked.body} styleTag={styleTag} actionLabel={label} />;
```

3. 三个皮肤的 `UserMessage`（`skins/bear/slots.tsx`、`skins/bare/messages.tsx`、`skins/chicago/slots.tsx`）：`actionLabel` 不为 null 时，整条用户消息改成原生 `<details>`：`<summary>` 里只放 `actionLabel`（Bear 前面不另加 ▸，用浏览器自带的三角即可）；展开后照原样渲染 `body`（和原来一样的组件/样式），不显示 `styleTag`。为 null 时完全照旧。
4. 样式（只在各自皮肤 CSS 里，选择器限定在 `[data-skin="<id>"]` 下）：
   - Bear（`skins/bear/skin.css`）：`summary` 是一枚小胶囊——字号 12px、颜色 `var(--soft)`、1px `var(--rule)`（或该文件里表示细线的变量）边框、圆角 999px、内边距 3px 10px、`cursor: pointer`、`display: inline-flex`；展开后的正文用 `var(--soft)` 颜色、字号 13px、左侧 2px 细线。
   - Chicago：`summary` 用它现有的小号文字样式；bare：不加样式。
5. 画廊：`gallery/` 里用户消息样例加一条带 `actionLabel` 的。

## 第 5 步 上课按钮

1. 新文件 `core/chat/lesson-actions.ts`（纯函数 + 测试）：

```ts
import { strings } from "../strings.js";
import { withActionMarker } from "./action-marker.js";

export interface LessonAction { label: string; text: string }

/** The buttons a course session shows beside the composer (none outside a course). */
export function lessonActions(activeCourse: string | null): LessonAction[] {
  if (!activeCourse) return [];
  return [
    { label: strings.lesson.summary, text: withActionMarker(strings.commands.summarizePrompt, "summary") },
    { label: strings.lesson.cards, text: withActionMarker(strings.cards.draftPrompt, "cards") },
    { label: strings.lesson.close, text: withActionMarker(strings.commands.endTodayPrompt, "close") },
  ];
}
```

2. `skins/contract.ts` 的 `ComposerProps` 加：

```ts
  /** 总结 · 制卡 · 收课 in a course session; empty elsewhere. Disabled while streaming. */
  lessonActions: { label: string; run(): void }[];
  /** The label for the 「默认」 style: 「默认 · 细讲」 when the subject has a default, else 「默认」. */
  defaultStyleLabel: string;
```

3. `App.tsx` 的 `<Composer …>` 加两项：

```tsx
          lessonActions={lessonActions(activeCourse).map((a) => ({ label: a.label, run: () => controller.send(a.text) }))}
          defaultStyleLabel={defaultStyleLabel(subjects, activeCourse)}
```

（`subjects` 是 App 里已有的 `useSubjects` 结果；`defaultStyleLabel` 见第 6 步。）

4. 三个皮肤的 `Composer`：在风格单选行的**右侧**（Bear 在 `bear-chint` 提示之前）渲染 `lessonActions` 为一组文字按钮，`streaming` 时 `disabled`；Bear 最后一个（收课）用正文墨色，其余用 `var(--soft)`，悬停变墨色。风格单选里 `id === "default"` 那一项显示 `defaultStyleLabel`（`aria-label` 同样）。Chicago、bare 同样放在风格行右侧，用各自现有按钮样式。
5. 画廊：Composer 样例加 `lessonActions`（三项）与 `defaultStyleLabel: "默认 · 细讲"`。

## 第 6 步 科目默认风格

1. `skills/cycle-plan/subjects.mjs` 的科目页解析：在 `## 讲解偏好` 一节里找 `- 默认风格：X`（X 取「大白话」「细讲」「深度」之一，后面可跟括号说明），对应 `plain` / `detailed` / `deep`，作为 `defaultStyle`；没有这一节或没写时为 `null`。结果对象加 `defaultStyle`。`subjects.test.mjs` 加：有 `- 默认风格：细讲（迁移自…）` → `"detailed"`；没有 → `null`。
2. `src/shared/data-protocol.ts` 的 `SubjectInfo` 加 `/** 「## 讲解偏好」里的默认风格，没写为 null。 */ defaultStyle: "plain" | "detailed" | "deep" | null;`。若该类型有运行时校验函数，校验里允许这个字段缺省（旧数据视为 `null`）。
3. 新文件 `core/board/default-style.ts`（纯函数 + 测试）：

```ts
import type { SubjectsOverview } from "@shared/data-protocol.js";
import { strings } from "../strings.js";
import type { AsyncState } from "<照 App 里 subjects 的实际类型引入>";

/** 「默认 · 细讲」 for a course whose subject page names a default style, else 「默认」. */
export function defaultStyleLabel(subjects: AsyncState<SubjectsOverview>, activeCourse: string | null): string {
  if (!activeCourse || subjects.status !== "ready") return strings.input.defaultStyle("").replace(/ · $/, "");
  const subject = subjects.value.subjects.find((item) => item.courses.includes(activeCourse));
  const style = subject?.defaultStyle ?? null;
  return style ? strings.input.defaultStyle(strings.chat.styles[style]) : strings.input.defaultStyle("").replace(/ · $/, "");
}
```

（`strings.chat.styles` 指 strings 里「每个风格的标签」那张表，按实际路径引用；`subjects` 的类型照 `useSubjects` 返回的实际类型写。逻辑以上面为准，写法可按项目习惯调整，但不要在皮肤里做这个判断。）测试：无课程 → 「默认」；有课程且科目写了细讲 → 「默认 · 细讲」；科目没写 → 「默认」；数据未就绪 → 「默认」。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -1
cd /Users/gjy/pi-learning/xuegen/apps/desktop && wc -l src/renderer/App.tsx
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全部通过（高负载下 `contract.test.tsx` 偶发皮肤加载超时，单独重跑通过即可并注明）；`App.tsx` ≤ 450；`git status` 只多本批文件。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收输出。
