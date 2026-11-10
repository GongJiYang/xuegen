# batch-stage3b-undo-keep-new（DeepSeek 返修，小单约 10 分钟）：撤销收课时新建的页面保留并列出

用户 11-10 定。现状：`skills/course/course-close.mjs` 的 `cmdUndo` 对那次收课改过的**全部**文件跑 `jj restore --from <id>-`，于是那次**新建**的卡片页、概念页也被删掉（Anki 里的卡不删，库和 Anki 就对不上）。要改成：**改过的文件恢复原样；新建的文件（`jj diff` 状态 `A`）留着不动，在输出里列出**，由用户决定删不删。**先写测试再改。**

## 硬约束
- 只改 `skills/course/course-close.mjs`（`cmdUndo` 一个函数）、`skills/course/course-close.test.mjs`、`skills/course/references/close.md`（第 22 行那句）。不 commit/push、不加依赖，别的函数不动。

## 要做的
1. `cmdUndo` 里把 `entries` 分两组：`added` = 状态 `A` 的路径；`restoreFiles` = 其余（修改、删除、改名涉及的路径）。`jj restore` 和 `jjCommit` 只传 `restoreFiles`；`restoreFiles` 为空时不调 `jj restore`，也不提交，直接输出。
2. `guardLaterChanges` 仍按**全部**文件查（新建的页之后被改过也要拦，保持现状）。
3. 输出：JSON 里 `files` 改为 `restoreFiles`，新增 `keptNew`（全部新建路径）；保留 `newCards`（`keptNew` 里含 `flashcards` 段的子集），字段名不变。文本输出改为：「已撤销收课提交 <id>，恢复 N 个文件」，然后每个新建文件一行「这次收课新建的页面（保留，可询问后删除）：<路径>」。
4. `references/close.md` 第 22 行改成：「`undo`：jj 把最近一次「收课 <slug>」提交改过的文件恢复到提交前，再提交「撤销收课」；那次新建的页面（卡片页、概念页）保留不删，在输出里列出，问用户后再删。」

## 测试（改现有 undo 用例里断言新文件被删的那条，再加）
- 收课改了课程页 + 新建 `wiki/知识/concepts/x.md` + 新建 `wiki/知识/flashcards/y.md` → undo 后课程页回到旧内容；两个新文件**仍在、内容不变**；`keptNew` 含两者；`newCards` 只含 y；「撤销收课」提交的 `jj diff --summary` 里没有这两个新文件。
- 收课只新建了文件（没改旧文件）→ undo 不报错，`restoreFiles` 为空，jj 历史里**没有**新增「撤销收课」提交。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-close.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|skipped)' && npm test 2>&1 | grep -E '^# (pass|fail)' && npm run lint:skills 2>&1 | tail -1
```
## 结束报告（中文，必须输出）
改了什么、新增/改动的测试数、验收输出。
