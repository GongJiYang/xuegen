# batch-cycle-open-data（Devin）：批 5a 开下一周期的数据与周期事务

## 硬约束（先读，压缩后也照做）
- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/skills/AUTHORING.md`、`skills/cycle-plan/SKILL.md`（「新建周期」五步、「周期验收与轮换」）、`docs/platform/PLANBOOK-456-PLAN.md`「批 5」一节。
- 只做后端：技能脚本 + agent 工具 + 守卫 + 协议 + 主进程路由 + 测试。**`src/renderer/` 一行都不动**（界面 Claude 写）。
- 脚本零依赖（`node:` 内置 + 已有的 `skills/course/close/*.mjs`、`skills/course/course-schedule.mjs`、`skills/cycle-plan/*.mjs`）。
- 不读写 `~/.xuegen/`、不碰真实 Obsidian 库（`~/xuegen-data/vault`）、不启动 Electron、不 commit / push、不加依赖。测试一律在临时目录造库（`cycle.test.mjs` / `course-close.test.mjs` 现有夹具；要 jj 的用 `jj git init`）。
- 新文件 ≤ 300 行，函数 ≤ 50 行；`cycle.mjs` 已 817 行，新命令的逻辑放新文件 `skills/cycle-plan/cycle-next.mjs`，`cycle.mjs` 只加命令分派。现有测试一条都不能改坏、不能删。

## 背景
C1 预计 12-29 收尾。用户 11-12 批准「开下一周期」做成向导：界面收集选择（验收 → 选主项 → 选主资料 → 书房 → 看一周），再「交给总控写入」；总控照 `cycle-plan` 技能给用户看改动、用户说可以才写。用户同时批准**周期事务**：周期层的几份文件一次暂存、校验、一笔 jj 提交「开周期 C2 …」，能一键撤销。课程页仍只走 `course_plan`（每门课一笔「计划 …」提交）。

## 要做

### 1. `cycle.mjs accept <库根> <cN> --json`（只读）
上一周期的验收材料，向导第 1 步用：
```json
{ "cycle": "C1", "start": "2026-11-07", "end": "2026-12-25",
  "courses": [ { "slug": "discrete-math-epp", "title": "…", "subject": "discrete-math",
      "goals": [ { "level": "最低", "text": "不查书写出…", "done": false } ],
      "lessons": { "done": 3, "total": 15, "remaining": ["D4", "D5"] } } ],
  "next": { "cycle": "C2", "start": "2026-12-30", "end": "2027-02-16", "mains": ["…slug"], "status": "未开始" } }
```
- courses = 这个周期的**主课**（周期页周模板深度日链接的科目 → `subjectCourses` 找到的课程；辅助/导读课不算）。
- goals 解析课程页 `## Overall Goals` 下的 `- [ ] <级别>：<文字>` / `- [x] …`（级别取全角冒号前的词；没有冒号时 level 为 ""）。
- lessons 用排期表与 `completedIds`（同 `overview` 的算法，能复用就复用）。
- next = `wiki/cycles/route.md` 里紧跟 cN 的下一行（`parseRoute`）；没有下一行为 null。

### 2. `cycle.mjs preview <库根> --from <cN> --start <YYYY-MM-DD> --main <slugA,slugB> --json`（只读、纯计算）
新周期第一周预览（向导第 5 步）：沿用 cN 的周模板，把 cN 的主项科目按顺序换成 `--main` 里的科目（`cycleSubjects(from)[i] → main[i]`；`--main` 只有一个时，第二个主项的深度日照旧显示原科目并标 `"unchanged": true`），辅助科目不变。
```json
{ "days": [ { "date": "2026-12-30", "weekday": "周三", "type": "深度", "subject": "algorithms", "name": "算法", "aux": null } ] }
```
共 7 天。科目短名从 `wiki/subjects.md` / 科目页取（看 `subjects.mjs` 现有的读法）。把计算写成导出的纯函数（输入周期对象 + 映射 + start），测试直接测函数。

### 3. 周期事务 `skills/cycle-plan/cycle-open.mjs`（+ 测试）
```
node cycle-open.mjs stage  <库根> <cN> --workspace <工作区> --json
node cycle-open.mjs check  <暂存目录> --json
node cycle-open.mjs commit <暂存目录> --json
node cycle-open.mjs abort  <暂存目录> --json
```
- **stage**：在 `<工作区>/.cycle/<cN>-<时间戳>/` 下按库内相对路径复制这些文件（不存在的先建空的，记为新建）：`wiki/cycles/<cN>.md`（新周期页）、上一周期页、`wiki/cycles/route.md`、`wiki/subjects.md`、`wiki/index.md`、`wiki/log.md`。`manifest.json` 记每个文件的库内路径、原 sha256（新建为 null）。输出 `{ "staging": "<绝对路径>", "files": ["wiki/cycles/C2.md", …] }`。模型随后用编辑工具改暂存目录里的副本。
- **check**：对暂存的新周期页 `parseCycle`、对暂存的 route `parseRoute`、和库里其他周期一起 `checkOverlap`；`wiki/log.md` 暂存版必须以库里原文开头（只追加）。输出 `{ "ok": true }` 或 `{ "ok": false, "problems": ["…"] }`（失败退出码非 0，但 JSON 照常打到 stdout，同 course-close `check`）。
- **commit**：先跑 check；每个文件的库内现值 sha256 必须等于 manifest 记的原值（否则 `fail("库里 <路径> 在暂存后被改过，重新 stage")`）；`writeAtomic` 写回；`jjCommit(vault, \`开周期 ${cN} ${localDate()}\`, 路径们)`（不是 jj 库就跳过提交、输出 `"jj": "skipped"`）；删暂存目录。输出 `{ "committed": [路径], "jj": … }`。
- **abort**：删暂存目录。
- 测试：stage → 改副本 → commit 后库里内容变了且 jj 有一笔「开周期 C2 <日期>」；暂存后库里文件被改 → commit 拒绝；周期页格式坏 → check 列出问题、commit 拒绝；log 不是追加 → 拒绝；abort 删目录。

### 4. 撤销认得「开周期」：`skills/course/plan-undo.mjs`
revset 加 `description(glob:"开周期 *")`，描述正则改成 `^(计划|顺延|开周期) (\S+) (\d{4}-\d{2}-\d{2})\s*$`（开周期的 slug 位置是 cN）。撤销时涉及开周期提交的文件不做 `lockCourse`（只对课程页锁回）。撤销提交描述照旧「撤销计划 …」，slugs 里含 cN 也可以。`main/data/plan-undo.ts` 的 `PlanCommit.kind` 类型加 `"开周期"`。补测试：一轮里一笔开周期 + 一笔计划 → 一起撤回；只有开周期 → 也能撤。

### 5. agent 工具 `cycle_open`（`apps/desktop/src/agent/tools/cycle-open-tool.ts` + 测试）
照 `course-plan-tool.ts` 的写法：actions `stage | check | commit | abort`，参数 `cycle`（`^C\d+$`）、`staging`；`stage` 自动带 `--workspace <cwd>`；输出原样还给模型（check 失败不抛）。在 `agent/session.ts` 注册（和 course_plan 同处）；`agent/guard/roles.ts` 只许总控（control）调用，其他角色拒绝的文案照 course_plan 的写法：「建周期在总控会话里做」。守卫测试补一条。

### 6. 协议与主进程
`shared/data-protocol.ts`：
```ts
| { kind: "cycle.accept"; cycle: string }
| { kind: "cycle.preview"; from: string; start: string; main: string[] }
```
结果类型 `CycleAccept`、`CyclePreview`（字段同上面 JSON），`isDataRequest` 校验（cycle 匹配 `^C\d+$`，start 是合法日期，main 1–2 个 slug）。`main/data/handler.ts` 路由到 `cycle.mjs accept / preview`，照现有 `cycle.overview` 的写法加转换函数与测试。

### 7. 技能文字 `skills/cycle-plan/SKILL.md`
「新建周期」第 5 步的写入改成：周期层文件（新周期页、上一周期页的 Acceptance / Log、路线页、`subjects.md`、`index.md`、`log.md`）一律经 `cycle_open`：`stage` → 改暂存目录里的副本 → `check` → 用户说可以 → `commit`；课程照旧经 `course_plan`。「读写边界」里 `wiki/cycles/` 等改为「经 `cycle_open` 写」。只改这两处，跑 `npm run lint:skills`（仓库根目录）0 错。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | grep -E "^# (pass|fail)" && npm run -s lint:skills && cd apps/desktop && npm run -s typecheck && npm run -s lint && npx vitest run src/main src/shared src/agent 2>&1 | grep -E "Tests|Test Files" && npm run -s build >/dev/null && echo build-ok
```

## 结束报告（中文，写到 `docs/desktop/batch-cycle-open-data.report.md`）：每一节做了什么、新增/改动文件、验收输出、没做或有疑问的地方。
