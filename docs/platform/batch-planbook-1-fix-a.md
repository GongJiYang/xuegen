# batch-planbook-1-fix-a（DeepSeek 返修，约 15 分钟，先写测试再改）

背景：`docs/platform/PLANBOOK-1111.md`。带读（辅助课）不设完结，但排课脚本 `plan` 仍**需要** `--end` 来铺课：正确做法是 `--end <周期最后一天>` + `elastic`（end 只用来铺课、不记进标记）。Devin 上一批照着有误的任务单写了「不加 --end」。

约束：只改下面列出的文件；不 commit / push；不加依赖；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。

## 1. 新建带读课的提示（`apps/desktop/src/renderer/core/board/course-prompts.ts` 约 86 行的 `tail`）
- aux 分支改成：`` `从今天之后第一个上课日开始排，--end 用 ${placement.end}（${placement.cycle} 结束）只铺课、加 elastic，不设完结（不写「留到下个周期」）` ``。main 分支不动。
- 先在 `course-prompts.test.ts` 把 aux 的期望改成含「加 elastic」「不设完结」、不含「不加 --end」，看它失败，再改代码。

## 2. 排课卡带读那一行（`apps/desktop/src/renderer/core/strings.ts` 的 `progress.placementLine`，约 427 行）
- `role === "aux"` 时返回：`` `${days.join(" · ")}　每节 ≤ 45 分钟　不设完结` ``（不再显示「排到 MM-DD（周期结束）」）；main 不变。
- 有测试引用它就同步（`grep -rn "placementLine\|排到" apps/desktop/src --include=*.test.*`）；没有就在 `strings` 相关测试里加一条 aux / main 各一断言（找不到合适的测试文件就新建 `apps/desktop/src/renderer/core/strings.placement.test.ts`）。

## 3. 测试的日期依赖（`skills/course/course-close.real.test.mjs` 约 447 行）
- 根因（Claude 已查清）：看板第一行 `Last updated: <生成当天>`；测试的库副本是前一天生成的，撤销后重画会盖上今天的日期，逐字比较必败。撤销本身正确。
- 改法：这条断言比较前，两边都去掉以 `Last updated:` 开头的那一行（写一个本文件内的小函数），其余逐字比较不变。断言消息不改。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-close.real.test.mjs 2>&1 | grep -E "^# (pass|fail)" && npm test 2>&1 | grep -E "^# (tests|pass|fail)"
cd apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests|Test Files"
```

## 结束报告（中文）
每处改了哪几行；第 1、2 步先失败的输出；验收完整输出。
