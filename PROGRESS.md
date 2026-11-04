# PROGRESS（更新于 2026-11-03 晚，最新提交 bfb1aad，分支 desktop，所有改动均未提交）

## ▶ 下一步（新会话直接从这里开始）
HANDOFF-2026-11-04 的 T1–T4 已完成（2026-11-04 晚）：代码改由 opencode 写（`opencode run --pure -m deepseek/deepseek-flash --auto --dir <xuegen>`，不加 `cd`；日志 `/Users/gjy/pi-learning/opencode-*.log`；任务说明 `docs/desktop/batch-t1-t2.md`、`batch-t3-zoom.md`、`batch-t1-layout.md`）。T4 在真实 Electron（临时 XUEGEN_HOME + 库副本）走查全部通过：分课会话、切回恢复、重启恢复、新课程建课并归属、改计划、自动刷新面板、`/skill:` 显示、⌘=/⌘0 只改正文且菜单无缩放项。检查全绿：desktop 272 测试、根 104 测试。剩下：T5 回答用户的画图问题（不写代码）；用户决定是否提交。已知小事：开发模式热更新后助手回答暂时不显示（重启恢复，不影响正式使用）。

## 当前位置
UI-0 已完成并经 Claude 复验（typecheck/lint/73 测试/build/smoke 通过，grep 无残留）。Chicago 设计稿（`/Users/gjy/pi-learning/design/chicago/index.html`，仓库外）用户已确认，含 5 套两色护眼配色、防闪屏、终端字符图专用字体 `Fusion12Diagram`（生成脚本 `design/chicago/tools/make-diagram-font.py`）。

## 已完成（最近的在前，均经 Claude 按真实场景复验）
| 批次 | 结果 |
|---|---|
| S-D 画图 skill `diagram` | 两轮完成，Claude 复验：9 个真实样例结果正确（多图相邻不误报、缺边/中文按 1 列/列错位均报出），lint 0 错误，66 测试通过 |
| UI-0 皮肤架构 | cmd 完成，Claude 复验通过：core/chat、content、motion、settings，skins/contract+registry+bare，画廊 `?gallery&skin=`，`⌘⇧K` 切换 |
| 画图 skill 调研 | 6 个仓库均 MIT；只吸收 show-dont-tell/box-diagram/codex-preview/tldr 的规则，不装 pretty-mermaid、glyphcss（中文对齐问题、依赖） |
| Chicago 视觉设计稿 | 用户确认「就这一版」；字体 ChicagoFLF + Fusion Pixel 12px（比例/等宽），弃用 Monaco；像素圆角按钮；1 倍截图非黑白像素为 0 |
| 皮肤架构与 Chicago 设计 | `docs/desktop/UI-ARCHITECTURE.md`、`skins/README.md`、`skins/chicago.md`、`batch-ui-0/1.md`；AGENTS.md §12/§13 改为皮肤与微交互规则 |
| S1 skill 规范 | `docs/skills/AUTHORING.md`、`scripts/lint-skills.mjs`、`npm run lint:skills`；6 个 skill 0 错误 |
| reading skill | `skills/reading/SKILL.md` + `reading-queue.mjs`（修 3 轮：引号、库布局、resume）；26 测试通过 |
| 动效批 / 修复 B / 修复 A / 第 1 批 | 桌面版能对话；这些旧 UI 与动效将在 UI-0 中移除 |

## 排队（按顺序）
1. F1 → F2 → F3 功能循环（见 ▶ 下一步）
2. 桌面 2A 卡片总览 → 2B Anki 状态（只读 AnkiConnect）→ 2C 课程+阅读看板 → 2D 制卡审核
3. S2 路由评测 → S3.5 公开仓库 xuegen-skills（MIT）
4. RAG（R0–R4）已暂缓

## 关键决策
- 代码由 cmd 写：`cmd -p "…" -m deepseek/deepseek-v4-flash --yolo --trust --skip-onboarding --no-auto-update --max-turns N`，命令必须以 `cmd -p` 开头（权限规则在 `/Users/gjy/pi-learning/.claude/settings.local.json`），不要加 `cd`。Claude 写任务说明、审查、验收。
- 新皮肤先做可点的静态设计稿给用户确认，再写任务派 cmd（Chicago 曾跳过这一步被用户指出）。
- UI：极简专注阅读；每套 UI 是命名皮肤（登记表 `docs/desktop/skins/README.md`）；动效只做微交互，组件只发意图，皮肤决定怎么动。
- Anki 同步由 Obsidian 的 obsidian-to-anki 负责，桌面版只读（显示「N 张待同步」）。
- RAG 用 API 嵌入、不纳入会话记录、暂缓；评测集与模型无关。skill 仓库公开，MIT。
- Obsidian 库 `/Users/gjy/Documents/Obsdian-gjy/GJY`：已加 `wiki/reading/`、`wiki/extracts/` 规则与摘录制卡补充（原文件备份在 `/Users/gjy/pi-learning/backups/vault-2026-11-03/`）。

## 待用户处理
- 是否提交 `desktop` 分支上的全部改动（尚未提交任何内容）。
- Chicago 正文默认 12px 还是 24px：实现后试读决定。

## 不要碰
- `~/.xuegen/`（用户凭据与会话）、Obsidian 库中除已授权规则外的内容。
- 设计产物不入库：截图/录屏只用于自检（工具 `/Users/gjy/pi-learning/tools/record-page.mjs`）。
