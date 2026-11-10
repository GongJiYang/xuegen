# batch-tidy1-plan-transaction（Devin）：总控改课程页也走「暂存 → 校验 → 一次落盘 → jj」

整理批第 1 条（`docs/platform/TIDY-1110.md` §1，用户 11-10 同意；思路是 Functional Core, Imperative Shell：检查是纯逻辑，暂存、落盘、jj 只有一份外壳）。现在总控用 `course_plan` 的 `unlock → 编辑工具直接改 → lock`，**没有检查、不是原子写、不记 jj**。改完后：两个工具是两道按角色开的门，后面是同一台事务机（`skills/course/course-close.mjs` + `skills/course/close/*.mjs`）。

## 硬约束
- 只改：`skills/course/close/{rules,staging}.mjs`、`skills/course/course-close.mjs`、`skills/course/references/close.md`、`apps/desktop/src/agent/tools/course-plan-tool.ts`、`apps/desktop/src/agent/guard/{roles,vault-paths}.ts`、`apps/desktop/src/agent/sandbox/config.ts`，以及因此必须更新的现有测试断言（只改断言，不删用例；新增用例留给下一单）。别碰 `SKILL.md`（Claude 改）、`course_close` 工具（`course-close-tool.ts`）、`renderer/**`。
- 不 commit/push、不加依赖、不放宽 eslint。新函数 < 50 行。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent 来分派这张单子。**

## 一、事务机支持「计划」（脚本侧）
1. **manifest 加 `kind`**：`"close"`（默认，现有行为）或 `"plan"`。旧 manifest 没有 `kind` 一律当 `"close"`。
2. `stage <vault> <slug> --workspace <ws> [--kind plan] [--new --subject <科目id>] [--json]`：
   - `--kind plan`：其余同现在（复制课程页、index、log、当月 records）。
   - `--new`（只能和 `--kind plan` 一起用，否则中文报错）：课程页**必须不存在**（存在就报「这门课已存在」）；暂存里不放课程页，只复制 `wiki/index.md`、`wiki/log.md`；`subject` 取 `--subject`（必填，`/^[a-z0-9][a-z0-9-]*$/`）。
   - `--kind plan` 时额外把科目页 `wiki/subjects/<subject>.md` 复制进暂存（存在才复制），记入基线。
3. **归属按 kind 分**（`rules.mjs`）：`ownedPrefixes(slug, subject, kind = "close")`。`plan` 只拥有：`wiki/courses/<slug>.md`、`wiki/courses/<slug>/`、`wiki/index.md`、`wiki/log.md`、`wiki/subjects/<subject>.md`——**不含概念页和卡片**（总控不写知识页）。`close` 不变。`isOwned`、`planCheck` 从 manifest 读 kind 传下去。
4. **`schedule <暂存目录> --lessons <文件> [--start --end --rest --days --extra --reviews] [--json]`**：只允许 `kind: plan` 的暂存；用 `execFileSync(process.execPath, [<course-schedule.mjs>, "plan", <暂存里的课程页>, …原样传参…, "--write"], { env: { …, ELECTRON_RUN_AS_NODE: "1" } })` 在暂存副本上写排期；`--lessons` 若是相对路径，按暂存目录解析。脚本报错（如「课次多于上课日，建议截止日期 …」）原样作为中文错误返回，暂存不动。
5. **提交名按 kind**：`kind: plan` 的 `commit` 一律记「计划 <slug> <日期>」（`--label` 不给也不许改）；`close` 不变（收课 / 存档点）。`undo` 仍只认「收课」，不动。
6. 新课程页（暂存里有、基线和库里都没有）照常走 `checkCoursePage`；`commit` 时课程目录要临时放开写（`withWritable` 已有），落盘后照常 `lockCourse`。
7. `usage()`、文件头注释、`references/close.md` 同步：写明 `--kind plan`、`--new --subject`、`schedule`、「计划」提交。

## 二、`course_plan` 工具改成这台事务机的总控入口
8. 动作改为：`stage`（`slug`，可选 `new: true` + `subject`）、`schedule`（`staging`、`lessons`，可选 `start end rest days extra reviews`）、`check`（`staging`）、`commit`（`staging`）、`abort`（`staging`）、`board`（不变）。**删掉 `unlock`、`lock`**。`stage` 拼 `--kind plan`；`new` 为真时加 `--new --subject <subject>`。
9. description 改为：「总控专用：建课、改计划。stage 开一个计划暂存（新建课程加 new 和 subject）→ 用编辑工具改暂存目录里的课程页 / 科目页 / index / log → 需要排期时 schedule → check → commit（jj 记『计划』，看板自动重画）；abort 放弃；board 只重画看板。课程会话不能用。」
10. 现有 `coursePlanCalls` 改成返回单步调用（不再三步 unlock/plan/lock），`execute` 的「失败也要 lock」逻辑删掉。

## 三、guard 与沙盒收紧
11. `roles.ts` 的 `decideCoursePlan`：仍只放 `control`；另外 `staging` 参数在时必须在 `<工作区>/.close/` 下（`within(canon(staging), canon(workspace/.close))`），否则拒「暂存目录不在工作区的 .close 里」。
12. `writeAllowed` 的 control 分支：**删掉** `isAnyFile(target, rules.coursesBoard)` 和 `inAnyDir(target, rules.courses, ".md")`——总控也不能用编辑工具直接写课程页和看板了。`writeDenyReason`：control 写课程页/看板时返回「课程页只经 course_plan 写：stage → 改暂存目录里的副本 → check → commit。」
13. `sandbox/config.ts` 的 `ROLE_WRITE.control` 删掉 `coursesBoard`（与 guard 保持镜像）。
14. 现有测试里断言「总控可以直接写课程页 / 看板」「course_plan unlock/lock argv」的地方改成新行为（只改断言）。

## 自测（报告里贴输出；mkdtemp 假库 + 真 jj，不碰真实库）
- 改已有课程：`stage --kind plan` → 改暂存课程页一行 → `check` → `commit`：jj 最新是「计划 <slug> <日期>」，提交含课程页和两个看板，课程页 0444。
- 新建课程：`stage <vault> newc --kind plan --new --subject discrete-math` → 在暂存里写一个最小合格课程页（照 `skills/course/PLAN-STANDARD.md` 或现有测试夹具）+ index 加一行 → `check` → `commit`：库里出现 `wiki/courses/newc.md`（0444）。
- 计划暂存里写概念页 → `check` 报 owner。
- `schedule` 在暂存副本上排期成功；课次过多时原样返回脚本的中文错误。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-close.test.mjs skills/course/close/*.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|skipped)' && npm test 2>&1 | grep -E '^# (pass|fail)' && npm run lint:skills 2>&1 | tail -2
cd apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
每条编号做了没有、自测输出、改了哪些现有断言、验收输出、偏离规格之处及原因。
