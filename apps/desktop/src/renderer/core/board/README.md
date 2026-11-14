# board — 看板视图模型（第 2 批）

课程、阅读、卡片、日历、技能的视图模型与控制器。全部经 `core/client.ts` 的 `xuegen:data` 动作取数；加载中 / 出错 / 空 三态用 `AsyncState` 显式建模（`state.ts`）。不含任何样式。

| 文件 | 职责 |
|---|---|
| `state.ts` | `AsyncState<T>`（loading / error / ready）与纯辅助（`valueOf`、`isEmptyList`、`errorState`）。 |
| `use-resource.ts` | 通用加载原语 `useBoardResource`：加载、后台重载（已有 ready 值时继续显示旧值，完成后再换）、写入后刷新，含竞态与卸载取消。 |
| `use-courses.ts` | `courses.list`（只读进度）。 |
| `course-intro.ts` | 开课卡片：`courseIntro` 从 `CourseSummary` 取上次任务/日期/下次起点/本周进度，`courseIntroLines` 生成三行文案。 |
| `opening-action.ts` | `openingAction` 纯函数：今天已开课且非当前课 → 只切会话；已是当前课 → 只聚焦；否则发送开课消息。`startedTodayMap` 供按钮文案使用。 |
| `use-course-sessions.ts` | `resolveActiveCourse` 纯函数 + `useActiveCourse` / `useCourseSessions`：分课会话、开始学习/回到这门课/继续学习（含本地开课卡片与 `courseStartedOn`）、新建与改计划、认领新课程。每个会话打开时带出它的 `SessionRole`（开课 / 回到这门课 = `course`，新建课程 = `control`，见 `useChat.openSession`），交给 agent 的工具层权限拦截。今天已开课但会话里学根还没答过内容时，「开课」会重新发开课指令（开课失败不再锁死当天）。 |
| `use-reload-on-answer.ts` | 流式 true → false 时刷新各面板（`useReloadOnAnswer`）；窗口获得焦点与过零点也刷新（`useReloadOnFocusAndDay`，焦点 5 秒一次上限）。 |
| `use-board-reload.ts` | `useBoardReload`：把上述三个时机接到一组 `reload()` 资源上。 |
| `session-freshness.ts` | 纯函数：从会话文件名解析创建日（`sessionDay`）、旧课程会话判断（`staleCourseSession`）、是否开新会话（`startsFresh`）、下条消息是否带「先重读」（`needsRefresh`）、存档阶段（`checkpointPhase`，60% 起提示）。 |
| `use-session-freshness.ts` | `useSessionFreshness`：旧课程会话给「开今天的课」提示；课程页更新或本次运行未见过时给下条消息加 `chat.refreshNote`；上下文到 60% 提示「先存档」，存档答完后提示开新会话接着上。 |
| `session-list.ts` | 纯函数：`sessionGroups` 把主进程给的 `SessionMeta` 折成按天分组的行（总控 / 课程 / 自由；课程标题「课次 + 内容」，自由会话用第一句话）；`roleOfRow` 把行翻成打开会话时的 `SessionRole`（认不出的一律 `free`）。 |
| `use-session-list.ts` | `useSessionList`：每个会话文件拉一次 `sessions.list`、打开列表时再拉一次；返回 `SessionsView` 与 `requestOpen`（`⋯` 菜单、`/会话列表` 用）。 |
| `use-skills-panel.ts` | 技能面板的获取结果与待审阅状态（`useSkillsPanel`）。 |
| `use-reading.ts` | `reading.today` / `reading.stats` / `reading.sources` + 加入、复习；`isWebUrl`、`clipPrompt` 纯函数。 |
| `use-shelf.ts` | `shelf.today` / `shelf.list` + 写完一段（`shelf.done`）、存摘录（`shelf.extract`），供今日卡的书房行用。 |
| `shelf-view.ts` | `shelfPanel` 纯函数：`shelf.list` → 阅读面板的书房一节视图（在读 planned/free、排队预计读完、摘录待做卡数）。 |
| `use-cards.ts` | `cards.stats` + 存卡；`useAnki` 只读 AnkiConnect 状态。 |
| `use-calendar.ts` | `calendar.month` + 翻月、选日、写笔记；`monthGrid`、`shiftMonth`、`dayMarks`、`dayOf` 为纯函数。 |
| `use-skills.ts` | `skills.list` + 开关、获取。 |
| `cycle-today.ts` | 把一天的周期数据（cycle.day）变成「今天」窗口的标题、主攻块、没学的课、明天一行（纯函数）；`mergeOverdue` 是今日卡 / 右侧面板 / 排程本三处共用的「没学」按课程合并。 |
| `use-cycle.ts` | 读今天、明天的 cycle.day 和日历当月的 cycle.month。 |
| `progress-groups.ts` | 把科目骨架（subjects.list）和课程列表组合成总进度的主项 / 路线外 / 已学专题，并给课程打记号（纯函数）。 |
| `use-subjects.ts` | 读当天的 subjects.list。 |
| `default-style.ts` | `defaultStyleLabel` 纯函数：活动课程的科目页写了默认风格时「默认」单选显示「默认 · X」。 |
| `control-card.ts` | `controlCard` 纯函数：周期日 + 日历讲后读 + 书房行 + 阅读队列 → 总控今日卡的行（本地数据，不调模型）；「没学」用 `mergeOverdue` 一门课一行。按三组抽成 `lessonGroup` / `readGroup` / `reviewRows`，只负责拼行；`afterReadTitle` 与 `control-card-pending.ts` 的名字在此再导出。 |
| `control-card-rows.ts` | 今日卡的阅读行：讲后读标题解析与「课后读」行（`afterReadEntry`、`afterReadTitle`）、`readingDue`、书房行（`bookRow`、`shelfRows`）。 |
| `control-card-pending.ts` | 今日卡的行后处理：「读完了」/「读完这段」的十秒撤销窗口（`withPendingRead`、`withPendingShelf`）、`withExtractCount` 摘句计数、`parsePageInput` 页码解析。 |
| `consistency-fixture.ts` / `consistency.test.ts` | 跨处一致性夹具与测试：同一天的数据（`CycleDay` / `CycleMonth` / `CycleOverview` / `AnkiStatus` / `ShelfToday` / 日历月）同时喂给今日卡、右侧今天面板、总进度、日历当天详情的视图函数，断言完成状态、Anki 张数、讲后读文字、带读叫法四处一致（`CHECK-PROCESS-1111.md` 第 2 项）。 |
| `use-control-card.ts` | `useControlCard`：今日卡 props；行按钮走「今天」窗口的同一组动作；「读完了」写 `course.afterRead` 后刷新课程与日历；「读完这段」（10 秒可撤销）写 `shelf.done`；摘几句写 `shelf.extract`。 |
| `planbook.ts` | 周计划本（PLANBOOK-1111）纯函数：`buildWeek` / `buildDay` / `buildMonth`——把周期课次、日历讲后读、书房 schedule、Anki 张数合成日 / 周 / 月视图模型（lane / mark / short / goals / overdue / reviewDate）；逐日格子的条目函数在 `planbook-items.ts`。 |
| `planbook-items.ts` | 计划本的逐日条目：`markOf`、`lessonItems`、`afterReadItems`、`selfItemsByDate`、`verifyItems`、`mainCourseSlugs`、`weekGoals`、`missedLessons`（纯函数，`planbook.ts` 的 `planDay` 用）。 |
| `planbook-range.ts` | 计划本的日历计算：`planWeekRange`（周期周，C1 周五起；出周期退回周一–周日）/ `addDays` / `weekdayOf` / `mondayIndex` / `slotOf`，供 `planbook.ts` 与 `planbook-nav.ts` 复用（`planbook.ts` 原样再导出）。 |
| `planbook-nav.ts` | 排程本翻页与标题纯函数：`PlanView` / `shiftAnchor`（日 ±1、周 ±7、月到上/下月 1 日）/ `rangeLabel`（「11-11 周三」「C1 W1 · 11-06 – 11-12」「2026 年 11 月」）/ `isTodayInView`（「今天」按钮置灰）。 |
| `use-planbook.ts` | `usePlanbook(view, anchor, enabled)`：按视图拉 `cycle.month`（一或两个月）、`calendar.month`、带 `from`/`to` 的 `shelf.list`、`cycle.overview`、`courses.list`、`anki.status`，组装 `PlanbookInput` 调 `planbook.ts`；`enabled` false 不发请求。 |
| `use-control-plan.ts` | `useControlPlan`：总控的周计划本组装 hook——今日卡（含「更早的对话」折叠行）加日 / 周 / 月视图状态（初值 day + 今天）、‹ › 翻页、「今天」与 `openDay`；非总控会话 card 为 null 且不拉 planbook 数据。 |
| `use-control-session.ts` | `useControlSession`：总控会话开关与 `askBrief`（折叠为「今日简报」）；就绪后本次运行自动落一次总控、不发消息。 |
| `shell-panels.ts` | `shellPanels` 纯函数：把各资源与动作组装成「今天」与五个工具窗的 props（含阅读面板的书房一节）。 |
| `use-shell-panels.ts` | `useShellPanels`：`shellPanels` 调用的参数组装 hook（从 App 拆出控行数）——各 hook 结果进来，`shellPanels` 的 props 出去；另有两个代发指令的纯函数 `verifyMessage`（周核实标记，`use-control-planbook` 也用）与 `draftedCardsMessage`（起草卡片套标记、已带标记不重复套），课程名查 `courseTitleOf`。 |
| `planbook-props.ts` | `planbookProps` 纯函数：`useControlPlan` 的 plan 状态 + `PlanbookResult` → `PlanbookProps`（按视图取 week/day/month，结果视图与当前视图不符时保持 loading；`showCard` = 日视图且锚点是今天）。 |
| `use-control-planbook.ts` | `useControlPlanbook`：总控计划本的整包组装——内部调 `useControlPlan` + `planbookProps`，交出 `{ props, card, showCard }` 供 App 渲染 `Planbook` 槽。 |
| `use-chat-column.ts` | `useChatColumn`：计划本聊天栏开合——宽窗默认开、≤900px 默认关；跨过断点只在用户没手动切过时跟随。 |
| `control-prompts.ts` | 总控面板书房按钮发给总控的话（`addBookPrompt` / `changeModePrompt` / `setTargetPrompt` / `pausePrompt` / `resumePrompt`）：均带 `ask` 动作标记（折叠为「交给总控 · 短名」），末行固定为 `strings.panel.askConfirm`（先给看改动、说可以才写）；正文指明 `/skill:reading` 或 `/skill:course`。 |
| `panel.ts` | 总控面板（PANEL-PLAN）纯函数：`panelTiles` 六个状态格（周期 / 今天 / 本周 / 书房 / Anki / 卡片，null 输入出加载态）、`shelfRows` 书房行（在读 → 带读 → 暂停 → 排队）、`unplannedMaterials` 未排计划资料；今天 / 本周 / Anki 张数复用 `buildDay` / `buildWeek` / `ankiDueCount`。 |

写入动作（加入阅读、读完、存为新卡、写日历、技能开关）成功后刷新相关数据；失败结果返回给调用方由 `App` 呈现 Notice。日历网格、命令表等纯逻辑均有同目录 `*.test.ts`。
