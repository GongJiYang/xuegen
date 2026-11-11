# batch-full-b4-state-board（DeepSeek，约 15 分钟）：course-state.mjs + render-board.mjs 端到端——只写测试、报告失败

全量测试 B4（计划 `docs/platform/FULL-TEST-1110.md`）。只新建 `skills/course/course-state.full.test.mjs`。

## 硬约束
- **只写测试，不改产品代码**、`SKILL.md`、`apps/**`、已有测试。不 commit/push、不加依赖。
- 全部在 `mkdtemp` 临时目录。要用库副本 `/tmp/xg-e2e/vault/GJY` 就先 `cp -R` 到临时目录再跑（复制后 `chmod -R u+w`）；**绝不写 `/tmp/xg-e2e/vault/GJY` 本身**。用到库副本的用例加 `{ skip: existsSync(<路径>) ? false : "<路径> 不存在（需要有库副本的机器）" }`，并且**不要断言库副本里会变的具体日期/数量**（只断言不变量）。
- 失败且你认为是产品 bug：改成 `test("…", { todo: "疑似 bug：<一句话>" }, …)`，保留断言，报告列出复现命令与实际/期望。
- 写法参考同目录已有的 `*.test.mjs`。**自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

## 要测的情况（每条一个 test）
1. lock / unlock：文件不存在、目录参数、已锁再锁、权限位前后（0444 ↔ 0644），多个文件一次。
2. verify：副本 `wiki/courses` 原样 → 结果（原样记进报告）；手工去掉某页的 `xuegen:course-state` 标记 / 改成可写 → verify 报出来；看板文件比课程页旧 → 报过期。
3. dashboard：输出到 `wiki/_generated/` **不存在**的目录时是否自动建目录（按实际断言；崩溃就标 todo）；连跑两次输出相同（幂等）。
4. list --json：副本里每门课都有 slug、名字、进度数字；没有排期的课不崩。
5. after-read：标签不存在 → 中文报错、文件不变、权限恢复原样；同一标签已打勾 → 再跑报错不重复加尾注；课程页只读状态下跑完仍只读。
6. render-board.mjs：读副本课程目录生成看板（看它的导出/CLI 用法），与 `course-state.mjs dashboard` 的结果是否一致（按实际断言并写进报告）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-state.full.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```
## 结束报告（中文，必须输出）
新增测试数；每条实际行为一句话；所有 todo 的复现与实际/期望；验收输出。
