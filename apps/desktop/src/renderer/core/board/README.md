# board — 看板视图模型（第 2 批）

课程、阅读、卡片、日历、技能的视图模型与控制器。全部经 `core/client.ts` 的 `xuegen:data` 动作取数；加载中 / 出错 / 空 三态用 `AsyncState` 显式建模（`state.ts`）。不含任何样式。

| 文件 | 职责 |
|---|---|
| `state.ts` | `AsyncState<T>`（loading / error / ready）与纯辅助（`valueOf`、`isEmptyList`、`errorState`）。 |
| `use-resource.ts` | 通用加载原语 `useBoardResource`：加载、重载、写入后刷新，含竞态与卸载取消。 |
| `use-courses.ts` | `courses.list`（只读进度）。 |
| `course-intro.ts` | 开课卡片：`courseIntro` 从 `CourseSummary` 取上次任务/日期/下次起点/本周进度，`courseIntroLines` 生成三行文案。 |
| `opening-action.ts` | `openingAction` 纯函数：今天已开课且非当前课 → 只切会话；已是当前课 → 只聚焦；否则发送开课消息。`startedTodayMap` 供按钮文案使用。 |
| `use-course-sessions.ts` | `resolveActiveCourse` 纯函数 + `useActiveCourse` / `useCourseSessions`：分课会话、开始学习/回到这门课/继续学习（含本地开课卡片与 `courseStartedOn`）、新建与改计划、认领新课程。 |
| `use-reload-on-answer.ts` | 流式 true → false 时刷新各面板（`useReloadOnAnswer`）；窗口获得焦点与过零点也刷新（`useReloadOnFocusAndDay`，焦点 5 秒一次上限）。 |
| `use-board-reload.ts` | `useBoardReload`：把上述三个时机接到一组 `reload()` 资源上。 |
| `session-freshness.ts` | 纯函数：从会话文件名解析创建日（`sessionDay`）、旧课程会话判断（`staleCourseSession`）、是否开新会话（`startsFresh`）、下条消息是否带「先重读」（`needsRefresh`）。 |
| `use-session-freshness.ts` | `useSessionFreshness`：旧课程会话给「开今天的课」提示；课程页更新或本次运行未见过时给下条消息加 `chat.refreshNote`。 |
| `use-skills-panel.ts` | 技能面板的获取结果与待审阅状态（`useSkillsPanel`）。 |
| `use-reading.ts` | `reading.today` / `reading.stats` / `reading.sources` + 加入、复习；`isWebUrl`、`clipPrompt` 纯函数。 |
| `use-cards.ts` | `cards.stats` + 存卡；`useAnki` 只读 AnkiConnect 状态。 |
| `use-calendar.ts` | `calendar.month` + 翻月、选日、写笔记；`monthGrid`、`shiftMonth`、`dayMarks`、`dayOf` 为纯函数。 |
| `use-skills.ts` | `skills.list` + 开关、获取。 |
| `cycle-today.ts` | 把一天的周期数据（cycle.day）变成「今天」窗口的标题、主攻块、没学的课、明天一行（纯函数）。 |
| `use-cycle.ts` | 读今天、明天的 cycle.day 和日历当月的 cycle.month。 |
| `progress-groups.ts` | 把科目骨架（subjects.list）和课程列表组合成总进度的主项 / 路线外 / 已学专题，并给课程打记号（纯函数）。 |
| `use-subjects.ts` | 读当天的 subjects.list。 |

写入动作（加入阅读、读完、存为新卡、写日历、技能开关）成功后刷新相关数据；失败结果返回给调用方由 `App` 呈现 Notice。日历网格、命令表等纯逻辑均有同目录 `*.test.ts`。
