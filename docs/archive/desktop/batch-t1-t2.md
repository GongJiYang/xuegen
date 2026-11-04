# 批次 T1+T2：新课程/改计划界面 + 答完后刷新侧边面板

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/HANDOFF-2026-11-04.md`（T1、T2 两节是本批的完整规格，按它做）。

## 范围
只做 HANDOFF 里的 T2 和 T1，先 T2 后 T1。不要动 T3（缩放）相关代码，不要改 `src/main/`。

## T2 要点
- `App.tsx`：`controller.streaming` 从 true 变 false 时调用 `courses.reload()`、`reading.reload()`、`cards.reload()`、`calendar.resource.reload()`（先确认这些 hook 都有 `reload`，没有就补）。
- 不能在 effect 里同步 setState（项目 lint 规则）；可以用「渲染期比较上一次 streaming」的写法，或在 effect 里只调用 reload（reload 本身是异步加载）。
- 保证现有测试不坏。

## T1 要点
- 契约 `skins/contract.ts` 的 `ProgressPanelProps` 加 `onNewCourse(request: NewCourseRequest)`、`onEditPlan(course, change)`、`sources: AsyncState<ReadingSource[]>`。`NewCourseRequest` 已在 `core/board/course-prompts.ts`。
- Chicago `skins/chicago/progress-panel.tsx` 与 bare `skins/bare/panels.tsx` 都要实现；`gallery/panel-samples.ts` 补样例。表单字段：课程名（必填，空则「建课」按钮禁用）、资料（文本框 + 来自 sources 的候选可点选填入）、每天时长 30/45/60/90（默认 45）、开始日期（默认今天，本地时区 YYYY-MM-DD）、风格单选（默认 plain）。每门课「开始学习」旁加「改计划」→ 一行输入 +「提交」（空时禁用）。提交后收起表单。
- 所有界面文案放 `core/strings.ts` 的 `progress`。Chicago 只用两色、复用现有 `chicago-*` 类与 `Field`、`RadioGroup` 组件；不新增颜色、不新增字号。
- App：
  - `onEditPlan` → `handleStartSession(course.slug, editPlanPrompt(course.title, change))`。
  - `onNewCourse` → `await controller.openSession(null)` 得到新会话文件；记下建课前已有的课程 slug 集合；`controller.send(newCoursePrompt(req))`。之后课程列表刷新（T2）出现**新 slug** 时：`courseSessions[新slug] = 该会话文件`、`courseStyles[新slug] = req.style`，并设为当前课程。只认领一次；出现多个新 slug 时取第一个。
  - 把「找新 slug」写成纯函数放在 `core/board/`（例如 `findNewCourseSlug(before: string[], after: CourseSummary[]): string | null`）并写测试。

## 验收（你必须自己跑，全部通过才算完成）
在 `apps/desktop` 下：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。在仓库根：`npm test`、`npm run lint:skills`。

## 禁止
- 不要读写 `~/.xuegen/`，不要碰 Obsidian 库。不要 git commit/push。不要启动 Electron。
- 不要改与本批无关的文件。

## 结束时
输出：改了哪些文件、每项怎么实现的、六条检查命令的结果（贴最后几行）。
