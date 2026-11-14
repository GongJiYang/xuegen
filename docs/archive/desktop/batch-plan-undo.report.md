# batch-plan-undo 结束报告：撤销总控这一轮的计划改动（后端）

日期：2026-11-14。只做后端：`src/renderer/` 一行未动（界面由并行批处理）。

## 改了哪些文件

| 文件 | 改动 |
|---|---|
| `skills/course/close/restore.mjs` | 新建：从 `cmdUndo` 原样抽出「放开只读锁 → 一次 `jj restore --from <rev> --to @ -- <全部路径>` → 恢复权限（失败也恢复）」，导出 `restoreFiles(vault, fromRev, files)`，失败走 `fail(...)` |
| `skills/course/close/restore.test.mjs` | 新建：3 个用例（内容与锁恢复、工作副本里删掉的文件也恢复、jj restore 失败时权限照样恢复；失败路径用子进程跑，因为 `fail()` 会 exit） |
| `skills/course/course-close.mjs` | `cmdUndo` 改为调用 `close/restore.mjs` 的 `restoreFiles`（以 `restoreFromRev` 别名导入，避开局部数组 `restoreFiles`）；删掉已不需要的 `posix`/`relative`/`filesetLiteral` 导入。其余未动，536 行 |
| `skills/course/plan-undo.mjs` | 新建：`list <库根> --since <ISO>` 与 `undo <库根> --since <ISO> --workspace <工作区>`，逻辑按任务单（找提交 → 合并 diff → 之后被改过就拒绝 → 恢复 → 逐 slug `lockCourse` → 刷看板 → 记「撤销计划 …」提交） |
| `skills/course/plan-undo.test.mjs` | 新建：10 个用例，临时目录 `jj git init` 造库，覆盖规格全部场景 |
| `apps/desktop/src/shared/data-protocol.ts` | 新增 `PlanCommit`、`PlanUndoResult`；`DataRequest` 加 `plan.undoable`/`plan.undo`（带 `since`）；`DataResponseMap` 对应 `PlanCommit[]`/`PlanUndoResult`；`isDataRequest` 校验 `since` 为能被 `Date.parse` 解析的非空字符串 |
| `apps/desktop/src/shared/data-protocol.test.ts` | 补 `plan.undoable`/`plan.undo` 合法与非法样例 |
| `apps/desktop/src/agent/environment.ts` | 抽出 `resolveWorkspace()`（原 `applyXuegenEnvironment` 里的同一行，行为不变），原处改为调用 |
| `apps/desktop/src/main/data/plan-undo.ts` | 新建：脚本 JSON 输出 → 协议类型的两个小转换函数（`planCommitsOf`、`planUndoResultOf`） |
| `apps/desktop/src/main/data/plan-undo.test.ts` | 新建：转换函数测试 |
| `apps/desktop/src/main/data/handler.ts` | `handleScriptRequest` 加两个分支：`plan.undoable` → `plan-undo.mjs list`（取 `commits` 数组作 data）；`plan.undo` → `plan-undo.mjs undo --workspace resolveWorkspace()`（输出经 `planUndoResultOf` 投影成 `PlanUndoResult`） |
| `apps/desktop/src/main/data/handler.test.ts` | 补：两个请求参数正确传给脚本（坏 `--since` 报脚本自身的错、损坏 journal 证明 `--workspace` 到达 `recoverInternal`、非 jj 库报「撤销需要库在 jj 下」）、库未配置 → `vault-missing`、有 jj 时端到端跑通 |
| `apps/desktop/src/main/data/README.md` | 补两行：`plan.undoable`（只读）与 `plan.undo`（写）的路由说明 |

## jj 时间模板最后用的写法

```text
json(description) ++ "\t" ++ commit_id ++ "\t" ++ json(committer.timestamp()) ++ "\n"
```

`json(committer.timestamp())` 产出 `"2026-11-14T17:00:12+08:00"`，`Date.parse` 直接可解。实测 `committer.timestamp().format("%.6f")` 恒为 `.000000`——jj 的提交时间只存到**秒**精度，所以 `--since`（毫秒精度 ISO）在 JS 里比较前先 `Math.floor(ms/1000)*1000` 下取整到秒，否则同一秒内的提交会被漏掉。

## 偏离规格之处及原因

1. **`--since` 下取整到秒再比较**：规格说「时间 ≥ since 的」，但 jj 提交时间只存到秒；按毫秒比会丢掉与 since 同秒的提交。前端记的 since 在提交之前，下取整不会误收旧提交。
2. **`--since` 校验放在 `isJjRepo` 之前**（undo 里在 `recoverInternal` 之后）：规格未给 `--since` 校验的位置；坏参数先于环境检查报错，也使无 jj 环境的测试能验证参数透传。
3. **`list` 在非 jj 库同样报「撤销需要库在 jj 下」**：规格只给 undo 定了这条错误；list 同步处理，前端把 `ok:false` 当作「没有可撤销」即可。
4. **转换函数放在新文件 `main/data/plan-undo.ts`**：`handler.ts` 已 358 行，超过 300 行上限；按「函数放在使用它的模块旁边」放同目录新文件。
5. **`restoreFiles` 以别名 `restoreFromRev` 导入**：`cmdUndo` 与 `plan-undo.mjs` 的局部数组变量都按规格叫 `restoreFiles`，与函数同名冲突；函数签名按规格不变。
6. **测试里 `since` 在造提交之前取**（`list` 用例）：先提交再取 since 可能跨过一秒边界把新提交漏掉——首轮跑全量 `npm test` 时命中过一次，已修正并连跑三次确认稳定。

## 范围外发现（不顺手改，留给对应批次）

- `apps/desktop` 全量 `npm test` 有 1 个失败：`src/renderer/core/today.guard.test.ts` 报 `src/renderer/core/board/use-plan-changes.ts:80` 出现裸 `new Date()`。该文件是**并行前端批的未提交新文件**（`git status` 里 `??`，正是它用 `new Date().toISOString()` 记 `since`），应改用 `core/today.ts` 的 `now()` 或加入 EXEMPT——由界面批次处理。
- `npm run lint:skills` 有 1 个**存量**警告：`course/render-snapshot.mjs` 缺同名测试，与本次无关。

## 未完成项

无（后端全部完成；界面的「撤销这次改动」按钮与 `plan.undoable`/`plan.undo` 调用由界面批次接 `shared/data-protocol.ts` 里已定义的两个请求）。

## 验收输出

```sh
$ cd /Users/gjy/pi-learning/xuegen && node --test skills/course/plan-undo.test.mjs skills/course/close/restore.test.mjs
# tests 13
# pass 13
# fail 0

$ node --test skills/course/course-close.test.mjs
# tests 72
# pass 72
# fail 0

$ npm test          # node --test "scripts/**/*.test.mjs" "skills/**/*.test.mjs" && lint-wording
# tests 674
# pass 674
# fail 0
lint-wording: 0 处

$ npm run lint:skills
lint:skills: 9 个 skill，0 个错误，1 个警告   # 警告为存量 render-snapshot 缺测试

$ cd apps/desktop && npx tsc -p tsconfig.node.json --noEmit
（无输出，exit 0）

$ npx vitest run src/main src/shared
 Test Files  16 passed (16)
      Tests  132 passed (132)

$ npm run typecheck && npm run lint && npm run build
tsc node+web 均无错；eslint 0 错误 0 警告；vite 构建成功

$ npm test（desktop 全量）
 Test Files  1 failed | 146 passed (147)   # 唯一失败为范围外 renderer guard（见上）
      Tests  1 failed | 1395 passed | 1 skipped (1397)

$ node bin/xuegen.mjs --version
xuegen 0.1.0
```
