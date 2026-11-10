# PROGRESS（更新于 2026-11-10 19:30；最新发布 v0.7.0；阶段 1、2 已本地提交未推送；阶段 3 进行中）

## ▶ 下一步（新会话直接从这里开始）

**总清单 = `docs/platform/ROUTE-1109.md`。每次报告末尾附阶段完成表（记忆 xuegen-route-progress）。界面相关一律暂停（记忆 xuegen-ui-hold）。用户 11-09：先不发版。**
**派活规则**：Devin 一次一批；DeepSeek 一次只跑一个、单子切小（10–15 分钟、先写测试）、命令必须接 `< /dev/null`（见 CLAUDE.md，模型 `deepseek-v4.1-flash` 不带 eco）。OpenDesign 11-09 晚反复 503：断了就接着上次进度重派一次，再断就停下问用户（备选 Haiku 5.5，需用户先在 `.deepseek-agent` 里 `/login` Anthropic）。用户要求「实时盯着、停了第一时间通知」：派 DeepSeek 时同时跑看守 `/tmp/xg-watch-pi.sh`（改里面的 LOG/FILES）。

### 0. 先看后台任务（11-10 19:30 交接）
- **v0.8.0 已发布并已安装**（`7462ff7`，tag v0.8.0；`/Applications/学根.app` = 0.8.0；`~/.xuegen/app` → 安装包资源）。
- **RENAME-DAY：第 0–3 步完成并核对，第 4 步推送待用户执行**（`docs/platform/RENAME-DAY.md`）：
  - 改名已应用：目录 30、文件 160（搬动 119）、链接改写 926 条（164 个文件）、`.gitignore` `raw/学习路径/`→`raw/library/`。库里已是 `wiki/knowledge`、`wiki/shelf`、`clippings`、`raw/library`。
  - 核对全过：按目标比**新增断链 0**（前后都是 53 条老断链）；`wiki/courses` 0555、9 个课程页 0444；`jj st` 无 `A raw/library/`；`bookshelf today`、`cycle.mjs day`、`course-state verify` 正常；vault-lint 60 个问题与试运行一致（老问题，多为「后缀解析」）。
  - 已 `jj commit`：**`ce4adc4c` 「改名：库全英文命名（rename-vault）」**（基线 `796fa733855d`，撤回用 `jj restore --from 796fa733855d`）。
  - **第 4 步推送被 Claude Code 自动模式拦（Git Destructive）**，用户 11-10 19:50 已跑：本地 `main` 书签已移到 `ce4adc4c`，**但 `jj git push` 因网络失败**（LibreSSL SSL_ERROR_SYSCALL 连 github.com:443）。网络好时只需 `cd ~/学根/库 && jj git push`（快进：远端 main 在 `323b010f`）；新 session 先用 `jj bookmark list --all` 看 `main@origin` 是否已到 `ce4adc4c`。
  - **未做**：第 5 步数据根 `~/学根` → `~/xuegen-data`（及子目录改英文、留旧链接、`xuegen-data-root.mjs`）；第 6 步收尾（库 AGENTS.md 去「Migration status」、NEW-MACHINE.md/PROGRESS/prepare.sh 路径、用户在 Obsidian 重新选库）；第 7 步卡片（停 Obsidian_to_Anki 插件、`anki-sync push --dry-run` 给用户看）。第 5 步要用户在场、学根与 Obsidian 退出。
- 之后：0.9.0 删旧名（收缩，清单见 `TIDY-1110.md` §3）→ 界面讨论（显示当前步骤、工具行人话、课程停用通道）。
- 整理 4 技能文字 → `86aa245`（7 处不一致：截图改第 7 步、`.snapshot.json`、周核实经 course_close、讲后读只用 bookshelf lecture、改计划单独成节、SKELETON 1.3、顺延不手改）。
- 整理 1 补测 → `f01018e`；整理 1 真机验收通过（见下）。
- 整理 2 拆分 → `4f0d1b2`（course-close.mjs 487 行 + close/ 6 个模块，测试 65=65，依赖单向）。
- 补模块测试（Haiku，34 条）→ `ab7c1f4`（Haiku 写完后自己又起了一个 DeepSeek 子任务卡住，Claude 杀掉后验收）。
- 整理 1 → `b5f8288`（89/402/1067 全过）；技能改写 → `0b0899c`。补测 + 两处缺口（Haiku，+19）→ `f01018e`。**整理 1 真机验收 11-10 18:02 通过**：老总控会话自己走 course_plan stage → 改暂存 → check → commit，jj「计划 ctm」「计划 xg-test」，新课程页 0444，看板 10 门、verify 通过。发现：**没有删除/停用课程的通道**（记入小尾巴）。原补测单：`docs/platform/batch-tidy1-tests.md`（崩溃恢复把「计划」记成「收课」；`--new` 不写课程页也能提交），日志 `/Users/gjy/pi-learning/haiku-tidy1-tests.log`。之后：测试窗口真机验收总控建课/改计划 → 整理 4。原单：`docs/platform/batch-tidy1-plan-transaction.md`（manifest kind=plan、`stage --new --subject`、`schedule`、「计划」提交；course_plan 去 unlock/lock；总控不能再直写课程页/看板）。交回后审 → DeepSeek/Haiku 补测 → Claude 改 SKILL.md 总控写入路径（stage → 改暂存 → schedule → check → commit）→ 真机验收。
- **用户 11-10 定：先不发版**；先做整理批，改名（RENAME-DAY）放到下次发版同一天做。顺序见 `docs/platform/TIDY-1110.md`「顺序」。4a 已全部完成并验收（`70070c1` 之前），个人路径已清（`2f0fea1`），CHANGELOG 待发条目已写（`09a12b4`）。
- 发版前要用户定：要不要压缩本地提交历史再推（不压也行，同样的路径早已在公开文档里）；`PROGRESS.md`/`docs/platform/` 以后还推不推公开仓库。
- 4a-fix2 截图（Haiku，跑 1 小时后 503，代码已完成；Claude 验收 65/342 全过）→ `0c5a6ca`；技能截图改用 course_close snapshot → `ec93aca`。
- 4a-fix1 → `172b8e5`。OpenDesign 11-10 下午 deepseek/haiku 都间歇 503（workspace_billing_scope_unavailable）；Haiku 5.5 已加进 `.deepseek-agent/models.json`（备份 `/tmp/deepseek-agent-models.json.bak-1110`）。
- 4a-2 回归 → `fcc9f4d`。
- **4a 真机验收（11-10 14:20，测试窗口）结果**：总控 `calendar_write` ✓；总控 `course_plan` unlock/编辑/lock/board ✓（**但老总控会话凭旧技能做事，不会自己用 course_plan**，提示重读后才对）；课程会话 bash 写课程页被沙盒拦 ✓（原因进结果）；收课 stage→check→commit 在沙盒下 ✓，看板进 jj ✓。**发现**：① 沙盒 TMPDIR 目录不存在，here-doc / mkdtemp 全挂（fix1 在修）；② 收课截图：Chrome 在沙盒里起不来 → `course_close snapshot` 动作，任务单 `docs/platform/batch-stage4a-fix2-snapshot.md`（fix1 后派 DeepSeek；之后 Claude 改 `references/snapshot.md` 与收课第 9 步）；③ 总控会话一个周期一个，「技能可能已更新」提醒只发给课程会话 → 任务单 `docs/desktop/batch-control-refresh.md`（fix2 后派 DeepSeek）。验收暂存已删；真实库无改动。
- 重要事实：**装好的 v0.7.0 用 app 包里自带的技能**，不读开发仓库。

### 1. 已交回、已处理（11-10）
- 4a-i1（Devin）`course_plan` + 提交前重画看板 → 本地提交 `70ded22`。Bear 去两处文字 → `295b84a`。3e 存档点 label → `dbc450b`。
- 用户 11-10：整体架构不乱；Claude 建议 4a 后、界面讨论前插一个**整理批**（拆 course-close.mjs 1138 行、修 FEATURE-WIKI 列的 6 处技能不一致、清 path.test.ts 个人路径、提交文档）——**用户 11-10 同意**，计划 `docs/platform/TIDY-1110.md`（已排进 ROUTE）：4a 完 → 清个人路径 + CHANGELOG → 发 0.8.0 → RENAME-DAY → 整理 1/2/4（每条发 0.8.x）→ 0.9.0 删旧名 → 界面讨论。
- 3d（Devin）`course_close shift` + SKILL.md 开课第 3 步改用它 → 本地提交 `c32672d`。4a-1 沙盒代码 + DeepSeek 12 条配置测试（沙盒没有一处比 guard 宽；剪藏 `clippings` 是刻意窄，bash 不能写，走 write 工具）→ 本地提交 `2150f12`。拆 useChat（Devin，307→240 行，只搬接口）→ 本地提交 `788eb15`。3d 补测（DeepSeek，中途 503 重派一次；+9 node +3 vitest，修顺延出错残留暂存）→ 本地提交（git log 最新一条「3d 补测」）。
- 3b（DeepSeek）审完，43 条测试含真 jj → 本地提交 `44ee2f2`。3c 补测（22 条）+ 审计 → 本地提交 `037283d`。
- 4a-1（Devin）交回：`apps/desktop/src/agent/sandbox/{config,runner,README}`，未接入、未提交；sandbox-runtime 锁 0.0.81。自测 8 条：受保护写/mv/读凭据/外网都拦住；Anki 直连被拦；wrap 每条约 174ms。用户 11-10 定（已写进 `STAGE4A-DESIGN.md`）：**Anki 走代理**（不开 allowLocalBinding）；**看板由 course_close 提交时进程内重画**，`coursesBoard` 留在 denyWrite。Devin 报告里还有：control 的 `cycles` 在 allow 与 deny 里重复（deny 优先，等 4a 接入时清掉）；`sysctl-read` 违规噪音可用 `ignoreViolations` 收。
- 顺延修复（DeepSeek，+5 测试）+ SKILL.md 加 `--end` → 本地提交 `b0f3563`。用户同意后已对真实库 C 语言页顺延（D1→11-11、D13 12-23、D14 进「留到下个周期」、标记 `end=2026-12-24`），刷新看板，jj 提交 `796fa733`；备份 `/tmp/vault-backup-1110-shift/`。
- 用户 11-10 定：撤销收课时**改过的恢复，新建的页面保留并列出** → DeepSeek 已改（+2 测试）→ 本地提交 `c7ed8c0`。

### 2. DeepSeek 队列（一次一个）
（空）下一张：4a 接入后的 4a-2 回归测试。

### 3. Devin 队列（一次一批）
1. 4a-i1（在跑）→ 4a-i2：guard 改写 bash + `calendar_write` + anki-sync 走代理（`cycle_write` 用户 11-10 定不做）。接入时还要定：`<home>` 下凭据命名规则沙盒表达不了（bash 仍可读名字含 token/key 的文件）。

### 4. 阶段 3 真机验收 —— 11-10 完成（副本 `/tmp/xg-e2e/vault/GJY`，模型 OpenDesign deepseek-v4.1-flash）
- 全过：1 正常收课、2 无关改动不被收走、3 冲突（报 conflict、abort、库不动）、4 撤销（撤最近一笔，之后又改过就拒）、5 崩溃恢复（recover 补完、上锁、jj 提交、幂等）、6 权限（直写课程页/概念页拦、收别的课拦、总控调 course_close 拦）、7 开课顺延走 course_close shift。真实库与 ~/.xuegen 无改动；测试暂存已删。
- 发现并处理：① 模型不认可顺延结果会手改日期 → SKILL.md 已加「顺延结果照单接受」（随 3e 提交）；② 存档点提交也叫「收课」，撤销会撤错 → DeepSeek 已返修（+3 测试）并与 SKILL.md 一起本地提交（阶段 3e）。
- 小记：收课后看板（courses.md/html）由 bash 刷新、不进事务，留在 jj 工作副本里未提交——4a 接入时 course_close 提交时重画看板，一并解决。

### 4b. 用户 11-10 界面反馈（界面讨论时一起定；去掉两处文字用户已直接同意）
- 去掉「复制 Markdown」、去掉「（太久了可以点输入框的停止）」→ 任务单 `docs/desktop/batch-bear-trim-1110.md` 已写；**Devin 派发被自动模式拦（Create Unsafe Agents）**，等用户自己跑或放行。
- 运行时显示「正在做哪一步」（开课、收课等固定流程显示「开课 · 第 3/8 步 · 顺延排期」），代替「学根做了 N 步」+ 计时：要出设计稿。依据 `docs/platform/FEATURE-WIKI.md`（11-10 新写：功能 → 技能 → 步骤）。
- 工具步骤行（`read {"path":…}` 原样 JSON）不好看：要出设计稿（改成人话：「读课程页」「顺延排期」）。
- 测试窗口曾误用 DeepSeek 官方直连（测试 home 模型清单没有非 eco 版，已补 `deepseek-v4.1-flash`）；真实 `~/.xuegen/models.json` 也只有 eco 版，要不要加待用户定。

### 5. 之后
4a 接入（guard 改写 bash 命令 + 专用工具 `calendar_write`/`cycle_write`）→ 4a-2 DeepSeek 回归测试 → 界面讨论 → 4b。发版时照 `docs/platform/RENAME-DAY.md` 改库名、数据根改名、停插件后真同步卡片。

### 设计与决定（11-09 用户定，详见文档）
- 顺序：3 收课事务 → 4a 沙盒 → 界面讨论 → 4b 多进程；RAG 推迟（领域记忆会话用，资料超 100 万上下文再做；范围会话+知识页+raw）。
- 阶段 3（`STAGE3-DESIGN.md`）：暂存目录 `~/学根/工作区/.close/`；课程会话的课程页和概念页只经 `course_close`；校验过直接提交；Anki 不进事务。
- 阶段 4a（`STAGE4A-DESIGN.md`）：受保护脚本做成专用工具；bash 网络只放 AnkiConnect；`@anthropic-ai/sandbox-runtime` 锁 0.0.81。
- 权限：读取除凭据外都放开；总控不写知识页；库根 AGENTS.md 禁写；MCP 放行+日志。阶段 2 定位为防误操作护栏+审计，真正边界是 4a 沙盒。
- 已提交（desktop 分支，未推送）：4ddb88a 阶段 1、58724db 阶段 2、9649662 文档、3444bb7 guard 库优先、44ee2f2 3a+3b、037283d 3c、b0f3563 顺延、c7ed8c0 撤销保留新建页、c32672d 3d、2150f12 4a-1。文档、归档**未提交**。

### 小尾巴
- 课程没有删除/停用的通道（总控验收时模型指出）：以后加 course_plan 的 `archive`（课程页标停用 + 从索引/看板撤下，走计划事务）。
**推送前必清**：`apps/desktop/src/agent/guard/path.test.ts` 第 60–63 行有 `/Users/gjy/...` 真实路径（阶段 2 提交里），公开仓库，推送前换成中性路径。
`main/data/{sources,handler}.ts` 新旧布局测试未补；`tsconfig` 的 `exactOptionalPropertyTypes` 与 AGENTS.md 不符；断线重试提示没真机测到；英文术语卡方向待用户定。

## 当前位置（11-09 15:15）
- **已发布并安装 v0.7.0**（书房、输入框 IME/Esc、盯板表格、R3/R4）；0.6.1 备份 `/tmp/学根-v0.6.1-backup.app`。
- **数据根已迁**：`~/学根/{库,会话,工作区}`；库由 jj（0.47.1，与 git 共存）管理，私有远端 `GongJiYang/xuegen-vault`；旧位置 `~/Documents/Obsdian-gjy/GJY`、`~/Documents/学习路径`、`~/.xuegen/sessions`、`~/learning` 都是链接；`~/.xuegen/wiki.json` 指 `~/学根/库`；换电脑清单 `docs/platform/NEW-MACHINE.md`；全量备份 `backups/full-1109/`、迁移脚本 `backups/migrate-1109.py`。
- **未提交（xuegen 工作区）**：书房排队日期修复、断线重试提示 + 技能路径 `~/.xuegen/app`（DeepSeek 已修）、阶段 1 卡片直连 + 数据根脚本（Devin 写，审核中）、阶段 2 guard（Devin 写，审核中）、各任务单与 `docs/platform/*`。xuegen 仓库仍是 **PUBLIC**，用户暂不改私有；别再往仓库提交个人内容。
- **讨论成果（都在 `docs/platform/`）**：`SKELETON.md` 功能骨架、`DIRECTIONS-1109.md`（已并入路线）、`ARCH-DISCUSSION-1109.md`（数据收敛、jj、Obsidian 依赖、A1 会话进程、A2 收课事务、11 篇论文核对、落地细节：sandbox-runtime、路径规范化、clonefile/fsync、jj 工作区）、`ROUTE-1109.md` 路线、`VAULT-NAMING.md` 命名规则。
- **待用户定**：英文术语卡方向（英→中 / 双向）；阶段 2 误拦排查里拿不准的项（等 DeepSeek 报告）；UI 重新讨论。
- 已知小问题：Obsidian_to_Anki 插件扫描旧目录 `wiki/flashcards`，11-08 后的卡可能未进 Anki——卡片直连上线后告诉用户停用插件并全量同步一次（先 `--dry-run`）。
- 11-09 事故记录：收课时 OpenDesign 中转断线（terminated），Pi 自动重试后完成；Claude 重新上锁曾挡一次写入。规则：替换应用前请用户自己退出（记忆 xuegen-app-replace，`RELEASE.md`）。

## 已完成（最近的在前）
| 批次 | 结果 |
|---|---|
| 11-09 下午 | 发 v0.7.0；迁库到 `~/学根/`（jj + 私有远端）；路线与架构讨论；命名规则；阶段 1 代码、阶段 2 代码（审核中） |
| v0.6.1 | V3c（技能/卡片面板、禁用实底按钮）、V3d（面板不盖今日卡、日历今天格、阅读日期、回到最新、/ 菜单提示等 9 处）、R1/R2；逐项核对表 `docs/desktop/BEAR-AUDIT-1108.md` |
| v0.6.0 | 总控首页、ui-fix2（进度/撤销/只摊开今天）、Bear 视觉 V1–V4（尺度、对比度、状态、主次、深色）、技能提速 |
| 库 11-09 | 删 C 语言/数据结构课程页「约 N 分钟」（用户同意，备份 /tmp/vault-backup-1109-minutes/） |

## 排队
见 `docs/platform/ROUTE-1109.md`（唯一总清单）。搁置：原书显示 batch-books-1、Trilium 同步、应用图标。

## 关键决策
- **分工（用户 11-08）**：Devin（swe-2-high）写基础代码；DeepSeek（OpenDesign `deepseek-v4.1-flash-eco`，`pi` + `PI_CODING_AGENT_DIR=/Users/gjy/pi-learning/.deepseek-agent`）写测试、审核、**一切返修**；Claude 写任务单/设计稿、最后在测试窗口模拟用户逐项验收（设计稿 ↔ 实际逐元素表，见 xuegen-arch-gate 第 6 步）。
- **界面只做 Bear**（Chicago/bare 只保证能编译）；视觉规则 `docs/desktop/BEAR-VISUAL-PLAN.md`（只用变量、文字 ≥ 4.5:1、焦点 accent-11）。每批先出设计稿给用户看。
- 书房规则（用户 11-08）：每天都读、每段 ≤ 10 页、计划内一次一本（先 Epp 后 CTM）、计划外一本、不跳核心页、显示预计读完日期但不估时长。IR 实测（11-09）：FSRS 不排阅读，书房管读、摘录做卡进 FSRS。
- 架构（用户 11-09 定）：数据根 + 库独立私有仓库；jj；卡片直连 AnkiConnect；库全英文命名；会话角色权限清单写死（不让模型生成）；收课事务化（Atomix 式三类效果）；系统沙盒用 `@anthropic-ai/sandbox-runtime`；RAG 只检索 Markdown 原文（node:sqlite FTS5 trigram，后加向量）。
- 发版须用户说「发版」；流程 `docs/desktop/RELEASE.md`；**替换已安装的学根前请用户自己退出**（只看会话文件时间不可靠）。

## 待用户处理
- Obsidian 已按 `~/学根/库` 重新打开（11-09 已告知；若程序坞或 Obsidian 仓库列表还有旧入口，删掉）。
- 英文术语卡方向；UI 重新讨论。

## 不要碰
- 真实 `~/.xuegen`、Obsidian 库（11-09 起在 `~/学根/库`，jj+git，私有远端 `GongJiYang/xuegen-vault`；旧路径是链接）、会话 `~/学根/会话`、主 Anki 收藏集：改动须用户同意并先备份。测试用 `XUEGEN_HOME=/tmp/xg-e2e/home`（端口 9460；测前 `/tmp/xg-e2e/prepare.sh`，测后 `check.sh`；截图脚本 `/tmp/xg-e2e/bear-shots*.mjs`、`audit.mjs`）。
