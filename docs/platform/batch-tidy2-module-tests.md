# batch-tidy2-module-tests（DeepSeek / Haiku，约 15 分钟）：给拆出来的 4 个模块各补一份同名测试

整理 2 已把 `skills/course/course-close.mjs` 拆成 `skills/course/close/{rules,jj,board,durable,staging,fail}.mjs`（本地提交「整理 2」）。`rules.test.mjs` 已有。`lint:skills` 现在对 `board`、`durable`、`fail`、`jj`、`staging` 报「缺少同名测试」。这一单**只加测试**，测每个模块对外的接口（各文件头注释写了接口），不重复 `course-close.test.mjs` 里已有的端到端用例。

## 硬约束
- 只新建 `skills/course/close/{board,durable,fail,jj,staging}.test.mjs`。测试暴露真 bug 才改对应模块（在报告里说明）。不 commit/push、不加依赖。全部在 `mkdtemp` 里，jj 用例照 `course-close.test.mjs` 的建库方式（`JJ_CONFIG` 指向临时配置），本机没有 jj 就 `skip`。
- 每个文件 3–6 条，测正常、边界、出错各至少一条。

## 每个文件测什么
- `fail.test.mjs`：子进程 `node -e` 调 `fail("中文")` → 退出码 1、stderr 含原文。
- `jj.test.mjs`：`filesetLiteral` 对引号、反斜杠、花括号的转义（纯函数）；`isJjRepo` 真/假；真 jj 库里 `jjCommit` 只提交给定路径、其他改动留在工作副本；`parseDiffEntries` 已在旧文件测过，这里不重复。
- `board.test.mjs`：`refreshBoard` 在新旧两种布局下写到对应位置并返回 `ok`；课程目录为空时返回 `ok: false` 且中文错误、不抛。
- `durable.test.mjs`：`writeAtomic` 写入后内容与权限；`withWritable` 同步与异步回调结束后都恢复原权限；`lockCourse` 只锁本课；`recoverInternal` 没有 journal 返回 null、有 journal 时补完 rename 并删 journal。
- `staging.test.mjs`：`stageInternal` 建出的暂存含课程页、index、log 和 manifest；同课已有未提交暂存时拒绝；`workspaceOf` 从暂存路径推出工作区；`gatherCheck` 对一个改坏的暂存返回 problems。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/close/*.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|skipped)' && npm test 2>&1 | grep -E '^# (pass|fail)' && npm run lint:skills 2>&1 | tail -3
```
`lint:skills` 应只剩既有的 `render-snapshot.mjs` 一条警告。

## 结束报告（中文，必须输出）
新增测试数、是否发现 bug、验收输出。
