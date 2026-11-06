# 批次 CI-1：开课即时提示（上次学到这里 · 这次从这里开始）

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/skins/chicago.md`。

## 背景
点「开始学习」/「继续学习」后，学根要先读文件，约 100 秒后才有第一句输出，用户在这段时间什么也看不到。课程看板里已经有足够的数据（`CourseSummary`），可以在点击的瞬间、不经过模型，就在对话里显示一张本地卡片。

## 范围
A. 本地开课卡片（主要工作）。B. 开课请求里写明课程文件路径，减少学根找文件的时间。
不做：进度颗粒度的改动、提醒/通知、任何 `shared/protocol.ts` 的 `ChatMessage` 改动（卡片是渲染进程的本地状态，不进会话记录）。

## A. 本地开课卡片

### 纯函数（必须测试）：`renderer/core/board/course-intro.ts`
```ts
export interface CourseIntro {
  title: string;
  /** 上次学习日期 `YYYY-MM-DD`（来自 lastRecord.date），没有则 null。 */
  lastDate: string | null;
  /** 本周最后一个已勾选任务的标签，没有则 null。 */
  lastDone: string | null;
  /** 这次从这里开始（nextSession），没有则 null。 */
  next: string | null;
  /** 本周进度。 */
  week: { done: number; total: number };
}
export function courseIntro(course: CourseSummary): CourseIntro;
```
测试：有/无 lastRecord、有/无已勾选任务（取**最后一个** done 的）、nextSession 为 null。

### 状态（hook）：放进 `core/board/use-course-sessions.ts`
- 新状态 `intro: { card: CourseIntro; beforeIndex: number } | null`。`beforeIndex` = 发送开课消息**之前**的 `controller.messages.length`（卡片显示在这次开课的用户消息之前）。
- 设置时机：`handleStudy` / `handleResume`（即「开始学习」「继续学习」）触发时立即设置，**不等** `openSession` 完成；如果切换了会话，在 `openSession` resolve 后把 `beforeIndex` 更新为新会话当时的 `messages.length`（仍在发送前）。
- 清除时机：`handleNewSession`、`handleContinueSession`、`handleNewCourse`、切到另一门课（会被新卡片替换）。「改计划」不显示卡片。
- 不能在 effect 里同步 setState（项目 lint 规则）。
- 这需要 `useCourseSessions` 能拿到 `CourseSummary`（handleStudy/handleResume 现在在 App 里，可一并移入 hook，入参传 `course` 或 `resume`）。App.tsx 仍须 ≤ 450 行。

### 契约与皮肤
- `skins/contract.ts`：`ThreadProps` 增加 `intro: { card: CourseIntro; beforeIndex: number } | null`，以及新插槽 `CourseIntroCard`（props: `{ card: CourseIntro }`）加入 `SkinSlots`（或现有放消息相关插槽的位置，照现有组织方式）。
- 皮肤的 Thread 在第 `beforeIndex` 条消息之前渲染 `CourseIntroCard`；`beforeIndex >= messages.length` 时渲染在末尾（此时还没有用户消息）。
- **bare 与 chicago 都实现**；画廊 `gallery/` 补样例（有完整数据、全部为 null 两种）。
- 卡片内容（文案全部进 `core/strings.ts`，新建 `intro` 分组）：
  - 标题行：`{title}`
  - `上次学到这里：{lastDone}（{lastDate}）`；只有日期时 `上次学习：{lastDate}`；都没有时 `第一次学这门课`
  - `这次从这里开始：{next}`；没有时 `这次从这里开始：由学根根据课程文件决定`
  - `本周 {done}/{total}`
- Chicago：两色、12px，沿用现有的框线样式（参照「接着上次」卡片 / `chicago-inbox` 的虚线框），不新增颜色与字号；不加动效以外的装饰，出现时可用 `useMotion("appear", …)`。

## B. 开课请求写明课程文件
- `core/today.ts` 的 `studyPrompt(course)`、`resumePrompt(resume)`：在现有文本后追加 `（课程文件：wiki/courses/{slug}.md，下次起点以此为准，不必先列目录或读看板）`。更新 `today.test.ts`。
- 先确认 slug 与文件名一致（看 `main/data/` 里读取课程的代码：课程列表是怎么由 `wiki/courses/*.md` 得到 slug 的）；若不一致，用实际文件名并在报告里说明。

## 验收（你必须自己跑，全部通过才算完成）
`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。`wc -l apps/desktop/src/renderer/App.tsx` ≤ 450。

## 禁止
- 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 git commit/push，不加依赖。
- 不放宽 eslint 规则、不加 `eslint-disable`。

## 结束时
输出：改了哪些文件、偏离规格之处及原因、六条命令结果（贴最后几行）、App.tsx 行数。
