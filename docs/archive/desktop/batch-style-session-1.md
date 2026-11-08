# batch-style-session-1：讲解风格只管本次会话，默认跟随偏好

## 硬约束（先读，压缩后也照做）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/platform/PRINCIPLES.md` 第 5 条。
- 决策逻辑放 `src/renderer/core/` 的纯函数并配同名测试；hook 里 effect 不同步 setState；界面文案只在 `core/strings.ts`。
- `App.tsx` 现在 447 行，改完必须 **≤ 450 行**（本批应让它变短）。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖；不放宽 eslint 规则，不加 `eslint-disable` / `@ts-ignore`。
- 只做下面列出的改动。

## 要做成什么（可观察）

- 风格选项多一个「默认」，排第一。选「默认」时消息**不带** `[风格：…]` 前缀（学根按科目偏好取默认风格）。
- 风格选择只存在内存里：按课程分别记、自由对话单独记，**只在当天有效**；重启应用或过零点后都回到「默认」。`desktop.json` 不再保存 `courseStyles` / `sessionStyle`。
- 新课程表单的风格默认是「默认」；选了别的风格时，发给学根的请求里写成「默认讲解风格「X」（按 course 的讲解偏好写进科目页，先问我确认）」；选「默认」时不写这一句。

## 第 1 步 `src/shared/protocol.ts`

1. `export type TeachingStyle = "default" | "plain" | "detailed" | "deep";`，注释改为「Teaching style ids. `default` sends no prefix: 学根 then follows the subject's 讲解偏好.」
2. `TEACHING_STYLE_LABELS` 第一项加 `{ id: "default", label: "默认" }`。
3. `isTeachingStyle` 改为 `return value === "default" || value === "plain" || value === "detailed" || value === "deep";`。
4. 从 `DesktopSettings` 删掉 `courseStyles`、`sessionStyle` 两个字段（连同注释）；从 `DEFAULT_DESKTOP_SETTINGS` 删掉 `courseStyles: {}`、`sessionStyle: "plain"` 和它上面那行注释；从 `normalizeDesktopSettings` 返回对象里删掉 `courseStyles`、`sessionStyle` 两项；删掉整个 `normalizeCourseStyles` 函数。旧 `desktop.json` 里的这两个键因此被忽略（normalize 只拷已知字段）。
5. `src/shared/protocol.test.ts`：删掉针对 `courseStyles`/`sessionStyle`/`normalizeCourseStyles` 的断言；加一条测试：`normalizeDesktopSettings({ courseStyles: { ctm: "deep" }, sessionStyle: "deep" })` 的结果里没有这两个键；`isTeachingStyle("default")` 为 true。
6. `src/shared/README.md` 第 11 行列表里去掉 `courseStyles`、`sessionStyle`。

## 第 2 步 `src/renderer/core/strings.ts`

`styles` 对象加 `default: "默认",`（放第一行）。

## 第 3 步 `src/renderer/core/chat/style-prefix.ts`

`withStylePrefix` 里，在 `if (!trimmed) return trimmed;` 之后加一行：

```ts
  // 「默认」不加标签：学根按科目的讲解偏好取默认风格。
  if (style === "default") return trimmed;
```

`style-prefix.test.ts` 加：`withStylePrefix("default", "你好")` 返回 `"你好"`；`withStylePrefix("default", "/skill:teach 你好")` 原样返回。

## 第 4 步 `src/renderer/core/chat/style.ts`（整文件替换）

```ts
/**
 * Teaching-style choices for today's sessions.
 *
 * A style picked in the UI holds only for the session it was picked in (see
 * docs/platform/PRINCIPLES.md §5): it lives in memory, per course and for the
 * free chat, and only for the day it was picked. Anything else is 「默认」, which
 * sends no prefix so 学根 follows the subject's 讲解偏好. Pure: the caller passes today.
 */

import type { TeachingStyle } from "@shared/protocol.js";

export interface SessionStyles {
  /** The local day (YYYY-MM-DD) the choices were made on. */
  date: string;
  /** Style picked per course slug today. */
  byCourse: Record<string, TeachingStyle>;
  /** Style picked for the chat not tied to a course. */
  free: TeachingStyle;
}

export function emptySessionStyles(date: string): SessionStyles {
  return { date, byCourse: {}, free: "default" };
}

/** The style in effect for `courseSlug` (null = free chat) on `today`. */
export function resolveStyle(styles: SessionStyles, today: string, courseSlug: string | null): TeachingStyle {
  if (styles.date !== today) return "default";
  if (courseSlug) return styles.byCourse[courseSlug] ?? "default";
  return styles.free;
}

/** Record a pick for `courseSlug` (null = free chat); choices from an earlier day are dropped. */
export function withStyleChoice(
  styles: SessionStyles,
  today: string,
  courseSlug: string | null,
  next: TeachingStyle,
): SessionStyles {
  const base = styles.date === today ? styles : emptySessionStyles(today);
  return courseSlug ? { ...base, byCourse: { ...base.byCourse, [courseSlug]: next } } : { ...base, free: next };
}

/** Today's per-course picks, for the course cards. */
export function courseStylesOf(styles: SessionStyles, today: string): Record<string, TeachingStyle> {
  return styles.date === today ? styles.byCourse : {};
}
```

`style.test.ts` 整文件重写，覆盖：空状态 → `"default"`；同日按课程/自由对话分别取；隔天 → `"default"`；`withStyleChoice` 同日累加、隔天清空旧选择；`courseStylesOf` 隔天返回 `{}`。

## 第 5 步 新文件 `src/renderer/core/chat/use-session-style.ts`

```ts
/**
 * In-memory teaching-style choices (never persisted): the composer menu, the
 * /风格 commands and the course cards all read and write here.
 */

import { useCallback, useState } from "react";
import type { TeachingStyle } from "@shared/protocol.js";
import { dateKey } from "../board/use-calendar.js";
import { courseStylesOf, emptySessionStyles, resolveStyle, withStyleChoice, type SessionStyles } from "./style.js";

export interface SessionStyle {
  /** The style for the running session (course or free chat). */
  style: TeachingStyle;
  /** Today's per-course picks, for the course cards. */
  courseStyles: Record<string, TeachingStyle>;
  /** Pick a style for the running session. */
  select(next: TeachingStyle): void;
  /** Pick a style for a course from its card. */
  setCourse(slug: string, next: TeachingStyle): void;
}

export function useSessionStyle(activeCourse: string | null): SessionStyle {
  const [styles, setStyles] = useState<SessionStyles>(() => emptySessionStyles(dateKey(new Date())));
  const today = dateKey(new Date());
  const select = useCallback(
    (next: TeachingStyle) => setStyles((current) => withStyleChoice(current, dateKey(new Date()), activeCourse, next)),
    [activeCourse],
  );
  const setCourse = useCallback(
    (slug: string, next: TeachingStyle) => setStyles((current) => withStyleChoice(current, dateKey(new Date()), slug, next)),
    [],
  );
  return { style: resolveStyle(styles, today, activeCourse), courseStyles: courseStylesOf(styles, today), select, setCourse };
}
```

（如果 eslint 不允许 `core/chat` 引 `core/board/use-calendar.js`，就把 `dateKey` 的同样实现挪到 `core/format.ts` 导出并两处都改用它——先跑 lint 看，不要放宽规则。）

## 第 6 步 `src/renderer/App.tsx`

1. import：删 `import { resolveStyle, styleWriteTarget } from "./core/chat/style.js";`，加 `import { useSessionStyle } from "./core/chat/use-session-style.js";`；`TeachingStyle` 若不再用到就从 import 里删。
2. 第 113 行 `const style = resolveStyle(settings, activeCourse);` 换成 `const sessionStyle = useSessionStyle(activeCourse);`，下一行 `useChat(style, …)` 改 `useChat(sessionStyle.style, …)`。
3. 删掉整个 `setCourseStyle` 和 `handleSelectStyle` 两个 `useCallback`（约 175–195 行）。
4. 原来用 `handleSelectStyle` 的三处（约 235、372、421 行）改用 `sessionStyle.select`；第 262 行依赖数组里的 `handleSelectStyle` 换成 `sessionStyle.select`。`onCourseStyle: setCourseStyle` 改 `onCourseStyle: sessionStyle.setCourse`；`courseStyles: settings.courseStyles` 改 `courseStyles: sessionStyle.courseStyles`。其他用到 `style` 变量的地方（如传给 composer 的 `style`）改 `sessionStyle.style`。
5. `wc -l App.tsx` 必须 ≤ 450。

## 第 7 步 `src/renderer/core/chat/useChat.ts`

`useChat(style: TeachingStyle = "plain", …)` 默认值改 `"default"`。

## 第 8 步 `src/renderer/core/board/use-course-sessions.ts`

认领新课程的 effect（约 248–259 行）里，`update({...})` 只保留 `courseSessions` 一项，删掉 `courseStyles: …`；依赖数组删掉 `settings.courseStyles`。`use-course-sessions.test.tsx` 里相应断言改掉（不再期望写入 `courseStyles`）。

## 第 9 步 `src/renderer/core/board/course-prompts.ts`

1. `STYLE_NAMES` 加 `default: "默认"`。
2. 加函数：

```ts
/** 「默认」不写风格；选了别的就请学根按讲解偏好规则写进科目页（先确认）。 */
function styleClause(style: TeachingStyle): string {
  return style === "default" ? "" : `，默认讲解风格「${STYLE_NAMES[style]}」（按 course 的讲解偏好写进科目页，先问我确认）`;
}
```

3. 第 83、91 行两处 `，讲解风格「${STYLE_NAMES[request.style]}」。` 都改成 `${styleClause(request.style)}。`。
4. 对应测试（`course-prompts.test.ts`，若存在）：`style: "default"` 时提示词不含「讲解风格」；`style: "deep"` 时含「默认讲解风格「深度」」。

## 第 10 步 皮肤里的默认值

- `skins/bare/progress-panel.tsx:47`、`skins/bear/progress-panel.tsx:154`、`skins/chicago/progress-panel.tsx:54`：`useState<TeachingStyle>("plain")` → `("default")`。
- `skins/bare/progress-panel.tsx:266`、`skins/bear/progress-panel.tsx:418`、`skins/bear/plan-progress.tsx:180`、`skins/chicago/progress-panel.tsx:314`：`?? "plain"` → `?? "default"`。
- 各皮肤的风格菜单都遍历 `TEACHING_STYLE_LABELS`，会自动多出「默认」，不用改。
- `src/renderer/core/README.md` 第 14 行改为：`style.ts`：`resolveStyle` 等 —— 当天内存里的风格选择（按课程 / 自由对话），未选即「默认」，不保存。

## 第 11 步 其他测试

`npm test` 里因删字段而失败的测试（如 `use-settings.test.ts`）只删除/改写对 `courseStyles`、`sessionStyle` 的断言，不改被测逻辑。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test 2>&1 | tail -6 && npm run build 2>&1 | tail -3
cd /Users/gjy/pi-learning/xuegen/apps/desktop && wc -l src/renderer/App.tsx
cd /Users/gjy/pi-learning/xuegen/apps/desktop && grep -rn "courseStyles\|sessionStyle" src/shared src/main
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：四个 npm 命令都通过；`App.tsx` ≤ 450；`src/shared`、`src/main` 里不再有 `courseStyles`/`sessionStyle`；`git status` 只多出本批的文件（其他已有改动是 Claude 的，不要动）。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离之处及原因、未完成项，附验收命令输出。
