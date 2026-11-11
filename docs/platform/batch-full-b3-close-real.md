# batch-full-b3-close-real（DeepSeek，约 15 分钟）：course-close 用真实课程页跑一遍——只写测试、报告失败

全量测试 B3。`course-close.test.mjs` 已有 60 多条（含 undo、recover、计划暂存）。这单只补一件事：**用库副本里的真实课程页**跑收课和计划事务，确认真实内容不会被 check 卡住（卡住 = 用户下次收课提交不了）。**只写测试，不改产品代码。**

## 硬约束
- 只新建 `skills/course/course-close.real.test.mjs`。不改产品代码、`SKILL.md`、`apps/**`、已有测试。不 commit/push、不加依赖。
- 每个测试先把 `/tmp/xg-e2e/vault/GJY` 整个 `cp -R` 到 `mkdtemp` 临时目录（复制后 `chmod -R u+w`，再按原样把 `wiki/courses` 与课程页设回只读——照抄 `/tmp/xg-e2e/prepare.sh` 里 chmod 那两行的做法），工作区也用临时目录（`--workspace`）。绝不对 `/tmp/xg-e2e/vault/GJY` 本身跑 stage/commit。jj 用例照 `course-close.test.mjs` 的 `initJj` 写法（临时 `JJ_CONFIG`）；副本里自带的 `.jj` 先删掉再 `jj git init`。
- CLI 用法看 `node skills/course/course-close.mjs --help`。
- 失败且你认为是产品 bug：改成 `{ todo: "疑似 bug：…" }`，保留断言，报告列出。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

## 要测的情况
1. **原样收课**：对副本 `wiki/courses/` 下每门有排期标记的课：`stage` → 不改 → `check --json` → 期望 ok（列出每门课的 problems）；`abort`。
2. **最小真实收课**：每门课 `stage` → 在暂存课程页 `## Learning Record` 末尾加一条照 `skills/course/references/record.md` 格式的记录（完成 id 用排期里第一个未完成的 D 号）→ `check` → `commit` → 课程页 0444、`wiki/_generated/courses.md` 已刷新、jj 最新描述「收课 <slug> <日期>」。任何一门 check 不过：原样记下 problems。
3. **计划暂存**：选一门主项课 `stage --kind plan` → `schedule`（`--elastic`，lessons 用它排期表里现有课次内容组成的 json）→ `check` → `commit` → jj「计划 …」。
4. **undo**：第 2 步任一门课 commit 后 `undo` → 课程页回到收课前（与副本原文件逐字相同）、重新上锁。
5. **200 行上限**：列出副本里每个课程页的行数；超过 200 行的页面原样 stage→check 会不会被拒（这关系到真实用户能不能收课）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-close.real.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```

## 结束报告（中文）
新增测试数；每门课第 1、2 步结果（ok / problems 原文）；第 5 步行数表；todo 与复现；验收输出。
