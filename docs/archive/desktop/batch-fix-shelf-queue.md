# batch-fix-shelf-queue（DeepSeek 返修）：排队的书不该从今天算

迁库（11-09）时发现两处，原因 Claude 已查明。只改 `skills/reading/bookshelf.mjs` 与 `skills/reading/bookshelf.test.mjs`。

## 1. `index.md` 里排队书的「预计读完」从今天算

`renderIndex` 用 `bookView(page, today).end`，排队的书 `position 0` 时 `end = today + total - 1`，与在读的书重叠（实测 CTM 写成 2027-01-26，比 Epp 的 01-28 还早）。阅读面板（`apps/desktop/src/renderer/core/board/shelf-view.ts` 的 `shelfPanel`）的规则才对：排队书按 `order` 升序（无 order 排最后）串起来，第一本从在读的计划内书 `end` 的次日起、没有在读的从 today 起，`end = start + total - 1`，下一本接着前一本。

改法：新增导出纯函数 `queueEnds(books, today)`（入参是 `loadBooks` 的结果，返回 `Map<slug, end>`，规则同上，只算 `slot: planned`、`status: queued`），`renderIndex` 里排队那组用它的日期。`list` 输出里排队书的 `end` 也改用它，排队书的 `upcoming` 给 `[]`（还没开始，没有日程）。

## 2. 对排队的书跑 `plan --write` 会把 `started` 写成今天

上一批让 `plan --write` 在 `started` 为空时写回 `today`；对 `status: queued` 的书这是错的——它应在前一本读完时由 `startNextPlanned` 设开始日。改法：`commandPlan` 对 `status` 不是 `reading` 的书 `fail("<slug> 还在排队（或已读完），开始读时会自动排期")`，不写文件。

## 测试

`bookshelf.test.mjs` 加：`queueEnds` 三本串接、无在读时从 today 起、order null 排最后；`index --write` 排队书日期在在读书之后；`list` 排队书 `upcoming` 为 `[]`、`end` 串接；`plan` 对 queued/done 的书报错且文件不变。已有测试按新行为最小修正并列出。

## 硬约束

不读写 `~/.xuegen/`、不碰真实 Obsidian 库、不启动 Electron、不 commit/push、不加依赖。

## 验收命令

```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2 && git status --short
```

## 结束报告（中文）

改了什么、测试清单、验收输出、未完成项。
