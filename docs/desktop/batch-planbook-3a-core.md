# batch-planbook-3a-core（Devin，约 1 小时）：周计划本界面的核心层（不碰皮肤）

## 硬约束（先读，压缩后也要记得）
- 先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/platform/PLANBOOK-1111.md`。设计稿：`/Users/gjy/pi-learning/design/animate/src/plan2.jsx`（浏览器 `http://localhost:5181/?d=plan2`）。
- 决策逻辑放 `renderer/core/board/*.ts`，纯函数、同名 `.test.ts`、不读时间 / 环境 / 全局（「今天」由调用方传入；hook 里取今天用 `core/today.ts` 的 `todayKey()`）。
- 文案只进 `strings.ts`；不碰 `skins/**`、`skins/contract.ts`、`App.tsx`（3b 再动）。
- 不读写 `~/.xuegen/`、不碰库、不启动 Electron、不 commit / push、不加依赖；不放宽 eslint、不加 `eslint-disable` / `@ts-ignore`。
- `npm test` 末尾的 `lint-wording` 必须 0 处。

## 范围
做：翻页与标题的纯函数；把今日卡（control-card）的「没学」按课程合并（与 planbook 共用同一个函数）；一个把 planbook 数据和今日卡组装好的 hook；文案。
不做：任何组件、样式、契约、App.tsx；时间格（批 6）；总进度 / 书房 / 加书（批 4）；开下一周期（批 5）。

## 1. 共用的「没学」合并
1. `renderer/core/board/planbook.ts` 已有合并 overdue 的逻辑：抽成导出的纯函数 `mergeOverdue(overdue: { course: string; id: string; date: string }[], names: Record<string, string>): { course: string; name: string; count: number; first: string }[]`（`first` = 最早那节的日期；按 `first` 升序）。`buildWeek` 改调它，行为不变（现有测试照过）。
2. `renderer/core/board/control-card.ts`：现在 `for (const lesson of day.overdue)` 逐条推「没学（原定 …）」行。改为：调 `mergeOverdue(day.overdue, day.names)`，每门课一行：
   - 只有 1 节时文字保持现在的 `card.missedRow(name, id, date)`（不变）；
   - ≥ 2 节时用新文案 `card.missedMany(name, count, first)` = `` `${name} ${count} 节没学（最早 ${first.slice(5)}）· 开课时会顺延` ``；
   - mark `warn`、按钮 `开课 →`、action `study` 该课，均不变。
   测试：1 节一行原样；同课 3 节 → 一行「3 节没学（最早 11-11）」；两门课各自一行、按最早日期排序。
   **这件事还在哪些地方显示**：右侧今天面板（`cycle-today.ts` 的 overdue）也逐条列——同样改成用 `mergeOverdue`，测试同上一条。planbook 的 `overdue` 已是合并的。三处在 `consistency.test.ts` 加一条断言：同一份 overdue，今日卡、右侧面板、planbook 的「课程 → 节数」一致。

## 2. 翻页与标题 `renderer/core/board/planbook-nav.ts`
3. 导出：
   - `type PlanView = "day" | "week" | "month"`；
   - `shiftAnchor(view, anchor: string, dir: -1 | 1): string`——day ±1 天；week ±7 天；month 到上 / 下个月的 1 日；
   - `rangeLabel(view, anchor: string, week: PlanWeek | null): string`——day：`11-11 周三`；week：有周期时 `C1 W1 · 11-06 – 11-12`，否则 `11-09 – 11-15`；month：`2026 年 11 月`（全部文字经 `strings.planbook`）；
   - `isTodayInView(view, anchor, today, week): boolean`（「今天」按钮是否可点：已在包含今天的范围里时为 false）。
   测试：跨月、跨年、闰年 2 月、week 不在周期内、`isTodayInView` 三种视图。

## 3. 组装 hook `renderer/core/board/use-control-plan.ts`
4. 把 `App.tsx` 里现在的 `useControlCard({...})` 调用和 `older` 的计算**原样**搬进这个 hook（3b 再把 App 改成调它；这一批 App 不动，所以先让 hook 能独立被测试调用）：
   ```ts
   export function useControlPlan(input: ControlCardHookInput & { isControl: boolean; fold: ControlFold }): {
     card: ControlCardProps | null;            // 原 controlCard
     older: { label: string; onToggle(): void } | null;   // 原 older
     plan: { view: PlanView; anchor: string; setView(v: PlanView): void; prev(): void; next(): void; today(): void;
             todayDisabled: boolean; label: string; openDay(date: string): void;
             data: AsyncState<PlanbookResult> };
   }
   ```
   - `view` 初值 `"day"`（Claude 定：打开总控先看到今天能直接操作的清单；待用户确认，改成周只改这一处），`anchor` 初值 `todayKey()`；`openDay(date)` = 切到 day 并把 anchor 设成 date；
   - `data` 来自批 2 的 `usePlanbook(view, anchor)`；
   - `isControl` 为 false 时 `card` 与 `older` 为 null，`plan` 照常返回（不发请求：`usePlanbook` 若不支持「不请求」就加一个 `enabled` 参数）。
   - 类型名以现有代码为准（`ControlCardHookInput`、`ControlFold`、`ControlCardProps` 若名字不同，用实际的）。
5. 测试 `use-control-plan.test.tsx`：假 client；初始 day 视图；`next()` 后 anchor +1 天；切 week 后 label 是周范围；`openDay("2026-11-13")` 后 view=day、anchor=11-13；`isControl=false` 时 card 为 null。

## 4. 文案（`strings.planbook`，已有一节，补齐）
6. 补：`dayLabel(date, weekday)`、`weekLabel(cycle, week, start, end)`、`plainWeekLabel(start, end)`、`monthLabel(y, m)`、`prev: "‹"`、`next: "›"`、`today: "今天"`、`print: "打印"`、`chatShow: "和总控聊"`、`chatHide: "收起聊天"`、`reviewEmpty: (date) => \`${date.slice(5)} 周五整合日时由总控和你一起写\``、`otherDayNote: "这一天只能看，开课、读完等操作在今天的清单里"`、`missedMany`（见第 2 步，放 `control.card` 下）。用词闸门 0 处。

## 验收命令（贴最后几行）
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test 2>&1 | grep -E "Tests |Test Files" && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -2 && npm run lint:skills | tail -1
```

## 结束报告（中文）
改了哪些文件；每步的测试；偏离规格之处及原因；未完成项。
