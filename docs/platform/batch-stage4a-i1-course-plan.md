# batch-stage4a-i1（Devin）：总控专用工具 `course_plan` + 收课/撤销/顺延提交时重画看板

用户 11-10 定（`STAGE4A-DESIGN.md`）：4a 接入后 bash 在沙盒里**写不了** `wiki/courses/` 和课程看板（`wiki/courses.md`、`wiki/courses.html`；新库 `wiki/_generated/courses.{md,html}`）。所以：
- 总控「建课 / 改计划 / 刷新看板」原来经 bash 跑的 `course-state.mjs unlock|lock|dashboard`、`course-schedule.mjs plan --write`、`render-board.mjs`，改成一个**只给总控用**的专用工具 `course_plan`（沙盒外运行，和 `course_close` 同一种做法）。
- 课程会话的收课不再经 bash 刷看板：`course-close.mjs` 的提交（收课、存档点、顺延、撤销）**在提交前自己重画看板，并把看板文件一起提交进 jj**。

这一批**不接沙盒**（下一批接），只把这两条路先铺好。照抄现有写法：`apps/desktop/src/agent/tools/course-close-tool.ts` 就是模板。

## 硬约束
- 只改/新建：`skills/course/course-close.mjs`、`skills/course/references/close.md`、新建 `apps/desktop/src/agent/tools/course-plan-tool.ts`、新建 `apps/desktop/src/agent/tools/run-script.ts`、`apps/desktop/src/agent/tools/course-close-tool.ts`（只改为复用 run-script）、`apps/desktop/src/agent/guard/{roles.ts,extension.ts}`、`apps/desktop/src/agent/session.ts`（注册一行）、`apps/desktop/src/agent/README.md`（一行）。
- **不写新测试**（DeepSeek 下一单补）；现有测试必须全过。不 commit/push、不加依赖、不放宽 eslint。新函数 < 50 行，新文件 ≤ 300 行。别碰 `SKILL.md`（Claude 改）、`sandbox/**`、`renderer/**`。

## 一、`skills/course/course-close.mjs`：提交前重画看板
1. 新增 `boardPaths(vault)`：`existsSync(join(vault, "wiki/_generated"))` 为真返回 `{ md: "wiki/_generated/courses.md", html: "wiki/_generated/courses.html" }`，否则 `{ md: "wiki/courses.md", html: "wiki/courses.html" }`（库内相对路径）。
2. 新增 `refreshBoard(vault)`：用 `execFileSync(process.execPath, [<本目录>/course-state.mjs, "dashboard", <vault>/wiki/courses, <vault>/<md>], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: "pipe" })`，再同样跑 `<本目录>/render-board.mjs <vault>/wiki/courses <vault>/<html>`（`<本目录>` 用 `dirname(fileURLToPath(import.meta.url))`）。成功返回 `{ ok: true, paths: [md, html] }`；任一步抛错返回 `{ ok: false, paths: [], error: <中文一句 + 原因> }`，**不抛**（看板失败不影响已落盘的收课）。
3. `commitInternal`：在 `rmSync(journalPath…)`/写 `committed` 之后、`jjCommit` 之前调 `const board = refreshBoard(vault);`，`jjCommit` 的路径列表改为 `[...result.changes.map(c => c.path), ...board.paths]`；`out` 加 `board: board.ok ? "ok" : board.error`。
4. `cmdUndo`：`restoreFiles` 非空、`jj restore` 成功之后、`jjCommit` 之前同样 `refreshBoard`，路径并进 `jjCommit`；JSON 输出加 `board`。
5. `recoverInternal`：`jjCommit` 之前同样 `refreshBoard` 并把路径并进去（失败只写 stderr）。
6. 文本输出里看板失败时多打一行 `看板未刷新：<error>`。
7. `references/close.md`：「commit」说明末尾加一句「提交前自动重画课程看板（Markdown + 网页）并一起提交；看板失败只报告，不影响收课」。

## 二、`apps/desktop/src/agent/tools/run-script.ts`（新建）
8. 把 `course-close-tool.ts` 里的 `RunExecFile` 类型和 `runScript(exec, repo, args)` **原样搬过来**并导出，改成 `runScript(exec, repo, script, args)`（`script` 是 repo 相对路径，如 `skills/course/course-close.mjs`）。`course-close-tool.ts` 改为从这里 import（`export type { RunExecFile }` 转出保持兼容，现有测试不改），行为不变。

## 三、`apps/desktop/src/agent/tools/course-plan-tool.ts`（新建，结构照 course-close-tool.ts）
9. `export type PlanAction = "unlock" | "lock" | "schedule" | "board";`
10. `export function coursePlanCalls(params, vault): { script: string; args: string[] }[]`（纯函数，可能返回多步）：
    - `unlock`：有 `slug` → `[{ script: course-state.mjs, args: ["unlock", <vault>/wiki/courses/<slug>.md, <vault>/wiki/courses] }]`；没 slug → 只放开目录 `["unlock", <vault>/wiki/courses]`（新建课程用）。
    - `lock`：缺 slug 抛中文错；`["lock", <vault>/wiki/courses/<slug>.md, <vault>/wiki/courses]`。
    - `schedule`：缺 slug 或缺 `lessons` 抛中文错；依次三步：unlock（同上）→ `course-schedule.mjs plan <F> --lessons <lessons> [--start] [--end] [--rest] [--days] [--extra] [--reviews] --write`（只拼传了的参数）→ lock（同上）。
    - `board`：两步：`course-state.mjs dashboard <courses> <vault>/<md>` → `render-board.mjs <courses> <vault>/<html>`，看板路径规则同第 1 条（在工具里用 `existsSync` 判断 `_generated`）。
    - `slug` 必须匹配 `/^[a-z0-9][a-z0-9-]*$/`，否则抛「slug 只能是小写字母、数字和连字符」。
11. `createCoursePlanExtension(options)`：同 `createCourseCloseExtension`，工具名 `course_plan`，label「课程计划」，description：「总控专用：建课、改计划、刷新看板。unlock 放开课程页（不给 slug 只放开课程目录，用于新建课程）→ 用编辑工具改 → lock 上锁；schedule 一步完成解锁、排期写入、上锁；board 重画课程看板。课程会话不能用。」参数：`action`（四个 Literal）、`slug?`、`lessons?`、`start?`、`end?`、`rest?`、`days?`、`extra?`、`reviews?`（都是 Optional String，带一句中文说明）。`execute`：按顺序跑 `coursePlanCalls` 的每一步，**任一步失败就停**（`schedule` 第二步失败时仍要跑第三步 lock，再返回错误）；返回各步 stdout 拼接，失败 `isError: true`。
12. 文件头注释写清：为什么存在（4a 沙盒挡住 bash 写课程目录）、谁能调（总控，guard 判）。

## 四、guard
13. `roles.ts`：`decide` 里 `if (tool === "course_plan") return decideCoursePlan(role);`。`decideCoursePlan`：`role.kind === "control"` 放行，否则 `deny(\`${roleLabel(role)}不能用 course_plan：建课、改计划在总控会话里做。\`)`。
14. `extension.ts`：`GUARDED_TOOLS` 加 `"course_plan"`；审计 `target` 记 `"<action> <slug>"`（无 slug 只记 action），写法照现有 `closeTarget`。
15. `session.ts`：在 course-close 那行后加 `{ name: "course-plan", factory: createCoursePlanExtension({ repo: repoRoot, home, cwd }) },`。
16. `agent/README.md`：tools 一节加 `course-plan-tool.ts`、`run-script.ts` 各一行。

## 自测（报告里贴输出；只在 mktemp 假库里，不碰真实库）
- 课程目录建两门课的假页（照 `skills/course/course-close.test.mjs` 里造课程页的方式），在 jj 假库里 `course-close.mjs stage → 改课程页 → commit`：jj 最新提交含 `wiki/courses.md`、`wiki/courses.html`；`board: "ok"`。
- 把 `render-board.mjs` 临时改名让它失败（测完改回）→ commit 仍 `committed: true`，`board` 是中文错误。
- 写一个 10 行的 node 脚本直接调 `coursePlanCalls`，打印 unlock/lock/schedule/board 四种的 calls。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | grep -E '^# (pass|fail)' && npm run lint:skills 2>&1 | tail -1
cd apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent 2>&1 | tail -4 && npm run build 2>&1 | tail -2
```
## 结束报告（中文，必须输出）
每条编号做了没有、自测输出、验收输出、偏离规格之处及原因。
