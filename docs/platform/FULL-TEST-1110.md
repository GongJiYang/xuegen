# 学根全量测试计划（用户 2026-11-10 要求，v0.10.0 之后）

目标：把学根当前所有非界面讨论范围内的功能完整测一遍，找出 bug 并修好。范围是**已有功能是否正确**，不改界面设计（界面暂停中，见记忆 xuegen-ui-hold；测到界面问题只记录，放进界面讨论）。

## 方法（用户指定，技能在 `pi-learning/.claude/skills/`）
- **找 bug**：`systematic-debugging`——先四步查清根因（复现 → 收集证据 → 假设 → 验证假设），根因没查清不许改代码。
- **修 bug**：`test-driven-development`——先写一个会失败的测试（证明 bug 存在），再改代码让它通过。返修按分工交给 DeepSeek，任务单里写明「先写失败测试」。
- **报完成前**：`verification-before-completion`——自己重跑验证命令、贴出输出，才能说「好了」。
- **界面点击**：`webapp-testing`（Python Playwright，已装）。学根是 Electron，不能让它直接 launch；用 `chromium.connect_over_cdp("http://127.0.0.1:9460")` 接测试窗口（该技能没有专门支持 Electron，用法要自己适配；旧的 CDP 小脚本 `/tmp/xg-e2e/cdp.mjs`、`say.mjs`、`steps.py` 也可用）。

## 测试环境（每次都这样，不碰真实数据）
- 库副本：`/tmp/xg-e2e/prepare.sh`（从 `~/xuegen-data/vault` 复制到 `/tmp/xg-e2e/vault/GJY`，打标记）；测完 `/tmp/xg-e2e/check.sh`。
- 启动：`mkdir -p /tmp/xg-e2e/workspace && cd xuegen/apps/desktop && env $(env | grep -oE '^(ANTHROPIC|CLAUDE)[A-Z_]*' | sed 's/^/-u /') XUEGEN_HOME=/tmp/xg-e2e/home XUEGEN_DESKTOP_CWD=/tmp/xg-e2e/workspace npx electron-vite dev --remoteDebuggingPort 9460`（**必须带 `XUEGEN_DESKTOP_CWD`**，否则收课暂存写进真实工作区）。
- 只关自己开的进程（按 9460 端口找 pid）。真实 Anki 不连（用假 AnkiConnect，见 `anki-sync.test.mjs` 写法）；**绝不直接打开 Anki 的 collection.anki2**（记忆 anki-db-hands-off）。
- 模型：测试 home 用 OpenDesign `deepseek-v4.1-flash`；要造断线就用 `/tmp/xg-e2e/flaky-llm.mjs`（改测试 models.json 的 baseUrl，测完从 `.bak` 恢复）。

## 分工
Claude 负责 A、C、D 和全部审查；DeepSeek 负责 B（每张单子 10–15 分钟、只写测试并报告失败，不改产品代码；一次只跑一个，配看守 `/tmp/xg-watch-pi.sh`）。B 里发现的 bug 由 Claude 按 systematic-debugging 查根因，再写返修单交 DeepSeek（TDD）。

### A. 机器检查（Claude）
1. `apps/desktop`：typecheck、lint、test、build；仓库根：test、lint:skills。各连跑 3 遍。
2. 偶发失败：疑为 `renderer/skins/use-skin.test.ts`「loads a registered skin」负载下超时——用 systematic-debugging 查根因（复现：`npm test` 连跑 / 并发负载下单跑）。

### B. 脚本端到端（DeepSeek，每组一张单子，用库副本或临时库）
1. `cycle-plan/cycle.mjs`：day / week / month / overview / check 在周期首日、末日、推迟后的 W8、周期之间、路线最后一个周期之后；有无 route.md；辅助课晚、主项课晚。
2. `course/course-schedule.mjs`：plan（含 `--elastic`、`--extra`、`--days`、放不下时 suggestedEnd）、shift（有无 `end=`、复习挪到今天、连续多天没学）、next。
3. `course/course-close.mjs`：stage / check / commit / abort / undo / recover / shift / snapshot / schedule（plan 暂存）；冲突、崩溃恢复、撤销后又改过、非本课路径。
4. `course/course-state.mjs` + `render-board.mjs`：lock / unlock / verify / dashboard / list / after-read；`_generated/` 不存在时。
5. `reading/bookshelf.mjs` + `reading-queue.mjs`：today / plan / lecture / index；add / note / verify；书房为空、计划内两本、核心页。
6. `wiki-save/anki-sync.mjs` + `flashcards.mjs`：push（新增、重复、关联回填、多块同正面、缺 END 的块）、dry-run、stats / add。用假 AnkiConnect。
7. `wiki-save/vault-lint.mjs`、`calendar/calendar.mjs`、`bin/xuegen-data-root.mjs`。
8. 权限：`guard` 三种角色 × 读 / 写 / 编辑 / bash 的矩阵，含沙盒（`sandbox.e2e.test.ts` 那套）。

### C. 桌面端真机（Claude，测试窗口，Bear 皮肤；每一项截图存 `/tmp/xg-e2e/full-1110/`）
1. 今日卡：主项、辅助、讲后读「读完了」、书房「读完这段」、自由读、Anki 入口；周期第 1 天、整合日、休息日（用 `--date` 无法改界面日期，就造副本数据）。
2. 面板：今天 / 总进度（预计结束、周期卡、时间轴格子、课程卡、全部 N 节、改计划）/ 阅读（加入阅读、候选列表）/ 卡片 / 日历（写一天、讲后读显示）/ 技能（停用某技能）。
3. 输入框：`/` 菜单、风格切换（默认 / 大白话 / 细讲 / 深度）、IME、Esc、排队消息、停止。
4. 会话：总控、开课（8 步）、收课（三种：正常 / 不写概念页 / 不记录）、撤销收课、存档点、上下文 60% 提示、会话列表切换、更早的对话。
5. 总控：建课、改计划（course_plan stage → schedule（主项 `elastic: true`）→ check → commit）、「顺延今日内容」、日历写入、让总控说说。
6. 断线重试（flaky 服务，失败 1 次 / 2 次 / 3 次都失败）——已知：连续 2 次时第一条不撤（界面讨论项，只记录）。
7. 检查更新（已是最新 / 有新版）。
8. 控制台报错：每个面板打开后抓 console error。

### D. 用户场景回归（Claude，测试窗口里扮演用户，对照 `~/Desktop/学根改动与核实-2026-11-08.md` 表格）
「以后讲离散都…」只写离散科目页；「这次讲细一点」不写文件；低强度日问「今天学什么」只列一本书的下一段；上下文 60% 先存档再提示；新会话回到科目默认风格；课上读原书一次 ≤ 10 页。

## 记录与收尾
- 每个发现记一行：现象 / 复现步骤 / 根因（systematic-debugging 的结论）/ 修复提交 / 验证输出。表放在本文件末尾「发现」一节。
- 全部修完：A 全套重跑 + 受影响的 C 项重测，按 verification-before-completion 贴证据；更新 PROGRESS；问用户发版。

## 发现
（新会话从这里开始填）

| # | 项 | 现象 | 复现 | 根因 | 修复 | 验证 |
|---|---|---|---|---|---|---|
| A1 | 机器检查 ×3 | 全绿：typecheck/lint/build 过；vitest 1076 过 1 跳过 ×3；根 443/443 ×3；lint:skills 0 错 1 警告 | — | — | — | `/tmp/xg-e2e/full-1110/*.log` |
| A2 | use-skin 偶发失败 | 「loads a registered skin」`expected null not to be null` | CPU 跑满单跑 6 次败 2 次 | 第一个冷加载 bare 皮肤 + 样式约 1.0–1.13s，`waitFor` 默认 1000ms；只是测试计时，产品无此超时 | 单 `batch-full-a2-skin-flake.md`（DeepSeek：两个 waitFor 加 timeout 5000） | 负载下 8 次 0 败（Claude 重跑） |
| B1 | cycle.mjs 端到端 | 8 条新测试全过，无疑似 bug（`cycle.full.test.mjs`）；库副本 151 天逐日 0 违例；check ok | — | — | — | Claude 重跑 8/8 |
| B1 注 | 周期之间 | 下一周期没有周期页时 `day` 返回 cycle null、month 不列；今日卡在 C1 结束到 C2 建页之间会空——设计如此，提醒总控按时建下周期页 | — | — | 不改 | — |
| C2/C8 | 六个面板 | 全部打开无 console error；截图 `full-1110/c2-*.png` | — | — | — | — |
| C2 注 | 日历辅助行 | 当天没有辅助课时显示科目短名「C」，有课时显示课程短名「C 语言」——`cellAuxTag` 刻意回退，命名不统一 → 界面讨论 | — | — | 不改 | — |
| C1 | 读完这段 / 读完了 | 书房位置 +1、排期整体顺延到 01-29、日志一行；课程页讲后读打勾并重新上锁 0444、书房日志一行；无报错 | — | — | — | jj diff |
| C1 注 | 讲后读打勾后旧备注 | 行尾 AI 写的「——今天开课时问过…仍待读」打勾后保留，文字矛盾 → 界面/技能小尾巴 | — | — | 不改 | — |
| B2 | course-schedule 端到端 | 8 条（`course-schedule.full.test.mjs`），1 条疑似 bug：D1 未完成、D2 提前完成时 shift 后两节同一天 | B2 报告复现命令（`/tmp/b2-repro`） | `shiftSchedule` 统一后挪未完成课，已完成的不动 | **用户 11-11 定：已完成的课不占日子，D1 就放今天**——撤回 fix1 的放置逻辑（fix1b），测试改成新规则 | fix1b 后 `course-schedule.mjs` 净改动为 0；新规则测试 36/36、根 461/0（Claude 重跑） |
| B2 注 | next | `next` 不看完成状态（全部完成仍返回当天行）——记录，不改 | — | — | — | — |
| C3 | 输入框 | `/` 菜单 12 项、输入过滤、Esc 关菜单保留文字；风格四档 radio 切换正常 | — | — | — | — |
| C4 | 开课 CTM D1 | 8 步走全：读课程页+偏好、course_close shift、cycle day、定核心页、今日要点；无报错 | — | — | — | — |
| C4/D | 课上读原书 > 10 页 | `pdftotext -f 1 -l 20`、`-f 40 -l 58`、`-f 60 -l 76` | 测试窗口开 CTM D1 | 规矩只在 SKILL.md 文字里，没有强制 | fix2（bash 护栏：pdftotext 缺 -f/-l 或 > 10 页拒绝；非数字放行）+ fix4 补角色名 | guard 176/176（Claude 重跑）；真机：离散 D3 开课 `-f 89 -l 101` 被拦（理由带「课程会话（discrete-math-epp）」），模型改成 89–96、97–104 两次读 ✓ |
| C4 | 正常收课 | 5 分钟，jj「收课 ctm」、课程页 0444、新概念页 3 个、看板刷新 | — | — | — | jj log |
| C4 注 | 跨午夜收课 | 课 11-10 上、00:01 收，jj 描述用提交时日期「2026-11-11」，页面内容是 11-10——小偏差，记录 | — | — | 不改 | — |
| C4 | 撤销这次收课 | 模型没调 `course_close undo`，又做了一次「抵消」收课（jj 多一个「收课」） | 收课后点按钮 | `strings.ts` `undoClosePrompt` 还写旧的「第 3 步抵消」，与 SKILL.md 第 9 步（undo）矛盾 | fix3（DeepSeek，+1 测试） | 新文案真机：模型调 `course_close undo`，jj「撤销收课」✓ |
| C4 注 | 连撤两次被拒 | 撤掉「抵消」那笔后再撤原收课 → 「之后又被改过」拒绝；按提交历史判，不看净内容；提示「先处理那次改动」误导（那次已撤） | 上述顺序 | `undo` 只看之后有无提交碰过同文件——**设计如此**，已有测试 `course-close.test.mjs` 815 行「按设计拒绝」；只是提示语对「已撤过」的情形不准 | 不改 | — |
| C4 注 | 沙盒里 `jj log` | 课程会话 bash 跑 `jj log` → `git_import_export.lock Operation not permitted`；输出里常带 `sandbox_violations sysctl-read` 噪音 | — | 沙盒不许写 `.jj/repo` | 记录（可考虑 `--ignore-working-copy` 或 ignoreViolations） | — |
| C4 注 | 会话列表 | 列表只读「当前会话所在目录」；测试 home 旧会话在 `--Users-gjy-learning--`、新会话在 `--tmp-xg-e2e-workspace--` → 新会话不在列表。真实应用 cwd 固定 `~/learning`，不受影响；若以后改默认 cwd 会丢旧会话 | — | `listSessions` 用 `dirname(current)` | 测试 home 已合并目录；记录 | — |
| C1 注 | 书房「晚了 1 天」 | 次日仍显示晚 1 天：late = 预计读完日 − 原计划读完日，设计如此 | — | — | 不改 | — |
| C5 | 让总控说说 | 简报正常；「90 分钟」是周期规定课时（c1.md），不算估时 | — | — | — | — |
| C5 注 | 简报「明天 CTM D2」 | D1 没完成，明天顺延后其实是 D1——模型推断偏差，记录 | — | — | 不改 | — |
| C1/C5 | 讲后读打勾后旧备注 → 简报误报「讲后读存疑」 | AI 写的「——…仍待读」尾注打勾后保留 | 点「读完了」后第二天看简报 | `course-state.mjs afterRead` 只换勾+加尾注 | fix4（去行尾 —— 备注，+测试）；fix5 附带：括号深度 0 的第一个 ——（备注自带括号时） | course-state 13/13（Claude 重跑） |
| C4 | 「不记录，直接结束」后出「撤销这次收课」 | 没写文件（已核实），但按钮变撤销，点了会撤上一次真收课 | 收课 ▾ → 不记录 | 「不记录」也用 `close` 标记，`lessonActions` 见 close 就给撤销 | fix5（新标记 `close-skip`，+测试） | 真机：C 语言课「不记录」后按钮回到「总结 · 制卡 · 收课 ▾」、无文件写入 ✓ |
| C7 | 检查更新 | 只在原生菜单；开发模式显示「开发模式不检查更新」，测试窗口测不了 | — | — | 跳过（发版时装包验） | — |
| C6 | 三次都失败 | 三行「正在自动重试（第 n / 3 次）」都留着 + 顶部横幅与行内各一条错误（重复）——界面讨论 | flaky FAILS=99 | — | 记录 | 截图 `c6-allfail-*.png` |
| C6 | 错误分类 | ① 假服务 503 `overloaded_error` 显示「请求太频繁」（`model-error.ts` 把 overloaded 归限流，刻意）；② 真实 OpenDesign 503 `database_unavailable` 显示泛泛的「模型出错了」——5xx 缺「服务暂时不可用」一类 | — | `translateModelError` 无 5xx 分支 | 记录 → 界面讨论（重试提示文案） | — |
| C6 | **OpenDesign 503 不自动重试** | 离散 D3 开课中途 503，直接「模型出错了」，没有重试行 | 真实中转 503：`resolve Billing Scope: status 503: database_unavailable` | pi-ai `isRetryableAssistantError` 的不可重试表含 `billing`（本意是额度用完）；OpenDesign 的临时 503 文字里有「Billing Scope」→ 被当成额度错误直接放弃。11-09/11-10 的 `workspace_billing_scope_unavailable` 同理 | 用户 11-11 定补重试 → fix6：`agent/transient-error.ts` 包 `_isRetryableError`（503 + billing scope / database_unavailable，且不含 quota/balance/insufficient），测试钉住 Pi 的方法名 | 15/15；真机：假服务回 OpenDesign 原文 503 两次 → 自动重试、第 3 次成功 ✓ |
| C4 | 收课，不写概念页 | 离散 D3：jj「收课 discrete-math-epp」，只动课程页、log、看板、截图，没有概念页 ✓ | — | — | — | find -newer |
| C4 | 会话列表标题「语言 D1」 | C 语言课行标题少了「C」且没有课次内容 | 开 C 语言课后看会话列表 | `session-list.ts` `pinHead` 按第一个空白切短名，「C 语言」本身带空格 | fix7（从末尾取 D/R 课次 id，+测试） | board 211/211（Claude 重跑） |
| C4 | 讲后读在书房记两次 + 「讲后读 讲后读 D1」 | 界面「读完了」记过一次，第二天开课模型又 `bookshelf lecture` 一次；标签重复前缀 | 点「读完了」→ 次日开同课 | `lecture` 不查重；脚本固定加「讲后读 」前缀而技能示例 label 也带 | fix8（同课同页不再记、返回 already，标签去「讲后读」前缀） | bookshelf 67/67；真实书页副本重跑 lecture → already:true、无新行（Claude） |
| C4 注 | 开课仍问已读的讲后读 | 打勾前写的「仍待读」尾注还在（fix4 之前的数据），模型据此再问 | — | 旧数据 | fix4 之后新点的不再出现 | — |
| C5 | 日历写入 | 总控 `calendar_write` 写 `wiki/calendar/2026-11-13.md`，guard 记 allow ✓；提醒那天是整合日 | — | — | — | — |
| C5 | 顺延今日内容 | 总控 `course_plan shift`（today=明天），jj「顺延 discrete-math-epp」「顺延 c-language」；CTM/数据结构今天无课不动 ✓；C 语言 D13 进「留到下个周期」 | — | — | — | jj log |
| C5 注 | 建课 / 改计划 | 11-10 18:02 已真机验收（整理 1），本轮未重测 | — | — | — | — |
| D | 「这次讲细一点」 | 照做，不写文件 ✓ | — | — | — | find -newer |
| D | **「以后讲离散都…」写不进科目页** | 模型：「课程会话写不了科目页，去总控说」——没有写入通道 | 课上说「以后讲离散都先给证明策略」 | guard 拒课程会话写所有科目页；收课暂存不含科目页（只计划暂存有）。guard 理由里写着本意「讲解偏好只写本科目页那一节」 | fix9（`add` 本科目页、check 只许改讲解偏好节 ≤15 行、标签「偏好」，+11 测试）+ Claude 改 SKILL.md/close.md | close 119/119、tools 53/53；真机见下 |
| D 注 | 新会话回到科目默认风格 | 离散/CTM 会话显示「默认 · 细讲」、C 语言「默认 · 大白话」——按科目默认 ✓ | — | — | — | 截图 |
| B3 | course-close 真实课程页 | 5 条（`course-close.real.test.mjs`）：4 门有排期的课原样 check 全过；最小收课 → commit、0444、看板刷新、jj「收课」；计划暂存 `--elastic` 不写 end=、jj「计划」；undo 逐字恢复 ✓ | — | — | — | Claude 重跑 5/5 |
| B3 注 | 课程页行数 | 离散 181、CTM 178（上限 200）——再一两次收课就可能被 check 拒；靠技能「只留最近 2 次收课记录、旧的归档」维持，记录 | — | — | 不改 | — |
| B3→B1 | 新测试依赖会变的库副本 | B1 情况 8 写死「12-25 无周期」，测试窗口顺延后变红 | — | 测试读 `/tmp/xg-e2e/vault/GJY` 却断言具体日期，且没 skip | fix10（skip + 按实际 C1 end 断言） | 8/8（Claude 重跑） |
| D | fix9 真机 | 离散课「以后讲离散都先给证明策略」→ `stage` → `add wiki/subjects/discrete-math.md` → 改讲解偏好 → `check` → `commit label 偏好`，jj「偏好 discrete-math-epp」✓ | — | — | fix9 + Claude 改 SKILL.md 124 行、references/close.md | jj diff |
| D 注 | 替换偏好时删掉了同一行里另外两条 | 旧行「定义先问排除了什么；定理先给证明策略；讲完请复述」整行被换成新的一条 | 上一行 | 技能写「与旧行冲突就原地替换」，模型整行替换 | Claude 改 SKILL.md：只替换冲突的那一条，其余保留，提议时给出旧行原文 | 待下次真机 |
| C4 | 存档点 | 离散课说「换个新会话接着上，先存个档」→ jj「存档点 discrete-math-epp」，只动课程页 Next Session、log、看板 ✓ | — | — | — | jj log |
| C4 注 | 上下文 60% 自动提示 | 本轮没把会话撑到 60%，未测（11-08 场景表项）——记入待测 | — | — | — | — |
| B4 | course-state + render-board | 24 条（`course-state.full.test.mjs`），3 todo：T1 verify 漏报无标记页（死代码）；T2 `* [ ]` 看板数、list 不数；T3 `## This Week（…）` 看板认、list/verify 不认 | B4 报告 | T1 `listCourses` 默认先滤掉无标记页；T2 两套任务正则；T3 精确 vs 前缀标题匹配 | fix11（verify 用 requireMarker:false + 词边界 hasMarker；共享 isTask/isTaskDone；标题前缀规则统一） | 53/53；库副本 verify OK 9 门（Claude 重跑） |
| B4 注 | 报错格式 | lock/unlock/after-read/verify 传不存在路径时抛 Node 原生栈（ENOENT），不是中文 `course-state:` 报错——记录 | — | — | 不改 | — |
| C3 | 排队消息 | 回答中发第二条 → 显示在对话里、提示「发出后排在这条回答之后」✓ | — | — | — | 截图 `c3-queue.png` |
| C3 | 停止 | 「已停止。可以继续提问，或点「重试」。」✓ | — | — | — | 截图 `c3-stopped.png` |
| C3 | **停止后排队的消息乱序送出** | 停止后排队那条显示成已发、没人回；用户再发新消息后，模型先答新消息、再突然答那条旧的 | 回答中发 A → 再发 B（排队）→ 停止 → 发 C：会话文件里顺序是 C、答 C、B、答 B | Pi `abort()`（agent-session.js 1941 行）不清跟进队列；`turn.ts` 在交给 Pi 之前就把 B 画进对话 | **待用户定**：停止时 `clearQueue()`，B 怎么显示（撤掉 / 放回输入框）属界面讨论 | — |
| B5 | bookshelf + reading-queue | 12 条（`reading.full.test.mjs`），1 todo：同一天 `done` 两次前进两段、两条记录 | B5 报告 | — | **待用户定**：允许一天读两段（界面有撤销倒计时，误点不了），还是脚本加防重 | — |
| B5 注 | 真实库没有 `wiki/reading/` | 渐进阅读队列没用起来，verify「0 个阅读页」——正常 | — | — | — | — |
| B3/B5 | 新测试整库复制 816MB | 根 npm test 20s → 52s | — | 复制了 raw/ PDF 与 .git | fix12（只复制 wiki/） | 两文件 40s → 6.4s；根 npm test ≈40s（剩余是既有 course-close.test.mjs 的 jj 用例 ≈37s） |
| B6 | anki-sync + flashcards（假 AnkiConnect） | 16 条（`anki.full.test.mjs`）：新增回填幂等、重复回填、dry-run 不发请求且文件不变、连不上中文报错 ✓；1 todo：末尾块缺 END 静默消失 | B6 报告 | — | — | — |
| B6+ | **中间块缺 END 粘成一张错卡** | （读代码发现）A 缺 END、B 完整 → A 吃到 B 的 END，两块合一，往 Anki 写错卡、B 丢失 | 见 fix13 单 | `parseCardPage` 找 END 不在下一个 START 停 | fix13（遇 START 先停，记 broken 进 failed；stats 加 broken 与提示） | wiki-save 95/95；复现：A 进 failed「缺少 END」、B 独立待同步（Claude 重跑）；库副本 broken 0。卡片面板显示 broken 数 → 界面讨论 |
| B8 | 权限矩阵 | 不另派：`roles.test.ts` 121 条参数化用例 + `sandbox.e2e.test.ts`（真 seatbelt，本机跑）已覆盖三角色 × 读/写/编辑/bash；真机今天又见：课程会话写科目页被拦（fix9 前）、pdftotext 超页被拦、总控调 course_close 被拒 | — | — | — | vitest 全绿 |
| B7 | vault-lint / calendar / xuegen-data-root | 21 条：data-root 幂等、dry-run 不写、旧中文布局拒绝、冲突不留半套 ✓；`.gitkeep` 不误报 ✓；3 todo | B7 报告 | — | — | — |
| B7 注 | vault-lint 不查断链、不查 frontmatter | 它按文件头只是「命名检查」（VAULT-NAMING），断链只在 rename-vault 收尾查、frontmatter 只在收课 check 查——范围之外，**待用户定**要不要扩 | — | — | 不改 | — |
| B7 | calendar month 接受 2027-13 | 返回空月、退出 0 | `calendar.mjs month <v> 2027-13` | `isMonth` 只查格式不查 01–12 | fix14 | 30/30；`month 2027-13` 报错退出 1（Claude） |
| **真实使用** | **装好的学根找不到 jj：收课/计划/顺延从没进 jj** | check.sh 发现真实库 11-10 23:49 后有改动但无 jj 记录；真实会话里 5 次 `"jj": "failed: Error: spawnSync jj ENOENT"`；旧会话还有 `node`/`pdftotext: command not found` | 真实 v0.10.0 总控顺延 | 访达启动的应用 PATH 只有 `/usr/bin:/bin:…`，jj 在 `/opt/homebrew/bin`；`jj.mjs` `execFileSync("jj")` 失败被吞成字符串；测试窗口从终端启动所以没发现 | fix15（`environment.ts` `withToolPath` 启动时补 `/opt/homebrew/bin`、`/usr/local/bin`，+测试） | 复现：最小 PATH 下 `spawnSync jj ENOENT`；修后测试窗口用访达式 PATH 启动，存档点 `"jj": "ok"`、jj 新提交 14:46 ✓ |
| 真实使用注 | 数据没丢 | 文件已写进库，只是没单独记 jj；下次 jj 快照会收进工作副本。这几次撤销不了 | — | — | — | — |

## 收尾（11-11 14:50）
- 全套机器检查：typecheck/lint/build 过；vitest 1106 过 1 跳过；根 578 过 0 败 3 todo（3 条都是待用户定：B5 一天 done 两段、B7 vault-lint 断链 / frontmatter）；lint:skills 0 错。
- 测试窗口已关；check.sh：真实库与 ~/.xuegen 的改动来自用户自己的真实学根（guard.log 里 11-11 12:04/12:29 的会话），测试没碰真实数据。
- 全部改动未提交。真实学根要等发版才拿到这些修复（尤其 fix15：在那之前装好的学根收课/计划不进 jj、撤销收课不可能成功）。

## 用户 11-11 定
1. 停止并清排队，排队消息放回输入框。2. 一天两次 done 拦截。3. vault-lint 加断链与 frontmatter 检查。

## 三件的结果（11-11 16:00）
| 单 | 改动 | 验证 |
|---|---|---|
| fix16 | `bookshelf done` 同一天第二次报「今天这段已记过」、不写文件（B5 todo 转正） | reading 116/116（Claude 重跑）；讲后读记录不算、界面当天只显示 ✓ 不出按钮 |
| fix17 | vault-lint 加 `broken-link`、`frontmatter`（只查概念页，文字同收课 check）；B7 两条 todo 转正 | wiki-save 103/103；DeepSeek 两次 503 后剩 1 条测试数据写错（链到存在的页），用户同意 Claude 改一行。**真实库**：wiki/ 断链 0（原「53 条」都在 raw/articles 原文里，不查）；57 页老概念页补 `sources: []`（注「老页，出处未记录」，用户同意，备份 `/tmp/vault-backup-1111-concepts-fm/`，jj `3b35f4ff`）→ 真实库 vault-lint OK |
| fix18a | 停止时先 `clearQueue()` 再 `abort()`；撤掉最后 n 条用户消息，新事件 `messages-removed` | DeepSeek 自测 + Claude 复核 |
| fix18b | renderer `queuedSentRef` 跟 `queuedFollowUps`；stop 还排队原话（多条空行连）；Bear 输入框有字时放在前面 | DeepSeek 写测试后 503，Claude 按单实现（用户同意）；审核单 fix18c 两次 503，用户让 Claude 审：无阻塞问题，小尾巴见下 |
| 真机 | 测试窗口总控：甲回答中排队乙 → Esc → 乙撤出对话、回到输入框 → 发丙 → 只答丙；会话文件只有甲、丙 | `fix18-1/2/3*.png`；check.sh 真实数据无改动 |

小尾巴（fix18 审核）：① 回答中有排队时刷新窗口再停止，可能把正在回答的那条从画面撤掉（Pi 记录不丢，再刷新回来）；② 连发两条的瞬间恰逢状态回传，放回输入框可能少一条。都不挡发版。

## 顺延说明（回答用户 11-11）
- 某门课今天没上（或总控「顺延今日内容」）→ 这门课没上的那节挪到**这门课自己的下一个上课日**（不是一律明天；如离散周一三，周三顺延 → 下周一），后面各节按同样的上课日数整体后推，**不跳课、不压缩**。
- 主项课：不设截止日，所以周期实际结束日跟着往后推（7 周学时不变、日期后移，后面周期一起平移）——符合用户 11-10「周期固定 7 周学时、不固定日期」。
- 辅助课：仍守周期结束日，排不下的最后几节进「留到下个周期」，不拉长周期。
- 已完成的课不占日子（用户 11-11 定）；复习交 Anki，不随顺延。

## 有逻辑没界面（汇总给界面讨论；带 ? 的待核对）
- 卡片缺 END 的块数（脚本 `broken` 已有，卡片面板不显示）。
- 收课历史与撤销：只能「刚收完课」时撤一次；jj 里的收课 / 存档点 / 偏好 / 计划 / 顺延记录没有地方看。
- 讲解偏好：能记（fix9），但界面看不到某科目当前有哪些偏好、不能删改。
- 当前流程步骤（开课第 n/8 步）：脚本 / 技能有步骤表，界面只显示「学根做了 N 步」。
- 周期推迟天数、「留到下个周期」的课次：数据有，总进度里是否完整显示?（待核对）
- 渐进阅读队列（reading-queue 的 推后 / 暂停 / 笔记）：脚本齐全，阅读面板只有加入与今天该读?（待核对）
- vault-lint、course-state verify 结果：只在命令行 / 看板网页，桌面不显示。
- 检查更新：只在原生菜单。
- 会话列表只读当前会话所在目录。
- 没逻辑也没界面：课程停用 / 归档（course_plan archive）、英文术语卡（双向）。
