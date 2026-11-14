# batch-cycle-open-data（批 5a）报告：开下一周期的数据与周期事务

只做后端：技能脚本 + agent 工具 + 守卫 + 协议 + 主进程路由 + 测试。`src/renderer/` 一行未动（界面另批）。无新增依赖。

## 1. `cycle.mjs accept / preview`（只读）

新逻辑放在新文件 `skills/cycle-plan/cycle-next.mjs`（`cycle.mjs` 已 817 行，按约束只加命令分派与人读输出）：

- `accept <库根> <cN> --json`：主课 = 周模板深度日链接的科目 → `subjectCourses`（辅助/导读课不算）；`goals` 解析课程页 `## Overall Goals` 的 `- [ ]/- [x]` 复选框（`parseGoals`，级别取全角冒号前的词，无冒号时 `""`）；`lessons` 用排期表 + `completedIds`（与 `overview` 同算法，只数 `kind === "new"` 的课次）；`next` 是 `parseRoute` 里紧跟 cN 的第一个非恢复周行，`mains` 由科目页 H1 标题解析成 slug（对不上时保留原文）。
- `preview <库根> --from <cN> --start <日期> --main <slugA[,slugB]> --json`：纯函数 `previewWeek(cycle, mains, names, start)`（导出、测试直接调）沿用源周期周模板，`cycleSubjects(from)[i] → mains[i]`；主项少给时多出来的深度日照旧显示原科目并标 `unchanged: true`；辅助列不变。短名优先级：源周期页模板里写的别名 > `wiki/subjects.md` 链接别名 > 科目页 H1 > slug 本身。
- 两个命令也给了非 `--json` 的人读输出；参数不合法时报中文错并非零退出。

实现注意：`cycle-next.mjs` 需要 `cycle.mjs` 的解析器，而 `cycle.mjs` 的命令层要调它——为避免互相 import，`cycle.mjs` 里用 `await import("./cycle-next.mjs")` 惰性加载（单向依赖）。

## 2. 周期事务 `cycle-open.mjs`

新文件 `skills/cycle-plan/cycle-open.mjs`（271 行），与 course-close 同一台事务机的思路：

- `stage`：`<工作区>/.cycle/<cN>-<时间戳>/` 下按库内相对路径复制 新周期页 `wiki/cycles/<cN>.md`、上一周期页（C1 没有）、`wiki/cycles/route.md`、`wiki/subjects.md`、`wiki/index.md`、`wiki/log.md`；库里没有的文件建空副本、`manifest.json` 基线记 `null`（其余记原 sha256）。同 cN 已有未提交暂存时拒绝。
- `check`：暂存的周期页逐个 `parseCycle`、暂存 route `parseRoute`、与库里其余周期页一起 `checkOverlap` + 重名检查；`wiki/log.md` 必须只追加（`checkAppendOnly`）、`wiki/index.md` 不许删行（`checkNoDeletedLines`）。输出 `{ok, problems}`，失败退出码非 0、JSON 照常打 stdout。
- `commit`：先跑 check（不过则不写库、输出问题清单、退出 1）；再逐文件核对库里现值 sha256 与基线（基线 `null` 的文件在库里出现也算被改过），不符报「库里 <路径> 在暂存后被改过，重新 stage」；`writeAtomic` 写回 → `jjCommit(vault, 开周期 <cN> <日期>, 路径)`（非 jj 库跳过、输出 `"jj": "skipped"`）→ 删暂存。
- `abort`：删暂存目录。
- 校验的纯逻辑导出为 `runCheck(staging)`，commit 复用。

## 3. 撤销认得「开周期」

- `skills/course/plan-undo.mjs`：revset 加 `description(glob:"开周期 *")`；描述正则改 `^(计划|顺延|开周期) (\S+) (\d{4}-\d{2}-\d{2})\s*$`（开周期提交的 slug 位置是 cN）。撤销时只对「计划/顺延」提交的 slug 调 `lockCourse`（cN 不是课程，周期文件不锁只读）；撤销提交描述照旧「撤销计划 …」（slugs 里含 cN）。
- `apps/desktop/src/main/data/plan-undo.ts`：`isPlanCommit` 的 kind 放行 `"开周期"`；`shared/data-protocol.ts` 的 `PlanCommit.kind` 同步加 `"开周期"`。
- 语义沿用现有规则：开周期提交里新建的文件（如 `c2.md`）进 `keptNew`（保留、列出、可询问后删），改过的文件进 `restoreFiles` 恢复到最早那次提交之前。

## 4. agent 工具 `cycle_open`

- 新文件 `src/agent/tools/cycle-open-tool.ts`：动作 `stage | check | commit | abort`，参数 `cycle`（`^C\d+$`）与 `staging`；`stage` 自动带 `--workspace <cwd>`；`cycleOpenCall` 是纯函数（逐字比对 argv 的测试覆盖），`execute` 用与 `course_plan` 相同的 `runScript` 外壳（`ELECTRON_RUN_AS_NODE=1`、120 秒超时），check 失败不抛、输出原样回模型（`isError: true`）。
- `src/agent/session.ts`：注册在 `course-plan` 旁（guard 之后）。
- `src/agent/guard/roles.ts`：新增 `decideCycleOpen`——只许总控，其它角色拒「建周期在总控会话里做」；带 `staging` 时必须在 `<工作区>/.cycle/` 里。

## 5. 协议与主进程

- `shared/data-protocol.ts`：`DataRequest` 加 `cycle.accept {cycle}` 与 `cycle.preview {from, start, main}`；结果类型 `CycleAccept` / `CyclePreview` / `CycleAcceptCourse` / `CyclePreviewDay`；`DataResponseMap` 对应两项；`isDataRequest` 校验 `^C\d+$`、`isIsoDate`、main 1–2 个 slug。
- `main/data/handler.ts`：`cycle.accept` → `cycle.mjs accept`，`cycle.preview` → `cycle.mjs preview --from/--start/--main`；输出经新文件 `main/data/cycle-next.ts` 的 `cycleAcceptOf` / `cyclePreviewOf` 逐字段守卫转成协议类型（与 `plan-undo.ts` 同款降级策略）。
- 目录 README 同步：`main/data/README.md`（路由表 + 新模块）、`agent/guard/README.md`（工具清单 + `cycle_open` 判定）。

## 6. 技能文字 `SKILL.md`

只改两处：「新建周期」第 5 步的写入改为 `cycle_open` 事务（stage → 改暂存副本 → check → 用户说可以 → commit，课程照旧 `course_plan`）；「读写边界」里 `wiki/cycles/` 改为「只经 `cycle_open` 写」，并说明开周期对 `subjects.md`、`index.md`、`log.md` 的连带改动放进同一笔事务。

## 新增 / 改动文件

新增：`skills/cycle-plan/cycle-next.mjs`、`cycle-next.test.mjs`、`cycle-open.mjs`、`cycle-open.test.mjs`；`src/agent/tools/cycle-open-tool.ts`、`cycle-open-tool.test.ts`；`src/main/data/cycle-next.ts`、`cycle-next.test.ts`；本报告。

改动：`skills/cycle-plan/cycle.mjs`（accept/preview 分派 + usage）、`skills/cycle-plan/SKILL.md`（两处）、`skills/course/plan-undo.mjs` + 测试、`src/shared/data-protocol.ts` + 测试、`src/main/data/handler.ts` + 测试、`src/main/data/plan-undo.ts`、`src/main/data/README.md`、`src/agent/tools/`（无 README）、`src/agent/session.ts`、`src/agent/guard/roles.ts` + 测试 + README。

## 验收输出

```
$ cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | grep -E "^# (pass|fail)"
# pass 686
# fail 0

$ npm run -s lint:skills
[警告] course/render-snapshot.mjs: 缺少同名测试 render-snapshot.test.mjs
lint:skills: 9 个 skill，0 个错误，1 个警告

$ cd apps/desktop && npm run -s typecheck
（无输出，0 错）

$ npm run -s lint
（无输出，0 错）

$ npx vitest run src/main src/shared src/agent 2>&1 | grep -E "Tests|Test Files"
 Test Files  39 passed (39)
      Tests  525 passed | 1 skipped (526)

$ npm run -s build >/dev/null && echo build-ok
build-ok
```

- 1 个 skipped 是既有的 `sandbox.e2e.test.ts` 环境跳过，与本批无关；`lint:skills` 的 1 个警告是既有的 `render-snapshot.mjs` 缺测试，非本批引入。
- 新增 .mjs 测试：`cycle-next.test.mjs` 5 条、`cycle-open.test.mjs` 5 条（含 jj 仓库真提交断言「开周期 C2 <日期>」恰好一笔）；`plan-undo.test.mjs` 12 条全过（新增「开周期+计划一起撤」「只有开周期也撤得动」两条）。vitest 新增：`cycle-next.test.ts` 5 条、`cycle-open-tool.test.ts` 6 条、`handler.test.ts` 1 条端到端、`data-protocol.test.ts` 与 `roles.test.ts` 用例扩展、`plan-undo.test.ts` 1 条 kind 放行（随既有 describe 内断言更新）。

## 偏离规格与待确认

- **`preview` 输出多了 `auxName` 字段**：规格样例只有 `aux: null`；为了界面直接显示辅助科目短名，每天同时给 `aux`（slug）与 `auxName`（短名）。协议 `CyclePreviewDay` 已含此字段。超集，不破坏规格。
- **`accept` 的 `cycle.start/end` 用顺延后的实际日期**（`loadElasticCycles`，与 `overview` 同口径）：主课滑过计划结束日时，验收看到的窗口仍是实际窗口，课次完成度照常统计。规格样例与「同 overview 算法」一致。
- **`check` 只管格式与一致性，不管库里是否被改过**：sha256 新鲜度核对按规格放在 `commit`（先 check 再核对）。因此「库里 log.md 被改」这类冲突会先命中 check 的只追加规则或 commit 的 sha 核对，两者都拒绝。
- **守卫没有收回总控对 `wiki/cycles/` 的直接 write/edit**：规格只要求 `cycle_open` 工具的角色门禁 + SKILL.md 文字。也就是说「周期页只经 cycle_open 写」目前是技能约定而非硬拦截（课程页那种「总控直写课程页被拒」的待遇没有复制到周期页）。若要硬拦截，改 `roles.ts` 的 `writeAllowed`/`writeDenyReason` 即可，留给后续批决定。
- **没有提交 git/jj**：本批改动均未提交，`git status` 里其它 `M`/`??` 文件是并行的另一批工作（renderer、event-mapper 等），非本批产物。

## 没做 / 疑问

- 界面侧（向导第 1、5 屏的数据消费）不在本批；`cycle.accept`/`cycle.preview` 已进协议，renderer 可直接 `window.xuegen` 调。
- `cycle_open` 工具不含 `accept`/`preview` 动作——这两个是只读查询，走数据通道给界面用；总控要看同样数据仍可 bash 跑 `cycle.mjs`（只读脚本，沙盒放行）。
