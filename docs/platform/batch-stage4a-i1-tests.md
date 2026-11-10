# batch-stage4a-i1-tests（DeepSeek，小单约 15 分钟）：给 `course_plan` 和「提交时重画看板」补测试

Devin 4a-i1 已交（报告 `/Users/gjy/pi-learning/devin-stage4a-i1.log`，本地提交「阶段 4a-i1」）：新工具 `apps/desktop/src/agent/tools/course-plan-tool.ts`（`coursePlanCalls` 纯函数 + `execute`）、`tools/run-script.ts`、guard `decideCoursePlan`；`skills/course/course-close.mjs` 新增 `boardPaths`/`refreshBoard`/`BOARD_RELS`，commit/undo/recover 提交前重画看板并并进 jj。**先写测试；测试暴露的真问题再改。**

## 硬约束
- 新建 `apps/desktop/src/agent/tools/course-plan-tool.test.ts`；改 `apps/desktop/src/agent/guard/roles.test.ts`、`extension.test.ts`、`skills/course/course-close.test.mjs`。有真 bug 才改对应源文件。别碰 `SKILL.md`、`sandbox/**`、`renderer/**`。不 commit/push、不加依赖。

## 测试
`course-plan-tool.test.ts`（照 `course-close-tool.test.ts` 的写法，注入假 execFile）：
1. `coursePlanCalls`：unlock 带/不带 slug、lock、schedule（只给必填 / 给全 start end rest days extra reviews）、board（有/无 `wiki/_generated` 两种，用 mkdtemp 建目录）逐字比对 script 与 args；缺 slug、缺 lessons、slug 含大写或 `..` 或 `/` 都抛中文错。
2. `execute`：schedule 三步全成功 → 普通结果；第 2 步（plan）失败 → **第 3 步 lock 仍被调用**，结果 `isError: true`；第 1 步 unlock 失败 → 后两步都不调用；board 第 1 步失败 → 第 2 步不调用。断言假 execFile 收到的调用顺序。
3. `wiki.json` 缺失 → 抛中文错且不 spawn。

`roles.test.ts`：`course_plan` 总控放行；课程会话、自由会话拒，原因含「总控」。
`extension.test.ts`：`course_plan` 审计 target 为 `"schedule ctm"`、无 slug 的 `"unlock"`。

`course-close.test.mjs`（jj 用例）：
4. 收课 commit 后 jj 提交含 `wiki/courses.md`、`wiki/courses.html`，`board: "ok"`；库里有 `wiki/_generated/` 时看板写在那里。
5. 别门课收课（只改看板）之后，本课 `undo` **不被**看板改动挡住、`keptNew` 里没有看板文件。
6. `refreshBoard` 失败（例如把课程目录里放一个解析会报错的课程页，或用环境变量/参数注入失败——选一种不改源码的办法；实在做不到就在报告里说明）→ commit 仍 `committed: true`，`board` 是中文错误，课程页已落盘。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-close.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|skipped)' && npm test 2>&1 | grep -E '^# (pass|fail)'
cd apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
新增测试数、发现的问题及修改、验收输出。
