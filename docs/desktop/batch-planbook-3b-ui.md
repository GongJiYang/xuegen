# batch-planbook-3b-ui（Devin，约 2 小时）：总控周计划本界面（Bear）

## 硬约束（先读，压缩后也要记得）
- 先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`、`docs/platform/PLANBOOK-1111.md`。
- **设计稿是像素权威**：`/Users/gjy/pi-learning/design/animate/src/plan2.jsx` + `plan2.css`（`http://localhost:5181/?d=plan2`）。结构、文字、间距照它；样式只用 Bear 变量（`--gray-*`、`--accent-*`、`--warn-*`、`--done-11`、`--fs-*`/`--lh-*`、`--sp-*`、`--r-*`、`--card`），不写散值（1px 边框、3px 进度条 / 色块边除外，设计稿里就是这样）。设计稿的 `.p2-*` 类改名 `.bear-pb-*`，全部写在 `[data-skin="bear"]` 下。
- 文案只用 `strings.ts`（`strings.planbook`，3a 已补齐；缺的在这里补）；皮肤里不写中文。`npm test` 末尾 `lint-wording` 必须 0 处。
- 只做 Bear；`bare` 与 `chicago` 只补能编译的最小实现（把计划本内容按语义 HTML 平铺，不做视觉）。画廊补 Bear 样例。
- `App.tsx` ≤ 450 行（现在 448）。超了就把 `shellPanels({...})` 那一整段参数组装原样搬进 `renderer/core/board/use-shell-panels.ts`。
- 不读写 `~/.xuegen/`、不碰库、不启动 Electron、不 commit / push、不加依赖；不放宽 eslint、不加 `eslint-disable` / `@ts-ignore`。取「今天」只用 `core/today.ts`。

## 设计稿每一屏：做 / 不做
| 屏 | 本批 |
|---|---|
| 1 周计划本 | **做**（顶栏、目标 / 复盘两栏、周表格五行、图例） |
| 2 日 · 时间格 | **只做左半（今天的清单 + 明天）**；右半时间格 **不做**（批 6） |
| 3 月 | **做** |
| 4 总进度 / 5 书房 / 6 加书 | **不做**（批 4）；顶栏的「总进度」「书房」两个按钮也不做，「课程与计划」按钮保留 |
| 7 最后一周横幅 / 8 开下一周期 | **不做**（批 5） |
| 右侧聊天栏 + 「收起聊天 / 和总控聊」 | **做** |
| 900 宽 | **做**：≤ 900 时聊天栏默认收起 |

## 1. 契约（`skins/contract.ts`）
1. 新类型并加进 `SkinSlots`：
```ts
export interface PlanbookProps {
  view: PlanView;                         // 3a 的类型
  onView(view: PlanView): void;
  label: string; onPrev(): void; onNext(): void; onToday(): void; todayDisabled: boolean; onPrint(): void;
  state: "loading" | "error" | "ready"; error: string | null;
  week: PlanWeek | null;                  // view === "week"
  day: PlanDay | null;                    // view === "day"
  month: PlanDay[] | null;                // view === "month"
  todayCard: React.ReactNode | null;      // 日视图看的是今天时：今日卡（ControlCard 元素，带全部按钮与撤销）
  tomorrow: string | null;                // 日视图底部「明天 …」一行（来自现有 cycle-today 的明天文案）
  onOpenDay(date: string): void;          // 周 / 月格子点一下 → 日视图
}
// SkinSlots: Planbook: ComponentType<PlanbookProps>;
```
2. `ShellProps` 加：`planbook: React.ReactNode | null`（只有总控会话非 null）、`chatOpen: boolean`、`onToggleChat(): void`。

## 2. 核心层
3. 新 hook `renderer/core/board/use-chat-column.ts`：`useChatColumn(): { open: boolean; toggle(): void }`——初值：`window.matchMedia("(max-width: 900px)").matches` 时 false，否则 true；窗口跨过 900 时**只在用户没手动切过**的情况下跟着变。测试：宽窗默认开、窄窗默认关、手动切后不再跟随。
4. `renderer/core/board/planbook-props.ts`（纯函数 + 测试）：`planbookProps(plan, card, tomorrow, today): Omit<PlanbookProps, "todayCard"> & { showCard: boolean }`，把 3a 的 `useControlPlan().plan` 和 `PlanbookResult` 转成上面的 props：`week/day/month` 按 view 取；`showCard = view === "day" && plan.anchor === today`。测试：三种视图各一、日视图非今天 `showCard=false`、loading / error。

## 3. App 组装（`renderer/App.tsx`）
5. 用 3a 的 `useControlPlan` 替换现在的 `useControlCard({...})` 和 `older` 计算（参数原样传入）。
6. 总控会话（`control.isControl`）时：
   - `Thread` 的 `header` 改为 `null`（今日卡移进计划本的日视图）。「更早的对话」折叠条留在聊天里：`ThreadProps`（`contract.ts`）加 `older: { label: string; onToggle(): void } | null`，App 传 `older`；Bear 的 Thread 在消息列表最上面渲染它（按钮，沿用 `control-card.tsx` 第 116–118 行的 `bear-cc-older` 写法和样式）；bare / chicago 的 Thread 同样渲染一个普通按钮。非总控会话传 null。ControlCard 的 `older` 一律传 null。
   - `shellProps.planbook = <Planbook {...planbookProps(...)} todayCard={showCard && card ? <ControlCard {...card} older={null} /> : null} />`；
   - `chatOpen` / `onToggleChat` 来自 `useChatColumn()`。
   非总控会话：`planbook: null`，其余与现在完全一样。
7. 打印：`onPrint` = `window.print()`。

## 4. Bear 外壳（`skins/bear/shell.tsx` + `skin.css`）
8. `planbook` 非 null 时布局：`<main className="bear-col bear-col--plan">` 里两栏——左 `<section className="bear-pb-area">{planbook}</section>`（flex 1，自己滚动，内边距同设计稿 `.p2-book-area`），右 `<aside className="bear-pb-chat" hidden={!chatOpen}>`（宽 340px，`--gray-2` 底，左边线 `--gray-6`），里面放原来的 notices + `children`（Thread + Composer），聊天字号沿用 `--bear-body-size`。
9. 顶栏：`planbook` 非 null 时，在「课程与计划」左边加一个按钮，文字 `chatOpen ? strings.planbook.chatHide : strings.planbook.chatShow`，点了 `onToggleChat`。
10. 抽屉打开时（`data-drawer="open"`）：`.bear-col--plan` 不再用 `padding-right: 380px` 那条规则，改为隐藏 `.bear-pb-chat`（抽屉盖在聊天栏的位置）；关掉抽屉聊天栏回来。
11. 窄窗（`max-width: 900px`）：`.bear-pb-chat` 宽 280px（同设计稿）；日视图两栏变一栏。
12. 打印：`@media print` 下只留 `.bear-pb-area`（隐藏 `.bear-bar`、`.bear-pb-chat`、`.bear-drawer`、计划本顶栏的按钮），背景白、文字黑，周表格不分页断行（`break-inside: avoid`）。

## 5. Bear 计划本组件（`skins/bear/planbook.tsx`，样式进 `skin.css`）
13. 照设计稿 `plan2.jsx`：
   - **顶栏**（`WeekView` 上方那行 `.p2-bar-row`）：日 / 周 / 月分段按钮、范围文字、‹ 今天 ›（「今天」`todayDisabled` 时禁用样式）、右侧「打印」。
   - **周**（`WeekView`）：本周目标 / 本周复盘两栏（目标 = `week.goals`，每条一行；复盘暂无数据时显示 `strings.planbook.reviewEmpty(<本周整合日>)`）；**合并的没学**（`week.overdue` 非空时，在两栏下面、表格上面，每门课一行 `! C 语言 7 节没学 · 开课时会顺延`，warn 色）；表格：左列行名 + 副标（主项课 / 周期排期，讲后读 / 书房，带读 / 书房，自读 / 书房，Anki / 提醒），7 列日子头（`五 11-06` + 类型，今天那列 `--gray-3` 底、日期 `--accent-11`）；格子里每项 = 记号 + 文字（记号：done ✓ `--done-11`，now ● `--accent-11`，plan ○，warn ! `--warn-11`）；休息日格子 `--gray-2` 底；Anki 行只在今天显示 `Anki · 今日 N 张`，别的天淡色「Anki」，休息日空；格子可点 → `onOpenDay(date)`（整个格子是 button 或带 role="button" 且可键盘聚焦）；表格下图例 `strings.planbook.legend`。
   - **日**（`DayView` 左半）：看的是今天 → 渲染 `todayCard`（就是现在的今日卡，按钮与撤销全保留），下面「明天 …」一行；不是今天 → 只读清单（`day.items` 每项一行，同周表格记号）+ `strings.planbook.otherDayNote` 一行小字。
   - **月**（`MonthView`）：7 列，每格日期 + 主项一行 + 带读一行（淡色），今天格 `--gray-3` 底；格子可点 → 日视图；下面脚注 `strings.planbook.monthNote`。
   - 状态：loading 显示 `strings.planbook.loading`（「正在读取…」），error 显示错误文字，都占在表格位置。
   - 键盘：所有按钮、格子 Tab 可达，焦点环 `outline: 2px solid var(--accent-11)`。
14. 组件测试 `skins/bear/planbook.test.tsx`：周视图渲染 5 行 + 7 列、今天列有标记、点格子调 `onOpenDay`；日视图今天渲染传入的 `todayCard`、非今天显示只读清单与说明；月视图今天格；loading / error；`overdue` 行。

## 6. bare / chicago / 画廊
15. `skins/bare/`、`skins/chicago/` 各加最小 `Planbook`（语义 HTML：一个 `<section>`，顶栏按钮 + 当前视图的列表），并让它们的 Shell 在 `planbook` 非 null 时把它放在 `children` 上面（不做两栏）。能编译、现有测试不坏即可。
16. 画廊（`renderer/gallery/`）加 Bear 计划本样例：周、日（今天 / 非今天）、月各一，数据用 `panel-samples.ts` 风格的假数据（照设计稿的 11-06…11-12）。

## 验收命令（贴最后几行）
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test 2>&1 | grep -E "Tests |Test Files" && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -2 && wc -l apps/desktop/src/renderer/App.tsx
```

## 结束报告（中文）
改了哪些文件；偏离设计稿之处（逐条：设计稿是什么、你做成了什么、为什么）；未完成项。
