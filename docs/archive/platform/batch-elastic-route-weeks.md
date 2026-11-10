# 任务单：周期推迟后路线结束日与周格子跟着走（DeepSeek，约 15 分钟，先写测试）

背景：`skills/cycle-plan/cycle.mjs` 刚加了「固定 7 周学时、不固定日期」——主项课没学会整体顺延，`loadElasticCycles` 推算周期实际起止，`shiftRoute` 把路线表的行平移。两处没跟上（用户 2026-11-10 定：周格子跟实际周数走）：
1. `shiftRoute` 只平移了行，路线顶层 `end`（总进度顶部「预计结束」、`weeksLeft` 由它算）还是计划值。
2. 桌面总进度的路线时间轴 `weekStates` 写死每个周期 7 格，推迟到 W8 时「当前周」卡在第 7 格。

只改 4 个文件：`skills/cycle-plan/cycle.mjs`、`skills/cycle-plan/cycle.test.mjs`、`apps/desktop/src/renderer/core/board/plan-view.ts`、`apps/desktop/src/renderer/core/board/plan-view.test.ts`。不改样式、文案、组件；不碰 `~/.xuegen`、真实库；不启动 Electron；不提交。

## 先写测试
1. `cycle.test.mjs`：`shiftRoute`——最后一个有周期页的周期 `delayDays = 5` 时，返回值的 `end` 比入参 `end` 晚 5 天，并多 `plannedEnd`（入参原值）；`delayDays` 全为 0 时 `end` 不变。再用现有端到端临时库（主项最后一节 12-29 那个）断言 `overview --json` 的 `route.end` 比路线页 frontmatter `end` 晚 5 天、`route.weeksLeft` 按新的 `end` 计算。
2. `plan-view.test.ts`：`routeView` 里一个周期 `start 2026-11-06`、`end 2026-12-29`（56 天，跨 8 个日历周）、today `2026-12-27` → 该段 `weeks` 长 8、第 8 格是 `"now"`、前 7 格 `"done"`；`end 2026-12-24`（49 天）的周期仍是 7 格（锁住现有行为）；`state === "done"` / `"plan"` 的段也按自己的周数出格子。

## 再改
1. `cycle.mjs` 的 `shiftRoute`：遍历完行之后，用最后一次得到的 `delay`（即最后一个有周期页的周期的 `delayDays`；后面的行也用同一个值）算 `end: addDays(route.end, delay)`，返回 `{ ...route, plannedEnd: route.end, end, rows }`。`start`、`bufferWeeks` 不变。JSDoc 补一句「顶层 end 同样平移」。
2. `plan-view.ts`：`weekStates(state, start, today)` 改为 `weekStates(state, start, end, today)`，格数 `const count = Math.max(1, Math.ceil((daysBetween(start, end) + 1) / 7));`，把三处 `7` 换成 `count`（`Math.min(7, …)` → `Math.min(count, …)`）；调用处传 `cycle.end`。第 41 行注释「`weeks` has 7 cells」改成「`weeks` has one cell per calendar week of the cycle (7, or more when it ran late)」。

## 验收
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/cycle-plan/cycle.test.mjs && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
```
贴最后几行；报告改了哪些行、新增测试条数。
