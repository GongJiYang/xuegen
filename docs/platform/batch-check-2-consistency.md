# batch-check-2-consistency（DeepSeek，约 15–20 分钟，只写测试）：同一件事几处显示一致

背景：`docs/platform/CHECK-PROCESS-1111.md` 第 2 项。11-11 的 bug 都出在「同一件事在几处显示、各算各的」。现在各处已经改成用同一份数据（`CycleLesson.done`、`ankiDueCount`、`calendar.mjs` 的讲后读标题），这一单加**跨处一致性测试**，防以后又分叉。

约束：只新建 `apps/desktop/src/renderer/core/board/consistency.test.ts`（必要时加一个同目录的测试夹具文件）；**不改产品代码**——发现不一致就让测试照实失败，并在报告里写清楚；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。

## 做法
1. 先找到下面这些「视图函数」（纯函数，输入数据、输出要显示的东西），在报告里列出文件和函数名：
   - 今日卡：`control-card.ts` 生成行的函数；
   - 右侧今天面板：`cycle-today.ts` 的视图函数；
   - 总进度：`plan-view.ts`（课程卡、带读行）；
   - 日历当天详情：生成当天课次列表的函数（`use-calendar.ts` / `calendar-log.ts` / `calendar-panel` 相关，以实际为准）。
2. 写一份共用夹具：同一天（`2026-11-12`），含
   - 主项课 A 今天一节**已完成**（`done: true`）、主项课 B 今天一节未完成；
   - 带读课 C 今天一节**已完成**；
   - 一条过期讲后读（标题用 `calendar.mjs` 现在的格式 `讲后读 · §1.1–1.4 · 离散数学（Epp, 5th ed）`，日期 11-10）；
   - Anki 运行、两个牌组各 20、22 张到期；
   - 书房计划内一本晚 2 天。
   把它转换成各视图函数需要的输入（`CycleDay`、`CycleMonth`、`CycleOverview`、`AnkiStatus`、`ShelfToday`、日历月数据等）。
3. 断言（每条一个 `it`）：
   - **完成状态**：A、C 在今日卡、右侧今天面板、日历当天详情里都是「完成」（各自的完成记号 / 状态字段），B 都是未完成；总进度里 A 的已完成数包含今天这节。
   - **Anki 张数**：今日卡文字里的数字 == 右侧面板的数字 == 42。
   - **讲后读**：今日卡和日历当天详情里，这条讲后读的文字都不含「核心页」，且都含「§1.1–1.4」。
   - **带读叫法**：今日卡、右侧面板、总进度、日历里 C 都标「带读」，任何一处都不出现「辅助」。
4. 断言不通过时**不要改产品代码、不要放宽断言**；在报告里写「哪一处和哪一处不一致、各显示了什么」。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx vitest run src/renderer/core/board/consistency.test.ts 2>&1 | tail -15 && npm run -s typecheck && npm run -s lint
```

## 结束报告（中文）
第 1 步找到的函数清单；每条断言的结果；不一致的详细情况（如有）。
