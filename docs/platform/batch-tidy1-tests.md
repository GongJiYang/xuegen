# batch-tidy1-tests（DeepSeek / Haiku 返修，约 15 分钟）：「计划」事务补测试 + 两处缺口

整理 1 已交（报告 `/Users/gjy/pi-learning/devin-tidy1-plan.log`，本地提交「整理 1」）：manifest `kind: plan`、`stage --kind plan [--new --subject]`、`schedule`、提交名「计划」，`course_plan` 去掉 unlock/lock，总控不能直写课程页。**先写测试再改。**

## 硬约束
- 只改 `skills/course/close/durable.mjs`、`skills/course/close/staging.mjs`、`skills/course/close/rules.mjs`、`skills/course/course-close.mjs` 与 `skills/course/course-close.test.mjs`、`skills/course/close/*.test.mjs`。不碰 `SKILL.md`、`apps/**`。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent 来分派这张单子。**

## 两处缺口（Devin 报告里列的）
1. **崩溃恢复把「计划」记成「收课」**：`commitInternal` 已在 journal 里记 `label`，但 `durable.mjs` 的 `recoverInternal` 仍写死 `收课 <slug> <日期>`。改成用 `journal.label ?? "收课"`（旧 journal 没有 label 照旧）。
2. **`--new` 暂存可以不写课程页就提交**：`kind: plan` 且 manifest 标记了新建（`stage --new` 时在 manifest 记 `isNew: true`；若已有等价字段就用它）时，`check` 必须要求暂存里有 `wiki/courses/<slug>.md`，没有就报 problem（kind `course-page`，「新建课程必须写课程页」）。

## 测试（jj 用例照现有写法，`mkdtemp` + 临时 `JJ_CONFIG`）
- 计划暂存：改课程页 + 科目页 → commit → jj「计划 <slug> <日期>」、含两个看板、课程页 0444。
- 计划暂存写概念页 / 卡片页 → check 报 owner；收课暂存写科目页以外的 subjects 页 → owner（kind 不混用）。
- `--new`：没写课程页就 check → 报「新建课程必须写课程页」；写了合格课程页 → commit 成功，课程页 0444。课程已存在时 `--new` 拒绝。`--new` 不带 `--kind plan` / 不带 `--subject` 拒绝。
- `schedule`：相对 `--lessons` 按暂存解析成功；课次过多原样返回脚本中文错误、暂存课程页不变；在收课暂存上跑被拒。
- `undo`：「计划」提交之后 `undo` 不撤它（找不到收课提交，或只撤更早的收课且被「之后又改过」挡住——按实际行为断言并在报告里写清）。
- 崩溃恢复：手工造一个 `label: "计划"` 的 journal → recover 后 jj 最新描述是「计划 …」；没有 label 的旧 journal → 「收课 …」。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-close.test.mjs skills/course/close/*.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|skipped)' && npm test 2>&1 | grep -E '^# (pass|fail)' && npm run lint:skills 2>&1 | tail -1
```
## 结束报告（中文，必须输出）
新增测试数、两处缺口怎么改的、验收输出。
