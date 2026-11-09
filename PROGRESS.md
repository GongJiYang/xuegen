# PROGRESS（更新于 2026-11-09 15:15；最新发布 v0.7.0；工作区有未提交改动：阶段 1、2 代码与返修）

## ▶ 下一步（新会话直接从这里开始）

**总清单 = `docs/platform/ROUTE-1109.md`（桌面 `学根改进路线-1109.md` 同步）。每次报告末尾附阶段完成表（记忆 xuegen-route-progress）。用户 11-09：界面相关一律暂停，等重新讨论 UI（记忆 xuegen-ui-hold）。**

1. **阶段 1 审核已交回（Claude 抽查通过）；Devin 的改名批已交回（15:53，真实库未动）→ DeepSeek 正在审（任务单 `docs/platform/batch-stage1-rename-review.md`，日志 `/Users/gjy/pi-learning/deepseek-stage1-rename-review.log`）；阶段 2 审核仍在跑。（16:18–17:04 OpenDesign 中转三次 503 billing scope，17:22 探测恢复后两审核都已续派）待办：`agent/guard/roles.ts` 写死了旧路径（`wiki/知识`、`Clippings`、`wiki/courses.md`），改名后会误拦——等阶段 2 审核交回后派 DeepSeek 返修为新旧都放行，必须在真实库改名之前完成**。审核日志：
   - `/Users/gjy/pi-learning/deepseek-stage1-review.log`（任务单 `docs/platform/batch-stage1-review.md`：卡片直连 `skills/wiki-save/anki-sync.mjs`、`bin/xuegen-data-root.mjs`、`cards.sync` 超时 120 秒，补测试）。
   - `/Users/gjy/pi-learning/deepseek-stage2-review.log`（任务单 `docs/platform/batch-stage2-review.md`：会话角色 + 路径规范化 + 写死权限清单 + 工具层拦截，`apps/desktop/src/agent/guard/**`；**重点是 B 节「误拦排查」对照表**——待定项要拿来问用户）。
   - 日志为空且没有 `pi -p` 进程 = 被打断，用 CLAUDE.md 的 DeepSeek 命令重跑对应任务单。
2. **中转（11-09 20:40）**：eco 模型今晚 5 次 503 + 2 次空报告；用户建议改用不带 eco 的 `deepseek-v4.1-flash`（已加进 `.deepseek-agent/models.json`，备份 `/tmp/deepseek-models.json.bak`），正在试用；稳定的话改 CLAUDE.md 的命令。备选 Haiku 5.5。**用户同意发 0.8.0 前本地提交（不推送，先查无个人内容）。** 现在跑：`deepseek-stage1-rename-fix.log`（返修 4 条 + 补完测试）、`deepseek-stage2-session-id-review.log`。
   **改名批状态（11-09 20:35）**：DeepSeek 补测试中（`batch-stage1-rename-tests.md`，日志 `deepseek-stage1-rename-tests.log`；原 `-review` 单三次中转断/空报告已作废）。Claude 副本核对（`/tmp/xg-rename-check/`，独立脚本 `tools/links.py`）查出 4 个必修问题，返修单已写好 `docs/platform/batch-stage1-rename-fix.md`——**补测试交回后立即派 DeepSeek**；修完 Claude 在新副本重跑，要求新增断链 0、jj 不多收大文件。其中第 1 条（经链接调用脚本静默不执行）影响书房和卡片同步，发版前必须修。原计划：派 Devin：`docs/platform/batch-stage1-rename.md`（代码新旧布局都认 + `vault-lint.mjs` + `rename-vault.mjs`），派发命令见 xuegen-arch-gate；之后 DeepSeek 审 + 补测试 → 发版 → **请用户自己退出学根和 Obsidian** → Claude 跑 `rename-vault.mjs`（先试运行，库在 jj 下可 `jj undo`）→ 核对 → `jj` 提交推送 → 数据根 `~/学根` 改名 `~/xuegen-data/{vault,sessions,workspace}`（旧位置留链接）→ 去掉库 `AGENTS.md` 里的「Migration status」说明。映射表 `docs/platform/vault-rename-map.json`（已审，160 文件 + 32 目录），规则 `docs/platform/VAULT-NAMING.md`（已写进库 `AGENTS.md`）。
3. **阶段 2 审核已交回（19:20），Claude 已逐文件审完（866 测试过）**。用户 19:30 定：读取放宽为「除凭据外都能读」（返修派 DeepSeek，任务单 `docs/platform/batch-stage2-read-fix.md`，日志 `deepseek-stage2-read-fix.log`）；总控不写知识页、库根 AGENTS.md 禁写、MCP 放行+日志 都保持。已知缺口：bash 不受角色清单约束（阶段 4 沙盒）、课程会话可写任何科目页。返修交回后Claude 真机验收（测试窗口；用 `/tmp/xg-e2e/prepare.sh`，REAL 已指向 `~/学根/库`）——会话角色传递、被拦时模型收到中文原因、`~/.xuegen/guard.log`；连同断线重试提示、技能路径 `~/.xuegen/app`、卡片直连（需真 Anki，先 `--dry-run`）一起验，再问用户发版（版本 0.8.0：新功能）。
4. **全局核对（11-09 19:50）补的事项**：① 阶段 2 第 1 项「协议加 sessionId」漏派——Devin 已写完（20:00，900 测试过）→ DeepSeek 审 + 补测试中（`docs/platform/batch-stage2-session-id-review.md`，日志 `deepseek-stage2-session-id-review.log`）；读取返修已完成（900 测试过）；② 卡片直连真同步前先请用户停用 Obsidian_to_Anki 插件（否则重复建卡），顺序：发版 → 改名 → 停插件 → `anki-sync --dry-run` → 真同步；③ 工作区堆了 5 批未提交改动（91 项）——建议用户同意后在发 0.8.0 前做一次本地提交（仓库公开，提交前查无个人内容）。
5. 然后阶段 2.5 RAG v1（方案已定，见路线）→ 阶段 3 收课事务（`course-close.mjs`）→ 阶段 4。

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
