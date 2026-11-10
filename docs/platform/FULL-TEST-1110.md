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
