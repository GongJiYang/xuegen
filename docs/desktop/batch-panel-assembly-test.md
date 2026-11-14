# batch-panel-assembly-test（DeepSeek，约 15 分钟，只写测试）：总控面板组装处的回归测试

## 背景（v0.12.0 用户报：总控面板「本月」什么都不显示）
根因在组装处 `apps/desktop/src/renderer/core/board/use-control-planbook.ts`：`panelProps.month` 曾写死为 `null`；右块的周用的是面板自己的「这一周」，不跟 ‹ › 翻页；今日卡只在 `view === "day"` 时显示，切到周 / 月就消失。Claude 已修（`month: props.month`、`week: props.week ?? panel.week`、`panelShowCard`、`shownDay` / `onBackToToday`、`use-control-plan.ts` 默认 `"week"`）。已有的单测只测了 `ControlPanel` 组件拿到数据会画、`useControlPlan` 的翻页，**没有一条测组装处**，所以没抓到。

## 要写
新建 `apps/desktop/src/renderer/core/board/use-control-planbook.test.tsx`，照 `use-control-plan.test.tsx` 的写法（假 client、`settle()`、`XUEGEN_TODAY` 式固定日期、`renderHook` 或捕获组件）。构造 `useControlPlanbook` 的最小输入（看它的 `ControlPlanbookInput`，各资源用现有测试里的假 `BoardResource` 写法；`control.isControl = true`）。断言：
1. 初始：`panelProps.view === "week"`、`panelProps.week` 非 null、`panelShowCard === true`（`card` 非 null 时）。
2. `panelProps.onView("month")` 后数据到齐：`panelProps.month` 非 null 且长度 = 当月天数；`panelShowCard` 仍为 true。
3. 周视图 `onNext()` 后数据到齐：`panelProps.week.start` 是下一周的起始日（不是本周）。
4. `onOpenDay("<本周另一天>")` 后：`panelProps.shownToday === false`、`panelShowCard === false`、`panelProps.day.date` 为那天；`onBackToToday()` 后恢复 true / true / 今天。

先在 `git stash` 不可用的前提下这样确认测试有效：把 `use-control-planbook.ts` 里 `month: props.month` 临时改回 `month: null`，跑新测试应失败（报告里贴失败输出），再改回。

## 不许做
- 只新建这一个测试文件（第 3 步的临时改动必须改回，报告里贴 `git diff --stat src/renderer/core/board/use-control-planbook.ts` 证明与开始时一致）；不改实现；不加依赖；不 commit / push；**自己做完，不要调用别的 agent**。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npx vitest run src/renderer/core/board/use-control-planbook.test.tsx && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
新测试的用例名；临时改回 null 时的失败输出；验收输出；偏离之处。
