# board — 看板视图模型（第 2 批）

课程、阅读、卡片、日历、技能的视图模型与控制器。全部经 `core/client.ts` 的 `xuegen:data` 动作取数；加载中 / 出错 / 空 三态用 `AsyncState` 显式建模（`state.ts`）。不含任何样式。

| 文件 | 职责 |
|---|---|
| `state.ts` | `AsyncState<T>`（loading / error / ready）与纯辅助（`valueOf`、`isEmptyList`、`errorState`）。 |
| `use-resource.ts` | 通用加载原语 `useBoardResource`：加载、重载、写入后刷新，含竞态与卸载取消。 |
| `use-courses.ts` | `courses.list`（只读进度）。 |
| `use-course-sessions.ts` | `resolveActiveCourse` 纯函数 + `useActiveCourse` / `useCourseSessions`：分课会话、开始学习、新建与改计划、认领新课程。 |
| `use-reload-on-answer.ts` | 流式 true → false 时刷新各面板（`useReloadOnAnswer`）。 |
| `use-skills-panel.ts` | 技能面板的获取结果与待审阅状态（`useSkillsPanel`）。 |
| `use-reading.ts` | `reading.today` / `reading.stats` / `reading.sources` + 加入、复习；`isWebUrl`、`clipPrompt` 纯函数。 |
| `use-cards.ts` | `cards.stats` + 存卡；`useAnki` 只读 AnkiConnect 状态。 |
| `use-calendar.ts` | `calendar.month` + 翻月、选日、写笔记；`monthGrid`、`shiftMonth`、`dayMarks`、`dayOf` 为纯函数。 |
| `use-skills.ts` | `skills.list` + 开关、获取。 |

写入动作（加入阅读、读完、存为新卡、写日历、技能开关）成功后刷新相关数据；失败结果返回给调用方由 `App` 呈现 Notice。日历网格、命令表等纯逻辑均有同目录 `*.test.ts`。
