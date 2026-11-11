# batch-full-b5-reading（DeepSeek，约 15 分钟）：bookshelf.mjs + reading-queue.mjs 端到端——只写测试、报告失败

全量测试 B5。只新建 `skills/reading/reading.full.test.mjs`。（`bookshelf lecture` 查重另有返修单在做，这单不测 lecture。）

## 硬约束
- **只写测试，不改产品代码**、`SKILL.md`、`apps/**`、已有测试。不 commit/push、不加依赖。
- 全部在 `mkdtemp` 临时目录。要用库副本 `/tmp/xg-e2e/vault/GJY` 就先 `cp -R` 到临时目录再跑（复制后 `chmod -R u+w`）；**绝不写 `/tmp/xg-e2e/vault/GJY` 本身**。用到库副本的用例加 `{ skip: existsSync(<路径>) ? false : "<路径> 不存在（需要有库副本的机器）" }`，并且**不要断言库副本里会变的具体日期/数量**（只断言不变量）。
- 失败且你认为是产品 bug：改成 `test("…", { todo: "疑似 bug：<一句话>" }, …)`，保留断言，报告列出复现命令与实际/期望。
- 写法参考同目录已有的 `*.test.mjs`。**自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

## 要测的情况
1. 书房为空（没有 `wiki/shelf/` 或只有 index.md）：`list`、`today`、`index` 不崩，today 返回 planned null。
2. 计划内两本（一本在读、一本排队）：`today` 只给在读那本；在读那本 `done` 到最后一段 → 状态变读完、排队那本变在读（或按实际行为断言并写进报告），index.md 同步。
3. `done` 同一天连点两次：第二次怎么处理（按实际断言；若重复记录或位置 +2，标 todo）。
4. 核心页：书页「## 核心页已读」有与今天段重叠的页 → `today` 的 coreOverlap 正确；不重叠 → 空。
5. `plan --write`：起始日在过去、读过几段后重排 → 已读段日期不动、未读段从今天起每天一段、预计读完日 = 最后一段日期。
6. reading-queue：`add`（相对路径不存在 → 报错）、`today`、`review --outcome next/postpone/done`、`note`、`pause/resume`、`verify`；队列为空时各命令不崩。
7. 库副本冒烟：副本复制后跑 `bookshelf list/today --json`（今天取 2026-11-11 与 2027-02-01）、`reading-queue verify` 不报错（结果原样写进报告）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/reading/reading.full.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```
## 结束报告（中文，必须输出）
新增测试数；每条实际行为一句话；所有 todo 的复现与实际/期望；验收输出。
