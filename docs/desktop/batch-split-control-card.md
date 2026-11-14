# batch-split-control-card（DeepSeek，约 15 分钟）：拆 control-card.ts 和 planbook.ts，不改行为

## 背景
`apps/desktop/AGENTS.md` 规定每个文件不超过 300 行、每个函数不超过 50 行。现在：
- `src/renderer/core/board/control-card.ts` 441 行，其中 `controlCard()`（约 207–368 行）一个函数约 160 行。
- `src/renderer/core/board/planbook.ts` 339 行。

这张单子**只搬代码、不改行为**：现有测试就是规格，一条都不许改期望值。

## 先跑测试
动手前先跑一遍，记下通过数（应为全过）：
```
cd apps/desktop && npx vitest run src/renderer/core/board
```

## 要做
1. `control-card.ts` 拆成三个文件（名字可以按内容微调，但要见名知意）：
   - `control-card-rows.ts`：读书 / 课后读相关的小函数（`courseParen`、`afterReadEntry`、`afterReadTitle`、`readingDue`、`bookRow`、`shelfRows`）。
   - `control-card-pending.ts`：`withPendingRead`、`withPendingShelf`、`withExtractCount`、`parsePageInput`。
   - `control-card.ts` 留 `controlCard()` 和类型；把它按今日卡的三组（上课 `lesson`、阅读 `read`、复习 `review`）各抽一个函数，`controlCard()` 只负责拼起来，每个函数 ≤ 50 行。
   - 原来从 `control-card.ts` 导出的名字，**在 `control-card.ts` 里继续 re-export**（`export { … } from "./control-card-rows.js"`），这样别的文件和测试的 import 一处都不用改。
2. `planbook.ts` 拆出一个 `planbook-items.ts`：把生成格子条目的函数（`lessonItems`、`afterReadItems`、`verifyItems` 以及只被它们用的小函数）搬过去；`planbook.ts` 留类型、`buildDay` / `buildWeek` / `buildMonth` / `planDay` 等。同样在 `planbook.ts` re-export 原来导出过的名字。两个文件都 ≤ 300 行。
3. 新文件开头写一两句模块注释，说清这个文件管什么（照仓库里已有文件的写法，中英文跟原文件一致）。
4. 更新 `src/renderer/core/board/README.md` 的文件表，补上新文件各一行。

## 不准动
- 任何 `*.test.*` 文件；任何函数的行为、参数、返回值；`strings.ts`；皮肤目录。
- 不要顺手重命名、不要「改进」逻辑。

## 验收（在 `apps/desktop` 跑，贴最后几行输出）
```
npm run -s typecheck                       # 0 错误
npx vitest run                             # 全过，通过数和动手前一样
npx eslint src/renderer/core/board         # 0 问题
wc -l src/renderer/core/board/control-card*.ts src/renderer/core/board/planbook*.ts   # 每个 ≤ 300
```
不要 commit、不要 push、不要启动 Electron。

## 报告
写在 `docs/desktop/batch-split-control-card.report.md`：新文件各多少行、各放了什么；`controlCard()` 拆成了哪几个函数、各多少行。
