# batch-planbook-2-fix-a（DeepSeek，约 15 分钟，先写测试）：自读段日期 + 书房测试的假绿

约束：只改 `skills/reading/bookshelf.mjs`、`skills/reading/bookshelf.test.mjs`、`apps/desktop/src/renderer/core/board/planbook.ts` 及其测试；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。

## 1. 测试辅助的假绿（先做）
`bookshelf.test.mjs` 第 36 行的 `b(args, { expectFail })`：`assert.fail` 写在 `try` 里，被同一个 `catch` 吞掉——命令**成功**时也当成「失败了」返回，所以所有 `expectFail: true` 的测试都可能空转。
- 改法：成功时在 `try` 外面判断（例如先拿结果再 `if (expectFail) assert.fail(...)`），保证「期望失败却成功」一定报错。
- 改完跑整个文件。**之前靠它通过的测试如果现在失败，说明那是真 bug**：照实留着失败、不改期望，在报告里逐条写出来（命令、实际输出），Claude 再派返修。

## 2. 自读段的日期（`scheduleRows`，约 558 行）
设计稿（`/Users/gjy/pi-learning/design/animate/src/plan2.jsx` 的 WEEK 数据）的意思：过去没读的日子标「没读」，**今天和以后按顺延后的排期**显示。现在的实现把没读的段一律放在原定日子，今天会显示成错的段（Epp 11-12 显示第 4 段，实际今天该读第 1 段）。
- 改法：每本书的行 = 
  - 已读段：读书记录日期（不变）；
  - **过去没读的原定日子**：`started + index - 1 < today` 且 `index > position` 的段，按原定日子各出一行，`done: false`，加 `missed: true`；
  - **今天及以后**：用 `planRows(page, today)` 的顺延日期（`index > position` 的段），`done: false`。
  同一段可能出现两次（过去的 missed 一行 + 顺延后的一行），这是设计如此。排队书不变（只有今后的串接日期）。读完的书只给已读段。
- `ShelfScheduleRow`（`shared/data-protocol.ts`）加 `missed?: boolean`。
- `planbook.ts`：自读行 `missed` → mark `warn`，text 末尾加「 · 没读，顺到明天」（文案放 `strings.planbook`）；今天那段 → `now`；以后 → `plan`。
- 测试（用 11-12 的 Epp：started 11-09、position 0）：11-09、11-10、11-11 各一行 `missed`（第 1、2、3 段）；11-12 是第 1 段 `now`；11-13 第 2 段 `plan`；planbook 周视图 11-12 的自读行文字含「§1.1–1.4」。

## 这件事还在哪些地方显示
自读「今天该读哪段」：今日卡（`shelf.today`）、阅读面板「今天：…」、planbook 日 / 周视图。三处今天的段必须相同——在 `apps/desktop/src/renderer/core/board/consistency.test.ts` 加一条断言（今日卡自读行与 planbook 今天自读行是同一段）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/reading/bookshelf.test.mjs 2>&1 | grep -E "^# (pass|fail)" && npm test 2>&1 | tail -2
cd apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
第 1 步改后有哪些原来「通过」的测试变红（逐条）；第 2 步先失败的输出；验收输出。
