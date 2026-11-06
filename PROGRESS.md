# PROGRESS（更新于 2026-11-06，分支 desktop；BE-6～PL-7 已全部提交）

## ▶ 下一步（新会话直接从这里开始）
核对 BE-6 卡片面板：测试副本 Electron（端口 9460）打开抽屉「卡片」截图，对照 `/Users/gjy/pi-learning/design/animate/?d=cards`，通过后把 `docs/desktop/batch-bear-6.md` 移到 `docs/archive/desktop/`；然后做 Bear「技能」面板设计稿（Claude 做，`design/animate/` 新建 `?d=skills`）给用户确认。

## 当前位置
学习周期 C1 已开跑（2026-11-06 ~ 12-24，周五至周四为一周；离散 D1 = 11-06，CTM D1 = 11-10）。桌面版周期视图、日历类型、总进度按科目分组、总控会话、对话里的活动头像都已完成并在测试副本验收。总进度/日历按设计稿 `?d=plan` 重做完成（PL-1/2），路线终止日期读库里新页 `wiki/cycles/route.md`。用户正式窗口（端口 9470）07:25 用旧代码启动，需重启才能用上 PL（改了主进程）。测试窗口（9460）可能还开着，下次用前先确认或关掉。

## 已完成（最近的在前）
| 批次 | 结果 |
|---|---|
| PL-10 | 对话左侧钉板（今日要点 + 当前题目，窄时缩成按钮；Claude 补了公式渲染）；teach/course SKILL：开课先写概念页（一术语一页）+ 今日要点框，题目必须用 [!question]。真实窗口用伪造会话验收过宽屏状态 |
| PL-8/9 | 每天「一个主项 + 一个辅助」：周模板第 4 列「辅助」（只能在深度日、≤45 分钟、不考核），课程 role main/aux；Bear 日历第二行、今天辅助行、总进度辅助区。库已改：c1.md 四列模板（周一三 C 与系统编程，周二四 数据结构与算法）、新建 `subjects/data-structures-algorithms.md`、subjects/index/log/AGENTS.md 同步；cycle-plan SKILL 同步。待用户：在总控登记 Effective C 并排课（周一三） |
| PL-5/6 + course 技能 | 「正在思考」整次回答只画一行、去掉呼吸动画（未在真实回答里目测）；每门课每天第一次开课用新会话（离散课对不上号的原因：开课发进了 11-05 旧会话）。course SKILL 加「原书：带读/先读后讲/边读边讲」（阅读算在 90 分钟内）与「骨架：教材目录/自拟」。PL-7 已做：新课程表单去掉「每天时长」（学根按难度估每节时长，course SKILL 已写）、加「原书」三档。讲解风格问题已诊断未修（两处来源：desktop.json courseStyles vs 课程页「讲解风格」；Next Session 混入风格词；teach SKILL 无冲突规则、「延续」说法与每条带标签不符；「深度」与学习深度轴混淆） |
| PL-3/4 | 用户第二轮反馈：总进度只留「预计结束」+ 12 周期×7 周格；课按科目分组，未排课资料有「排课」；周模板深度日改为链接科目（`[[subjects/…\|短名]]`），本周期的课 = 科目页链接、周期内有新课的课程，同科目可多门课分深度日（check 查撞车）。库已迁移：c1.md 模板、两个科目页课程链接加短名、库 AGENTS.md 与 SKILL.md 同步；`subjects.mjs` 也只读 `c<N>.md` |
| PL-1/2 + 路线页 | 用户批准设计稿 `design/animate/?d=plan`。库新建 `wiki/cycles/route.md`（C1–C12 + 5 个恢复周，计划内结束 2028-07-20，缓冲 12 周；库 AGENTS.md 补 Route Page 规则）。`cycle.mjs` 只读 `c<N>.md`、新增 `overview`、`month` 带课次/短名/周期边界/恢复日、`check` 比对路线页；`core/board/plan-view.ts`；Bear 总进度顶部路线卡 + 本周期 + 课程卡，日历格子写课名、C1 起/完、选中日课次。偏离：日历详情没有「开始 →」；课程卡展开仍是原来的本周任务。已知小问题：已完成课程（Prolog/Scala/Erlang）仍排在主项里、下方有一条粗黑线（旧样式）；`progress-panel.tsx` 471 行，待拆 |
| BE-11a/b/c | 总控会话（`/总控`、今天视图「总控 →」，每周期一个，每天首次打开自动要简报，标题「总控 · C1」+ 22px 墨色头像）；对话进行中那一行 24px 头像 + 正在思考/查资料/动手/写（`core/chat/activity.ts`，只读 bash 命令算查资料）。grokbot-web 打包在 `skins/bear/vendor/`（BSD-3，提交 616c1dd，见 SOURCE.txt），eslint 只忽略该 .js |
| BE-10a/b | `skills/cycle-plan/subjects.mjs` + `subjects.list`；总进度按 主项/辅助/路线外/已学专题 分组，记号 ✓ ! ○ ●（超 14 天没学为 !） |
| BE-9a～d | `cycle.mjs`（day/week/month/check）、`cycle.day`/`cycle.month`；Bear 今天周期视图、日历「深整低休」；正文 42em、滚动条隐藏 |
| cycle-1～3 | 排期 `--days`/`--extra`/`--reviews anki`；`cycle-plan` skill（SKILL.md 由 Claude 写）；真实库两门课已按周模板重排 |
| Wiki（Claude 直接改，用户批准） | 库 `AGENTS.md` 补科目/周期/课程/日历规则与状态记号；`subjects.md` + 7 科目页、`cycles/c1.md`、9 个登记来源页；修 126 处歧义链接、8 处断链。备份 `/tmp/vault-backup-2026-11-05` |

测试：桌面 428、脚本 140 全绿；`lint:skills` 0 错误。

## 排队（按顺序）
1. BE-6 卡片面板截图核对（见下一步）。
2. Bear「技能」面板：设计稿 → 用户确认 → 逐步清单派 Devin。
3. Trilium 每日笔记双向同步（Trilium 已装、37840 端口，ETAPI `/etapi/calendar/days/{date}`；与 `wiki/calendar/YYYY-MM-DD.md` 互相同步，两边都改标冲突；令牌存 `~/.xuegen/trilium-token`）。动手前问用户：以哪边为主、是否导入历史日记、日记里写什么。
4. 可选：diagram 检查加强；其余皮肤 Things/Linear/Arc；外部提醒 → 周报 → 降低检查题作答成本。

## 关键决策
- 仓库内代码全交 Devin（`swe-2-high`，见 `xuegen-arch-gate` skill，任务单是逐步清单、给完整代码与锚点）；设计稿（`design/animate/`，端口 5181）、SKILL.md 文字、用户同意的 Wiki 内容由 Claude 直接做。审查时 <10 行的小修 Claude 可改并说明。
- 学习周期：路线 `~/Documents/学习路径/计算机知识体系.md` v19；周模板 一三离散、二四范式、五整合、六低强度、日休息；每节 90 分钟；复习全交 Anki，收课时先提议卡片、确认后才写。周期页格式以 `skills/cycle-plan/SKILL.md` 为准（frontmatter + 7 行周模板，链接别名即课程短名）。
- 状态色只表示状态并配记号：● 蓝 #1aa3ff / ! 琥珀 #c98a12（字 #a86b00）/ ✓ 绿 #3a8a5c / ○ 灰 #8b9096 / ◌ 浅灰 #b8bcc2；Bear 变量 `--warn --warn-text --faint --hairline --done`。
- 文案要简洁直观（用户要求）。验收用 `XUEGEN_HOME=/tmp/xg-e2e/home`（库副本 `/tmp/xg-e2e/vault/GJY`，副本里 C1 与课程排期被测试会话改过，用前可从真实库重拷），CDP 脚本在 `/tmp/xg-e2e/*.mjs`。改主进程/设置要重启窗口，只改渲染层可 reload。

## 待用户处理
- （已提交 2026-11-06）
- `~/.xuegen/models.json` 里未启用的中转渠道（provider `moxuna`）要不要删。
- SICP 文件与版本（找到后登记并排课）。

## 不要碰
- 真实 `~/.xuegen` 与 Obsidian 库（用户在用）；改库内容须用户同意，课程页走 unlock → 改 → lock → dashboard → render-board。
- 用户正式窗口（端口 9470）别点；更新前确认没在回答。
