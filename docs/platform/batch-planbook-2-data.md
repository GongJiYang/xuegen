# batch-planbook-2-data（Devin，约 1.5 小时，先写测试）：周计划本的数据汇总（不做界面）

背景：`docs/platform/PLANBOOK-1111.md`（用户 11-11 批准的设计稿 `/Users/gjy/pi-learning/design/animate/src/plan2.jsx`，`http://localhost:5181/?d=plan2`，先打开看「1 周计划本」「2 日」「3 月」三屏）。这一批只做**数据**：一个纯函数把现有数据汇总成周 / 日 / 月视图要显示的东西，加一个取数 hook。**不改任何界面组件、不加文案到界面**（文案放 `strings.ts` 的新 `planbook` 一节，界面批再用）。

约束：不加依赖；不 commit / push；**自己做完，不要调用别的 agent**。取「今天」一律用 `renderer/core/today.ts` 的 `now()` / `todayKey()`（见 `apps/desktop/AGENTS.md` §12）。另一个 agent 可能同时在 `renderer/core/board/consistency.test.ts` 写测试，不要碰那个文件。

## 1. 书房按日期范围给出每段的日子（`skills/reading/bookshelf.mjs`）
1. `list` 命令加可选 `--from YYYY-MM-DD --to YYYY-MM-DD`：给了时，每本书的 item 多一个 `schedule: [{ index, date, title, from, to, done }]`——取 `planRows(page, today).rows` 里 `from ≤ date ≤ to` 的行，`done = index <= position`。排队书（`status: queued`）用 `queueEnds` 串接的起点推算日期（照 `queueEnds` 的算法：起点 = 前一本预计读完的次日，每天一段）；读完的书只给已读的行。没给 `--from/--to` 时输出与现在**完全相同**（不出现 `schedule` 键）。坏日期 → `fail`。
2. 测试：在读书（含已读几段、晚了几天）、排队书、读完的书、范围外为空、不给参数时无 `schedule`。

## 2. 主进程与协议
3. `shared/data-protocol.ts`：`ShelfListItem` 加可选 `schedule?: { index: number; date: string; title: string; from: number; to: number; done: boolean }[]`；`shelf.list` 请求加可选 `from?: string; to?: string`。
4. `main/data/handler.ts` 的 `shelf.list`：请求带 `from`/`to` 时传 `--from --to`。补 handler 测试。

## 3. 汇总纯函数 `renderer/core/board/planbook.ts`
5. 类型（导出）：
```ts
export type PlanLane = "main" | "after" | "guide" | "self";
export type PlanMark = "done" | "now" | "plan" | "warn";   // ✓ / ● / ○ / !
export interface PlanItem { lane: PlanLane; text: string; mark: PlanMark; slug: string | null; id: string | null; }
export interface PlanDay { date: string; weekday: string; type: CycleDayType | null; isToday: boolean; items: PlanItem[]; ankiDue: number | null; }
export interface PlanWeek { cycle: string | null; week: number | null; start: string; end: string; days: PlanDay[];
  goals: { course: string; label: string; done: boolean }[]; overdue: { course: string; name: string; count: number }[]; }
```
6. `buildWeek(input)`，输入：`today`、`cycleMonths: CycleMonth[]`（覆盖这一周可能跨两个月）、`calendarMonths: CalendarMonth[]`（讲后读在 `readingDue`）、`shelf: ShelfListItem[]`（带 `schedule`）、`overview: CycleOverview | null`、`courses: CourseSummary[]`、`anki: AnkiStatus | null`。规则：
   - **一周的范围**：今天所在周期的周（周期页定的起始星期，C1 是周五到周四）：从 `CycleMonth.days[today].week` 与周期 `start` 推出 7 天；不在周期内时用今天所在的周一到周日。
   - **主项 / 带读**：`CycleMonth.lessons[date]` 每节课：`roles[course] === "aux"` → lane `guide`，否则 `main`；text = `` `${names[course]} ${id} · ${content}` ``（带读前面不加前缀，lane 已表达）；mark：`done` → `done`；否则 date < today → `warn`；date == today → `now`；之后 → `plan`。
   - **讲后读**：`CalendarMonth.days[date].readingDue` 里 slug 含 `#讲后读-` 的项 → lane `after`，text 用 title 去掉开头的「讲后读 · 」；mark 同上规则（readingDue 只含未打勾的，所以没有 done）。
   - **自读**：`shelf[].schedule` 每行 → lane `self`，text = `` `${short} ${title} pp.${from}–${to}` ``；mark：done → `done`，否则按日期同上。
   - **Anki**：只给今天：`ankiDue = ankiDueCount(anki)`（复用 `cycle-today.ts` 的函数）；别的天和 Anki 没开都是 null。**不标没刷、不算过去几天**（用户 11-11 定）。
   - **本周目标**：`courses` 里 role 为 main 的课，`week.tasks` 中 label 含「周核实」的项 → goals。
   - **没学合并**：每门课 date < today 且没 done 的新课次按课程合并 → `overdue: [{ course, name, count }]`（今日卡以后用它代替逐条列出；场景走查 12-28 发现）。
7. `buildDay(input, date)`：返回那一天的 `PlanDay`（复用 buildWeek 的逐天逻辑）。`buildMonth(input, month)`：返回该月每天的 `PlanDay[]`（自读行省略，只留 main / guide，月视图只看这两行——设计稿第 3 屏）。
8. 测试 `planbook.test.ts`：用 11-11 真实数据造夹具（C1 周模板周五起；离散 D3 11-11 已完成；CTM D1 11-12；C 语言 D1 11-11 带读未完成；数据结构 D1 11-12；三条讲后读：11-10 过期、11-12 两条；Epp 自读 11-09 起、position 0）：
   - 周范围 11-06…11-12；11-11 离散 D3 `done`；C 语言 D1 11-11 `now`；11-10 讲后读 `warn`；
   - 11-09、11-10 的 Epp 自读段是 `warn`（没读），11-11 那段 `now`；
   - Anki 只有 11-11 有数；
   - overdue 合并：离散 D2 一类场景下 count 正确；
   - 跨月一周（如 11-27…12-03）两个月数据拼得上；
   - 不在周期内的日期退回周一到周日。

## 4. 取数 hook（不接界面）`renderer/core/board/use-planbook.ts`
9. `usePlanbook(view: "day" | "week" | "month", anchor: string)`：按需请求 `cycle.month`（一或两个月）、`calendar.month`、`shelf.list`（带 `from`/`to`）、`cycle.overview`、`courses.list`、`anki.status`，组装输入后调第 3 部分的函数，返回 `{ status, value }`（照现有 `use-shelf.ts` / `use-cycle` 的 AsyncState 写法）。加一条用假 client 的测试。

## 5. 文案
10. `strings.ts` 新增 `planbook` 一节，只放设计稿里会出现的固定文字（视图名「日 / 周 / 月」、行名「主项课 / 讲后读 / 带读 / 自读 / Anki」、行副标「周期排期 / 书房 / 提醒」、图例、「本周目标 · 来自两门主项课的周核实」「本周复盘 · 周五整合日填写」、`overdueRow(name, n)` = `` `${name} ${n} 节没学 · 开课时会顺延` ``）。用词闸门（`npm test` 末尾的 `lint-wording`）必须是 0 处。

## 这批的事实还在哪些地方显示（新流程要求）
课次完成、Anki 张数、讲后读文字、自读段、带读叫法：今日卡（control-card）、右侧今天面板（cycle-today）、总进度（plan-view）、日历当天详情。planbook 的规则必须与它们一致（同一份数据、同一个 `ankiDueCount`）；报告里逐项写「一致 / 不同（原因）」。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -3
cd apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
每部分改了哪些文件；先失败的测试输出；验收输出；一致性逐项；拿不准的地方。
