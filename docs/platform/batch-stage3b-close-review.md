# batch-stage3b-close-review（DeepSeek）：审核 + 测试 `course-close.mjs`

Devin 按 `docs/archive/platform/batch-stage3a-close.md` 写完（未提交），报告见 `/Users/gjy/pi-learning/devin-stage3a-close.log`。设计定稿 `docs/platform/STAGE3-DESIGN.md`。A 修 Claude 审出的两个问题，B 审核其余，C 补测试。

## 硬约束
- 先读 `docs/skills/AUTHORING.md`、`docs/platform/STAGE3-DESIGN.md`、`skills/course/references/close.md`、`skills/wiki-save/flashcards.test.mjs`（测试写法）。
- 只改 `skills/course/course-close.mjs`、`skills/course/course-close.test.mjs`、`skills/course/references/close.md`。不碰真实库、真实工作区、真实 `~/.xuegen/`；测试全用 `mkdtemp`。不 commit/push、不加依赖、不放宽 eslint。
- 本机有 jj（`jj --version`）。jj 相关测试在临时目录里 `jj git init` 建真仓库；`jj` 不可用时这些用例 `skip` 并说明，不要假装通过。

## A. Claude 审出的两个问题（必须修）
1. **`jj commit` 会把库里别的未提交改动一起收进「收课」提交**（用户在 Obsidian 里刚改的笔记也会被收进去，撤销时被一起撤掉）。改成只提交本次写入的文件：`jj commit -m "<msg>" <path1> <path2> …`（jj 的 fileset 参数；路径相对库根）。测试：库里先有一个无关的未提交改动 → 收课提交后，无关改动仍在工作副本里未提交，「收课」提交里只有本次文件。
2. **`undo` 会盖掉之后的改动**：从 `<id>-` 恢复前，检查 `<id>` 之后（`<id>::@` 范围，不含 `<id>`）有没有提交或工作副本改过同一批文件（`jj diff -r '<id>+::@' --summary` 或等价写法，取交集）；有就 fail，中文说明「这次收课之后 X 又被改过，不能直接撤销；先处理那次改动」，什么都不动。测试：收课 A → 收课 B 改同一课程页 → undo 拒绝；收课 A 后只有无关改动 → undo 成功且无关改动保留。

## B. 审核（逐条，问题直接修，报告里列表）
1. commit 中途失败的两条路径（journal 写入前 / 后）都与设计一致；`withWritable` 在异常时也恢复 mode。
2. 上锁范围：只锁 `wiki/courses/<slug>.md` 与 `wiki/courses/<slug>/**`，`wiki/courses/` 本身恢复原 mode；概念页等保持 0644。
3. `recover` 幂等：连续跑两次第二次什么都不做；journal 里 tmp 已不存在（已 rename）时跳过不报错。
4. `isOwned` 不被 `..`、绝对路径、大小写变体绕过（暂存里放 `wiki/courses/../profile.md` 之类的路径必须判为不属于本课）。
5. 暂存目录里出现符号链接时拒绝（不跟随），报 `kind: "owner"`。

## C. 补测试（`course-close.test.mjs`，替换掉冒烟用例或保留并追加）
纯函数各一组（正常/边界/错误）；端到端：stage → 改 → check → commit 全流程；冲突（库被改、新文件已存在）；只追加与不删行；课程页「完成：」id 不在排期表；行数超 200；新增概念页缺 sources；重复 stage 拒绝；abort；崩溃恢复（journal 写入后手工中断：造 journal + 部分已 rename）；A 节两组 jj 测试；undo 成功后课程页内容回到收课前且重新上锁。

## 验收命令（贴出最后几行）
```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
```
## 结束报告（中文，必须输出）
A 两条怎么修的；B 每条结论；新增测试数；jj 用例是否真跑了；未完成项。
