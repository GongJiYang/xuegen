# batch-panel-v2-tests（DeepSeek，约 15 分钟）：测试跟上面板 v2（只改测试，不改产品代码）

## 背景
总控面板 v2（设计稿 `docs/desktop/mockups/panel-v2.html`，用户 11-13 已批准）的界面代码 Claude 已经改完，产品代码类型检查通过。测试还按旧行为写，现在 `apps/desktop` 有 7 个类型错误（全在测试文件）和 21 条测试失败。**产品代码就是规格**，把测试改成断言新行为。

新行为要点（以产品代码为准，读 `src/renderer/core/board/control-card.ts`、`panel.ts`、`core/strings.ts`、`skins/bear/planbook.tsx`）：
- 给人看的名字改了：主项课→主课、带读→导读课、讲后读→课后读（数据字段和课程页里的「讲后读 · 」原文不变，只改显示）。
- 今日卡每行多了 `group`（`lesson` / `read` / `review`）和 `side`（如「陪读 →」入口），阅读行用勾选框，没有「读完了 / 读完这段」按钮。
- 去掉评判字眼和黄色警示：过期 / 没上的课不再是 `mark: "warn"`，而是普通 `plan` 加灰色小行「原排 MM-DD」；自读不再写「晚了 N 天，读完日期顺延到…」；状态格不再写「比计划晚」「过了日子还没做」「会晚 N 天」「已连接」等。
- Anki 行「Anki · 今天 N 张」（不是「今日」）。
- 周核实按 `verifiedOn`（字符串日期，`YYYY-MM-DD`）显示做过的状态；相关函数参数从 number 改成了 string。

## 要做
1. 修好这 7 个类型错误：
   - `src/renderer/core/board/consistency.test.ts(403)`、`control-card.test.ts(265, 298, 299)`：参数现在是 string。
   - `use-control-card.test.tsx(55)`、`use-control-plan.test.tsx(94)`：夹具补必填 `onAccompany`（`vi.fn()`）。
   - `use-control-planbook.test.tsx(113)`：夹具补必填 `setActiveCourse`（`vi.fn()`）。
2. 修好这些文件里失败的用例：`core/strings.planbook.test.ts`、`core/board/consistency.test.ts`、`core/board/control-card.test.ts`、`core/board/panel.test.ts`、`skins/bear/planbook.test.tsx`。改期望值，保留用例原本想守住的意思；用例标题里的旧说法一并改成新说法。
   - `consistency.test.ts`「没学的课」原来靠 `warn` 标记数节数，现在改用新信号（如「原排」小行或行文字里的「起 N 节」）去数，**仍要断言四处视图说的是同一组课程和节数**，不能删掉这条断言。
   - 「withPendingRead」「withPendingShelf」等用例：照新结构断言 ✓ + 撤销。
3. 不准动：任何非测试文件（`*.test.ts` / `*.test.tsx` 以外）。如果你认为某条失败说明产品代码真有退步（比如信息丢了、四处视图对不上），**不要改产品代码**，在报告里写清楚是哪条、为什么。

## 验收（在 `apps/desktop` 跑，贴最后几行输出）
```
npm run -s typecheck      # 0 错误
npx vitest run            # 全部通过
cd ../.. && npm test      # 根目录全过，lint-wording 0 处
```
不要 commit、不要 push、不要启动 Electron、不要跑 prettier 整个仓库（只对你改过的测试文件跑也可以不跑）。

## 报告
改了哪些文件、每个文件改了什么（一两句）；有没有怀疑产品代码退步的地方。
