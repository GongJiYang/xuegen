# PROGRESS（更新于 2026-11-09，Release v0.7.0：书房 + 输入框按键 + R3/R4）

## ▶ 下一步（新会话直接从这里开始）
1. **v0.7.0 已发布**（书房 shelf-2、盯板表格、输入框 IME/Esc、R3/R4，R3/R4 已在测试窗口实测通过）。用户在应用里「检查更新」即可装。
2. **迁库进行中**（用户 11-09 同意「切库」）：真实库 `reading/epp.md`、`ctm.md` → `wiki/书房/epp.md`、`ctm.md`（读书记录原样带过来），课程页原书链接改 `[[书房/…]]`，阅读队列移出这两本。先整库备份。
3. 小返修待派 DeepSeek：`bookshelf.mjs index` 排队书的「预计读完」应串接在前一本之后（现在从今天算）。
4. 第一次做卡时提醒用户在主 Anki 把「书房::Epp」设预设「书房」。
5. 用户想法（未定）：领域总控当长期记忆（带引用检索 + 标签页）、英文术语卡（问英→中还是双向）。

## 当前位置
- **已发布 v0.6.1**（11-09，已替换 /Applications/学根.app；旧版备份 /tmp/学根-v0.6.0-backup.app）。**用户正在用的是 /private/tmp/xg-pack/old/学根.app（0.6.0，旧测试残留，可能程序坞指向它）**：让用户退出、从「应用程序」重开 0.6.1，之后删 /private/tmp/xg-pack。
- **未提交，待验收**：
  - DeepSeek 修的 R3/R4（任务单 `docs/desktop/batch-fix-r3.md`，日志 `deepseek-fix-r3.log`，自动测试已过）：R3 切回窗口/回答结束时总控闪出更早对话（`use-resource.ts` 有旧值时后台刷新）；R4 开课失败后重进不再开课（`has-answer.ts` + `use-course-sessions.ts`：会话里学根没回答过就重发开课）。**Claude 还没在测试窗口验**。
  - 书房 shelf-1：Devin 写了 `skills/reading/bookshelf.mjs` + 主进程 `shelf.today/list/done`；DeepSeek 补测试与审核中。
  - 技能文字（Claude 改，随下次发版）：reading「书房」一节、course/cycle-plan 原书通读改书房、PRINCIPLES 不估时长只管课程与阅读队列。
- **书房方向待定**：用户要求书与课程分开、课程相关书加「核心页已读」层、书排期依赖 Anki FSRS 渐进阅读。Claude 核实后建议 FSRS 只管从书里做的卡、阅读排期留书房（`docs/reading/SHELF-IR-ANALYSIS.md`）。**用户选了「先在测试配置里实测 IR 插件」**。已备好：独立数据目录 `/Users/gjy/pi-learning/anki-ir-test/`（`base/addons21` 装了 IR 4.13.0 与 AnkiConnect，`start.sh`，`test-article.md`）；Anki 同一用户只能开一个，**要用户先退出主 Anki**，Claude 再用 `ANKI_BASE=…/base` 启动（launcher：`/Applications/Anki.app/Contents/MacOS/launcher`）。测试步骤见上会话给用户的清单（建配置文件「IR测试」→ 开 FSRS → IR 选 Priorities → 加笔记 → 摘录 + 挖空 → Soon/Later → 重启看状态 → Claude 用 AnkiConnect 查 revlog/预设）。
- 主 Anki 已做：完整备份 `/Users/gjy/pi-learning/backups/anki-1109/`（整目录 + SQLite 快照，integrity ok）；新建预设「书房」（id 1794183660062）与空牌组「书房」。子牌组「书房::X」不会自动继承，建卡时要 setDeckConfigId。
- shelf-2（界面）**必须先做**：讲后读「读完了」现在往 `reading/<书>` 记 note，迁移后会失败——改写进书房书页读书记录（bookshelf 加 `note`），才能迁库（迁 `reading/epp.md`、`ctm.md` 须用户同意）。

## 已完成（最近的在前）
| 批次 | 结果 |
|---|---|
| v0.6.1 | V3c（技能/卡片面板、禁用实底按钮）、V3d（面板不盖今日卡、日历今天格、阅读日期、回到最新、/ 菜单提示等 9 处）、R1/R2；逐项核对表 `docs/desktop/BEAR-AUDIT-1108.md` |
| v0.6.0 | 总控首页、ui-fix2（进度/撤销/只摊开今天）、Bear 视觉 V1–V4（尺度、对比度、状态、主次、深色）、技能提速 |
| 库 11-09 | 删 C 语言/数据结构课程页「约 N 分钟」（用户同意，备份 /tmp/vault-backup-1109-minutes/） |

## 排队
1. 审 DeepSeek 书房测试 → 实测 R3/R4 → 问用户发 v0.6.2。
2. Anki IR 实测（等用户退出主 Anki）→ 定书房方案 → shelf-2 设计稿/任务单（含 note 改写、课程相关书「核心页已读」层）→ 迁库（问用户）。
3. 搁置：原书显示 batch-books-1、Trilium 同步、应用图标。

## 关键决策
- **分工（用户 11-08）**：Devin（swe-2-high）写基础代码；DeepSeek（OpenDesign `deepseek-v4.1-flash-eco`，`pi` + `PI_CODING_AGENT_DIR=/Users/gjy/pi-learning/.deepseek-agent`）写测试、审核、**一切返修**；Claude 写任务单/设计稿、最后在测试窗口模拟用户逐项验收（设计稿 ↔ 实际逐元素表，见 xuegen-arch-gate 第 6 步）。
- **界面只做 Bear**（Chicago/bare 只保证能编译）；视觉规则 `docs/desktop/BEAR-VISUAL-PLAN.md`（只用变量、文字 ≥ 4.5:1、焦点 accent-11）。每批先出设计稿给用户看。
- 书房规则（用户 11-08）：每天都读、每段 ≤ 10 页、计划内一次一本（先 Epp 后 CTM）、计划外一本、不跳核心页、显示预计读完日期但不估时长。11-09 起方向待 IR 实测后再定。
- 发版须用户说「发版」；流程 `docs/desktop/RELEASE.md`；安装前确认学根没在回答（看 ~/.xuegen/sessions 近几分钟有无写入）。

## 待用户处理
- 退出旧 0.6.0（/private/tmp 副本），从「应用程序」打开 0.6.1，换掉程序坞图标。
- 退出主 Anki，开始 IR 实测。
- 是否发 v0.6.2（R3/R4 + 书房脚本，待 Claude 验收后）。

## 不要碰
- 真实 `~/.xuegen`、Obsidian 库（`/Users/gjy/Documents/Obsdian-gjy/GJY`）、主 Anki 收藏集：改动须用户同意并先备份。测试用 `XUEGEN_HOME=/tmp/xg-e2e/home`（端口 9460；测前 `/tmp/xg-e2e/prepare.sh`，测后 `check.sh`；截图脚本 `/tmp/xg-e2e/bear-shots*.mjs`、`audit.mjs`）。
