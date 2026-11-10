# batch-stage3d-shift（Devin）：`course_close` 加 `shift` 动作——顺延也走暂存→校验→提交

用户 11-09 定（`docs/platform/STAGE3-DESIGN.md`「3d」）：课程页只有一个写入口。开课时的顺延改成 `course_close` 的 `shift`：stage 课程页 → 在暂存副本上顺延 → 校验 → 提交，jj 记「顺延 <slug> <日期>」。顺延逻辑本身（含 `--end`）已在 `skills/course/course-schedule.mjs` 修好并有测试，**这一批只做接线，不改顺延算法**。

## 硬约束
- 只改：`skills/course/course-close.mjs`、`skills/course/references/close.md`、`apps/desktop/src/agent/tools/course-close-tool.ts`。别的文件一律不动（`course-schedule.mjs`、`SKILL.md`、`guard/**`、`sandbox/**` 都不动）。
- **不写新测试**（DeepSeek 下一单补）；现有测试必须全过。不 commit/push、不加依赖、不放宽 eslint。
- 函数 < 50 行、文件 ≤ 300 行的规则对 `course-close.mjs`（已近 960 行，既有例外）只要求**新写的函数** < 50 行。

## 一、`skills/course/course-close.mjs`（按顺序做）

1. 第 38 行 import 扩成：`import { completedIds, lastNewLessonDate, readSchedule, renderTable, shiftSchedule, writeSchedule } from "./course-schedule.mjs";`
2. **抽出 `stageInternal(vault, slug, workspace)`**：把 `cmdStage` 里从 `recoverInternal(workspace);` 到 `saveManifest(...)` 那个 try/catch 结束为止的全部逻辑原样搬进去，末尾 `return staging;`。`cmdStage` 只剩：解析 `vault`/`workspace`（两行 `resolve(... ?? fail(...))` 不变）→ `const staging = stageInternal(vault, slug, workspace);` → 原来的那行 stdout 输出。行为不变。
3. **抽出 `commitInternal(staging, label)`**：把 `cmdCommit` 里从 `recoverInternal(workspaceOf(staging));` 到 `const out = { committed: true, changes: result.changes, jj: jjResult };` 为止原样搬进去，`return out;`。其中提交信息那行改成 `` `${label} ${manifest.slug} ${localDate()}` ``。`cmdCommit` 只剩：解析 `staging` → `const out = commitInternal(staging, "收课");` → 原来的 json / 文本输出。行为不变（提交信息仍是「收课 <slug> <日期>」）。
4. **新增 `shiftStaged(staging, today, endFlag)`**（纯计算 + 写暂存，不碰库）：
   - `const manifest = loadManifest(staging);` `const rel = \`wiki/courses/${manifest.slug}.md\`;` `const file = join(staging, rel);` `const text = readFileSync(file, "utf8");`
   - `const schedule = readSchedule(text);` 为 `null` 时 `return null`。
   - 下面几行照抄 `course-schedule.mjs` 第 539–544 行的算法（`end = endFlag ?? schedule.end`、`done = completedIds(text)`、`shiftSchedule(...)`、`changed`、`lastLesson`、`deferred` 文案原样）。
   - `changed` 为真时 `writeFileSync(file, writeSchedule(text, renderTable(rows, schedule.rest, schedule.days, schedule.reviews, end), dropped));`
   - `return { changed, shiftedDays, movedReviews, lastLesson, end: end ?? null, dropped, deferred };`
5. **新增 `cmdShift(vaultArg, slug, workspaceArg, todayArg, endArg, json)`**：
   - `vault`、`workspace` 解析同 `cmdStage`；`if (!slug) fail("shift 需要 <slug>");`
   - `today = todayArg ?? localDate()`；`todayArg`、`endArg` 给了就用 `/^\d{4}-\d{2}-\d{2}$/` 校验，不合格 `fail("--today 要写成 YYYY-MM-DD")`（`--end` 同理）。
   - `const staging = stageInternal(vault, slug, workspace);`
   - `const shifted = shiftStaged(staging, today, endArg ?? null);`
   - `shifted === null` 或 `!shifted.changed`：`rmSync(staging, { recursive: true, force: true });` 输出 `{ shifted: false }`（json）或「没有需要顺延的安排」（文本；`null` 时文本为「这门课没有排期表，不用顺延」），正常退出 0。
   - 否则先 `const { result } = gatherCheck(staging);`，`!result.ok` 时 `rmSync(staging, …)` 再 `fail(...)`（problems 拼法照 `cmdCommit`）——顺延失败不能留下未提交暂存，否则当天收课的 `stage` 会被它挡住。
   - 通过则 `const out = commitInternal(staging, "顺延");`，输出 json `{ ...out, shiftedDays, movedReviews, lastLesson, end, dropped, deferred }`；文本输出：`没学的新课顺延 N 个上课日（最后一节 X），M 条过期复习挪到今天` + （有 `deferred` 时）`；<deferred>` + `（已提交，jj: <out.jj>）`。
6. `main()` 加：`else if (command === "shift") cmdShift(rest[0], rest[1], flags.workspace, flags.today, flags.end, json);`（放在 `undo` 那行之前）。`parseArgs` 不用改（`--today`、`--end` 自带值）。
7. `usage()` 在 `undo` 行前加：`"  node course-close.mjs shift   <vault> <slug> --workspace <工作区> [--today YYYY-MM-DD] [--end YYYY-MM-DD] [--json]",`
8. 文件头注释里命令列表（如有）同步加 `shift` 一行。

注意：`undo` 只找「收课 <slug>」提交，**不改**；顺延提交不会被 `undo` 撤。

## 二、`skills/course/references/close.md`
- 用法块里加上第 7 条同样的一行；命令说明里 `undo` 之后加一条：「`shift`：开课时的顺延。stage 课程页 → 在暂存副本上跑顺延（算法同 `course-schedule.mjs shift`，`--end` 不给就用排期标记里的 `end=`）→ 校验 → 提交，jj 记「顺延 <slug> <日期>」。没有要顺延的就删掉暂存、什么都不提交。校验不过也删掉暂存再报错。」

## 三、`apps/desktop/src/agent/tools/course-close-tool.ts`
1. `CloseAction` 加 `"shift"`（放在 `"undo"` 前）。
2. `courseCloseArgs` 的 params 类型加 `today?: string | undefined; end?: string | undefined;`；加 `case "shift":` 缺 slug 抛 `"course_close shift 缺少 slug：要顺延哪门课。"`，返回 `["shift", vault, params.slug, "--workspace", cwd, ...(params.today ? ["--today", params.today] : []), ...(params.end ? ["--end", params.end] : []), "--json"]`。
3. schema：`Type.Literal("shift")` 加进 Union；action 的 description 末尾加「shift 开课时顺延排期（一步完成暂存、校验、提交）。」；加 `today: Type.Optional(Type.String({ description: "shift 用：今天日期 YYYY-MM-DD（不填用本机日期）" }))`、`end: Type.Optional(Type.String({ description: "shift 用：周期最后一天 YYYY-MM-DD（排期标记里已有 end= 时不填）" }))`。
4. 工具 `description` 末尾加「shift 开课时顺延排期。」
5. guard 不用改：`decideCourseClose` 已按 slug 只放行本课会话（`shift` 和 `stage` 一样带 slug）。在 `roles.ts` 里确认这一点，写进报告，不改代码。

## 自测（报告里贴输出）
在 `mktemp -d` 里建 jj 假库（参考 `course-close.test.mjs` 里 jj 用例的建库方式，`JJ_CONFIG` 指向临时配置），课程页用 `cp ~/学根/库/wiki/courses/c-language.md` 的**副本**（只读复制，不碰真实库；把它里面的 `end=2026-12-24` 删掉、把 D1 改回 2026-11-09 再测）：
1. `shift <库> c-language --workspace <ws> --today 2026-11-10 --end 2026-12-24` → 提交成功，jj log 有「顺延 c-language …」，D14 进「留到下个周期」，课程页 0444。
2. 再跑一次 → 「没有需要顺延的安排」，`<ws>/.close/` 下没有残留暂存，jj 没有新提交。
3. 跑完 1 之后立刻 `stage` 同一门课 → 能正常开暂存（没被顺延挡住）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | grep -E '^# (pass|fail)' && npm run lint:skills 2>&1 | tail -1
cd apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
每条编号做了没有、自测 3 条输出、验收输出、偏离规格之处及原因。
