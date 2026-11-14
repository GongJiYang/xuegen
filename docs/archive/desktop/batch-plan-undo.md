# batch-plan-undo（Devin）：撤销总控这一轮的计划改动

## 硬约束（先读，压缩后也照做）
- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/skills/AUTHORING.md`、`docs/platform/STAGE3-DESIGN.md`（收课事务与撤销的规则）。
- 只做后端：技能脚本 + 协议 + 主进程路由 + 测试。**`src/renderer/` 一行都不动**（界面 Claude 写）。
- 脚本零依赖（`node:` 内置 + 已有的 `skills/course/close/*.mjs`）。
- 不读写 `~/.xuegen/`、不碰真实 Obsidian 库（`~/xuegen-data/vault`）、不启动 Electron、不 commit / push、不加依赖。测试一律在临时目录里 `jj git init` 造库（照 `skills/course/course-close.test.mjs` 现有夹具）。
- 新文件 ≤ 300 行，函数 ≤ 50 行。`course-close.mjs` 现有测试**一条都不能改坏、不能删**。

## 背景
总控改排期只有一条写路：`course_plan` 工具 → `course-close.mjs` 的计划暂存 → 一次 `commit`，jj 记成 **「计划 <slug> <YYYY-MM-DD>」**；顺延记成 **「顺延 <slug> <YYYY-MM-DD>」**（`commitInternal(staging, "顺延")`，自己核对实际格式）。收课已有 `undo`（`cmdUndo`，course-close.mjs 175 行起）：找提交 → 新建的页留着 → 其余文件 `jj restore --from <id>-` → 之后又被改过就拒绝 → 放开只读锁再锁回 → 刷新看板 → 记一条 jj 提交。

用户 11-14 批准：总控面板上「撤销这次改动」= 把**这一轮回答**里提交的所有「计划」「顺延」提交一起撤回。前端在回答开始时记下时间（ISO，带时区），传给后端；后端找这个时间之后的这些提交。

## 要做

### 1. 抽公共的恢复步骤 `skills/course/close/restore.mjs`（+ `restore.test.mjs`）
把 `cmdUndo` 里「放开只读锁 → 一次 `jj restore --from <rev> --to @ -- <全部路径>` → 恢复权限（失败也要恢复）」这一段原样搬成：
```js
export function restoreFiles(vault, fromRev, files) // 失败时 fail(...)，与现在行为一致
```
`cmdUndo` 改为调用它，其余不动。`course-close.test.mjs`、`course-close.real.test.mjs` 必须照旧全过。

### 2. 新脚本 `skills/course/plan-undo.mjs`（+ `plan-undo.test.mjs`）
```
node plan-undo.mjs list <库根> --since <ISO> --json
node plan-undo.mjs undo <库根> --since <ISO> --workspace <工作区> --json
```
- **找提交**：`jj log -r '(description(glob:"计划 *") | description(glob:"顺延 *")) & ::@' --no-graph -T <模板>`，模板输出 描述(JSON) \t commit_id \t 提交时间。时间模板用 jj 0.47 支持的写法（先 `jj help -k templates` 查，如 `committer.timestamp()` 的格式化方法），在 JS 里与 `--since` 比较（都转成毫秒）。描述必须精确匹配 `^(计划|顺延) (\S+) (\d{4}-\d{2}-\d{2})\s*$`。只要时间 ≥ since 的。
- **list**：输出 `{"commits":[{"id":"…","kind":"计划","slug":"discrete-math-epp","date":"2026-11-14"}]}`，从旧到新。没有就是空数组（退出码 0）。
- **undo**：
  1. `recoverInternal(workspace)`；不是 jj 库 → `fail("撤销需要库在 jj 下")`；没有提交 → `fail("这一轮没有提交过计划改动，没有可撤销的")`。
  2. 每个提交 `diffEntries(vault, id)`，合并：路径第一次出现时状态是 `A`（新建）的归 `keptNew`，其余归 `restoreFiles`；都去掉 `BOARD_RELS`（同 cmdUndo）。
  3. **之后又被改过就拒绝**：列出 `<最早提交>+::@` 里的全部提交（含工作副本 `@`），**不在本次集合里的**每个提交做 `diffEntries`，碰到 `restoreFiles` 或 `keptNew` 里的路径 → `fail("这一轮之后 <路径> 又被改过，不能直接撤销")`。最早提交不在 `::@` 上 → `fail("这一轮的计划提交不在当前历史上（可能已经撤销过）")`。
  4. `restoreFiles.length > 0` 时：`restoreFiles(vault, \`${最早}-\`, restoreFiles)` → 对涉及的每个 slug 调 `lockCourse(vault, slug, restoreFiles)`（与 cmdUndo 一致）→ `refreshBoard(vault)` → `jjCommit(vault, \`撤销计划 ${slugs.join("、")} ${localDate()}\`, [...restoreFiles, ...board.paths])`。
  5. 输出 `{"undone":[ids],"restoreFiles":[…],"keptNew":[…],"jj":…,"board":"ok"|"skipped"|错误}`。
- 测试（临时 jj 库）：since 之前的提交不算；「收课 …」提交不算；一轮里两个计划提交（同一文件改两次）一起撤回到第一个之前；新建页保留进 keptNew；之后被别的提交改过 → 拒绝；工作副本里改过 → 拒绝；撤过一次再撤 → 第二次找不到或拒绝；list 输出格式；非 jj 库报错。

### 3. 协议 `apps/desktop/src/shared/data-protocol.ts`
```ts
export interface PlanCommit { id: string; kind: "计划" | "顺延"; slug: string; date: string }
export interface PlanUndoResult { undone: string[]; restoreFiles: string[]; keptNew: string[]; board: string }
```
- `DataRequest` 加 `| { kind: "plan.undoable"; since: string }` 与 `| { kind: "plan.undo"; since: string }`；响应 `"plan.undoable": PlanCommit[]`、`"plan.undo": PlanUndoResult`。
- `isDataRequest`：`since` 必须是能被 `Date.parse` 解析的非空字符串；补测试。

### 4. 主进程
- `apps/desktop/src/agent/environment.ts`：抽出 `export function resolveWorkspace(): string`（就是现在 162 行那句 `resolve(process.env.XUEGEN_DESKTOP_CWD || join(homedir(), "learning"))`），原处改为调用它；不改行为。
- `main/data/handler.ts` 的 `handleScriptRequest`：
  - `plan.undoable` → `runScript("course/plan-undo.mjs", ["list", vault.vault, "--since", since, "--json"])`，把输出的 `commits` 数组作为 data（照现有 runScript 的结果转换写法；需要转换就写个小函数并测试）。
  - `plan.undo` → `runScript("course/plan-undo.mjs", ["undo", vault.vault, "--since", since, "--workspace", resolveWorkspace(), "--json"])`。
- `handler.test.ts` 补：两个请求参数正确传给脚本；库未配置。`main/data/README.md` 补两行。

## 验收（贴最后几行输出）
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/plan-undo.test.mjs skills/course/close/restore.test.mjs skills/course/course-close.test.mjs && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx tsc -p tsconfig.node.json --noEmit && npx vitest run src/main src/shared
```

## 结束报告
写在 `docs/desktop/batch-plan-undo.report.md`：改了哪些文件；jj 时间模板最后用的写法；偏离规格之处及原因；未完成项。
