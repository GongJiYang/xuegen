# batch-split-control-card 报告

只搬代码，行为、参数、返回值、文案、测试一律未改。原有导入处一处未动（新名字都在 `control-card.ts` / `planbook.ts` 里 re-export）。

## 1. 动手前的基线

```
$ cd apps/desktop && npx vitest run src/renderer/core/board
 Test Files  40 passed (40)
      Tests  376 passed (376)
```

## 2. `control-card.ts` 拆成三个文件

| 文件 | 行数 | 放了什么 |
|---|---|---|
| `control-card.ts` | 291 | 类型（`ControlCardMark` / `ControlCardAction` / `ControlCardGroup` / `ControlCardRow` / `ControlCardView`）、`ControlCardInput` 入参类型、今日卡三组的拼装函数、`controlCard()` 本体；`afterReadTitle` 与 `control-card-pending.ts` 的四个名字在此 re-export。 |
| `control-card-rows.ts` | 152 | 阅读相关小函数：`courseParen`（内部）`afterReadEntry`、`afterReadTitle`、`readingDue`、`bookRow`（内部）、`shelfRows`。 |
| `control-card-pending.ts` | 90 | `withPendingRead`、`withPendingShelf`、`withExtractCount`、`parsePageInput`。 |

`controlCard()`（原 160 行）现在只剩 18 行，拆成：

| 函数 | 行数 | 职责 |
|---|---|---|
| `controlCard` | 18 | 算 headline，休息日直接返回；否则拼三组 |
| `lessonGroup` | 3 | 上课组 = `lessonRows` + `verifyRows` + `missedRows` |
| `lessonRows` | 19 | 主课（● now）与带读课（○ plan）的行 |
| `verifyRows` | 20 | 整合日的「周核实」行（`day.type !== "整合"` 时返回空） |
| `missedRows` | 24 | 没学的课，`mergeOverdue` 一门课一行 |
| `lessonRow` | 12 | 单节课程行（`done` 时 ✓ + 「回到这节课 →」） |
| `readGroup` | 7 | 阅读组 = 讲后读行 + 书房行 + 阅读队列行 |
| `afterReadRows` | 31 | 日历月里到今天的讲后读行 |
| `queueRows` | 16 | 到期阅读队列行 |
| `reviewRows` | 15 | 复习组：Anki 一行（休息日为空） |

`bookRow` 49 行（原样搬动，未拆——搬动本身已满足单函数 ≤ 50）。

## 3. `planbook.ts` 拆出 `planbook-items.ts`

| 文件 | 行数 | 放了什么 |
|---|---|---|
| `planbook.ts` | 176 | 类型（`PlanLane` / `PlanMark` / `PlanItem` / `PlanDay` / `PlanWeek` / `PlanbookInput`）、`ALL_LANES` / `MONTH_LANES`、`planDay`、`reviewDayOf`、`buildWeek` / `buildDay` / `buildMonth`；`planbook-range.ts` 的名字照旧 re-export。 |
| `planbook-items.ts` | 186 | 逐日格子条目：`AFTER_READ_MARK`、`markOf`、`lessonItems`、`afterReadItems`、`selfItemsByDate`、`verifyItems`、`mainCourseSlugs`、`weekGoals`、`missedLessons`。 |

`planbook.ts` 只 import 它要用的六个（`afterReadItems` / `lessonItems` / `missedLessons` / `selfItemsByDate` / `verifyItems` / `weekGoals`）。`mainCourseSlugs`、`markOf` 这两个原先不对外导出的内部函数现在是 `planbook-items.ts` 的具名导出（跨文件调用必须），但 `planbook.ts` **没有**再导出它们，所以 `planbook.ts` 对外的导出面与拆分前完全一致（`planbook-range` 的 re-export 保持不变）。

## 4. README 与模块注释

- `src/renderer/core/board/README.md`：`control-card.ts` 那一行补上「按三组抽出」的说明，新增 `control-card-rows.ts`、`control-card-pending.ts`、`planbook-items.ts` 三行；`planbook.ts` 那一行注明逐日条目已移到 `planbook-items.ts`。
- 三个新文件开头各有一两句英文模块注释（与 `control-card.ts` / `planbook.ts` 原注释同语言），说明这个文件管什么、为什么在这儿。

## 5. 验收输出（在 `apps/desktop`）

```
$ npm run -s typecheck && echo TYPECHECK_OK
TYPECHECK_OK

$ npx vitest run
 Test Files  141 passed (141)
      Tests  1355 passed | 1 skipped (1356)

$ npx vitest run src/renderer/core/board
 Test Files  40 passed (40)
      Tests  376 passed (376)

$ npx eslint src/renderer/core/board; echo ESLINT_EXIT=$?
ESLINT_EXIT=0

$ wc -l src/renderer/core/board/control-card*.ts src/renderer/core/board/planbook*.ts
      90 src/renderer/core/board/control-card-pending.ts
     152 src/renderer/core/board/control-card-rows.ts
     701 src/renderer/core/board/control-card.test.ts
     291 src/renderer/core/board/control-card.ts
     186 src/renderer/core/board/planbook-items.ts
      89 src/renderer/core/board/planbook-nav.test.ts
      63 src/renderer/core/board/planbook-nav.ts
     144 src/renderer/core/board/planbook-props.test.ts
      57 src/renderer/core/board/planbook-props.ts
      68 src/renderer/core/board/planbook-range.ts
     627 src/renderer/core/board/planbook.test.ts
     176 src/renderer/core/board/planbook.ts
```

测试通过数与动手前一致（board 目录 376 / 全仓 1355 + 1 skip）。两个被拆的源文件加三个新文件均 ≤ 300 行，函数均 ≤ 50 行。

另跑了 prettier 检查（只对五个改过的文件）：

```
$ npx prettier --check src/renderer/core/board/control-card.ts src/renderer/core/board/control-card-rows.ts \
    src/renderer/core/board/control-card-pending.ts src/renderer/core/board/planbook.ts \
    src/renderer/core/board/planbook-items.ts
Checking formatting...
All matched files use Prettier code style!
```

## 6. 偏离规格之处

1. **`lessonRow` 签名去掉了一个参数**：原来是 `controlCard()` 内部的闭包，捕获了 `today`；抽成顶层函数后不需要 `today`，所以只留 `(lesson, mark, text)`。参数、返回值、行为对外不可见（原本就不是导出函数），渲染结果由 376 条测试覆盖。
2. **`controlCard()` 的入参从内联对象类型改成文件内命名的 `ControlCardInput` 接口**（未导出）。字段、可选性、注释与原来逐字一致。
3. **`mainCourseSlugs`、`markOf` 在 `planbook-items.ts` 里是具名导出**（原来是 `planbook.ts` 的私有函数）。这是跨文件调用所必需；`planbook.ts` 没有把它们加进导出面。
4. `planbook-items.ts` 里的 `AFTER_READ_MARK`、`strings` import 随函数一起搬；`planbook.ts` 相应删掉不再用的 import（`strings`、`mergeOverdue`、`AFTER_READ_MARK`、`slotOf` 仍被 `planDay` / `reviewDayOf` 用，保留）。

## 7. 未完成项 / 未动的东西

- 未改任何 `*.test.*`、`strings.ts`、皮肤目录、`use-*` 文件（工作区里这些文件在我开工前就已是 modified 状态，我一行未碰）。
- 没有 commit、没有 push、没有启动 Electron。
- 未顺手改的既有超标项（范围外，只报告）：`control-card.test.ts` 701 行、`planbook.test.ts` 627 行（测试文件，本单禁止改）、`use-course-sessions.ts` 388 行、`consistency.test.ts` 410 行、`control-card-rows.ts` 里 `bookRow` 49 行（已接近上限）。
