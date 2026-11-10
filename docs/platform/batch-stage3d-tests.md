# batch-stage3d-tests（DeepSeek，小单约 15 分钟）：给 `course_close shift` 补测试

Devin 3d 已交（报告 `/Users/gjy/pi-learning/devin-stage3d-shift.log`，本地提交「阶段 3d」）：`skills/course/course-close.mjs` 新增 `shiftStaged`、`cmdShift`，抽出 `stageInternal`、`commitInternal`；`apps/desktop/src/agent/tools/course-close-tool.ts` 加 `shift` 动作（`today`、`end` 参数）。**先写测试；测试暴露的真问题再改这两个文件。**

## 硬约束
- 只改 `skills/course/course-close.test.mjs`、`apps/desktop/src/agent/tools/course-close-tool.test.ts`；有真 bug 才改 `course-close.mjs` / `course-close-tool.ts`。别碰 `course-schedule.mjs`、`SKILL.md`、`sandbox/**`、`guard/**`。不 commit/push、不加依赖。

## 测试
`course-close.test.mjs`（用现有 jj 用例的建库方式；课程页样本自己造：有排期标记 `rest=sun days=mon,wed reviews=anki`、D1 日期在 `--today` 之前且未完成、末节靠近结束日、计划表里有「### 留到下个周期」一节且只有一行「- 无：…」）：
1. shift 有变化 → 退出 0；jj 最新提交描述是「顺延 <slug> <今天>」，且这个提交只含课程页；课程页 0444；`<ws>/.close/` 里本次暂存带 `committed`。
2. 有结束日、末节被挤出 → JSON 的 `dropped` 含该 id，`deferred` 文案对；课程页「留到下个周期」那行「- 无：…」被替换。
3. 没有要顺延的 → `{"shifted":false}`、退出 0、jj 无新提交、`.close/` 下没有新目录残留。
4. 课程页没有排期标记 → 文本「这门课没有排期表，不用顺延」、无残留暂存、无提交。
5. `--today 11/10`、`--end 2026/12/24` → 非 0 退出、中文报错、没有建暂存。
6. 已有本课未提交暂存 → shift 被拒（与 stage 一致），原暂存不动。
7. shift 之后立刻 `stage` 同课 → 成功；之后 `commit` 一次收课，再 `undo` → 撤的是「收课」提交，顺延提交还在（`undo` 只认「收课」）。注意：顺延和收课都改课程页，按设计 undo 的「之后又被改过」闸门**只看收课之后**的改动，这个用例里顺延在收课之前，所以 undo 应成功。
8. `commit` 的提交信息仍是「收课 <slug> <日期>」（`commitInternal` 抽出后没变）。

`course-close-tool.test.ts`：`courseCloseArgs` 的 shift：只给 slug；给 today；给 today + end；缺 slug 抛中文错。逐字比对 argv。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-close.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|skipped)' && npm test 2>&1 | grep -E '^# (pass|fail)' && npm run lint:skills 2>&1 | tail -1
cd apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent/tools 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
新增测试数、发现的问题及修改、验收输出。
