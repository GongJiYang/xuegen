# PROGRESS（更新于 2026-11-08，分支 desktop；v0.4.1 已发布并推送，desktop 与 main 同步）

## ▶ 下一步（新会话直接从这里开始）
**用户决定：不再加新功能，只修问题。** 当前任务是陪用户真实上课、核对之前没在实课里验证过的规则，发现问题再修：
1. **周六（低强度日）总控简报**：应列出原书通读当天那一段（Epp、CTM 各一段，见课程页 `## 原书通读`）。离散 D1 已被用户挪到 11-07（周六），与 Epp Ch1 通读重叠，可视为一次。
2. **11-09 离散 D2**（第一次「讲后读」）：开课时学根应先补定 D1（§1.1–1.4）核心页、再定 D2 核心页，收课在 `Today` 写「讲后读 … · 2026-11-10 读」；左边钉板应出现今日要点与题目（真实课里还没见过）。
3. **11-13 周五整合**：第一次周核实；**辅助课**（C 语言周一三、数据结构周二四）第一次上。
4. 已知未修（低优先）：Chicago「继续学习」把按钮文字当提示词发出；讲解风格冲突（desktop.json courseStyles vs 课程页「讲解风格」，已诊断未修）；`progress-panel.tsx` 527 行待拆。
5. **搁置**（新功能，用户要求先不做）：原书显示 `docs/desktop/batch-books-1.md`（设计稿 `design/animate/?d=books` 已确认）；Bear 技能面板设计稿；Trilium 同步；应用图标。

**待用户自己处理**：离散 D1 在 11-06 旧会话里的作答没收课记录（开课时告诉学根讲过一遍）；离散课程页「讲解风格：深度」与实际所选不符；从学根「检查更新」装 v0.4.1（v0.4.0 仍走 API，可能 403，等一小时或让 Claude 直接装）；`~/.xuegen/models.json` 里 moxuna（令牌已过期）要不要删。默认模型已改回 OpenDesign `deepseek-v4.1-flash-eco`（备份 `/tmp/settings.json.bak-1106b`）。

**重要**：安装版的技能来自打包快照（`Resources/xuegen/skills`），改仓库 SKILL.md 必须发版才进用户的学根；每次发版要用户明确说「发版」。发版流程见 `docs/desktop/RELEASE.md`（现在要上传 `notes.md` 附件）。
**测试注意**：测试窗口（`XUEGEN_HOME=/tmp/xg-e2e/home`，端口 9460）里的学根会去读真实库（实测读过、没写过）；验收后用 `find <真实库> ~/.xuegen -newer <标记>` 确认。Electron 的 `net.fetch` 跟跳转后 `response.url` 为空，要读跳转用 `net.request` + `redirect` 事件。

## 当前位置
学习周期 C1（2026-11-06 ~ 12-24，周五至周四为一周）。主项：离散（Epp，周一三，D1 已挪到 11-07）、CTM（周二四，D1 = 11-10）；辅助：C 语言（周一三）、数据结构（周二四）。主项读原书 =「讲后读（错开）」核心页（开课时定，读在另一门主项下一个上课日）+ 课程页 `## 原书通读`（全书分段，每周六一段，不受周期限制）。**不估任何时长或读完日期**，只排当天学/读什么。

## 已完成（最近的在前）
| 批次 | 结果 |
|---|---|
| v0.4.1 | 检查更新改读 `releases/latest` 跳转（不走限流 API），更新说明为 release 附件 `notes.md`；同一错误只显示一条；关提示关对（`routeDismiss`）；开课/改计划给课程文件绝对路径与库根（`course-state.mjs list` 加 `file`） |
| v0.4.0 | 旧会话漏洞：前一天的课程会话出提示条「开今天的课 →」（`NoticeItem.action`，三皮肤）；课程页在会话外改过或学根重启后，下一条自动加「先重读」（`changedAt` + 答完时直接取列表记录）；改计划/周核实不进旧会话；面板在切回窗口、过零点时刷新。技能去掉所有时间预估；`course` 加「以文件为准」「一门课一天一个会话」；简报列过期讲后读 |
| v0.3.0 | `/总结`；表格单元格走 Markdown；技能：主项讲后读核心页 + 原书通读。库：离散、CTM 课程页按此改（备份 `/tmp/vault-backup-1106-reading/`） |
| v0.2.1 | PL-14 周期视图「排课」按周期排；技能断口统一修（辅助课、周核实、剪藏、起草卡片、概念页）；C 语言、数据结构按 C1 辅助重排 |
| PL-11 | 总进度第四版（`skins/bear/plan-progress.tsx` 独立组件，设计稿 `?d=progress4`），已学完的课收进科目底部；测试窗口截图核对通过。`progress-panel.tsx` 527 行待拆 |
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
- 2026-11-06 用户定：主项必须读原书（讲后读错开 + 原书通读）；不估任何时长或读完日期；之后不加新功能、只修问题。
- 状态色只表示状态并配记号：● 蓝 #1aa3ff / ! 琥珀 #c98a12（字 #a86b00）/ ✓ 绿 #3a8a5c / ○ 灰 #8b9096 / ◌ 浅灰 #b8bcc2；Bear 变量 `--warn --warn-text --faint --hairline --done`。
- 文案要简洁直观（用户要求）。验收用 `XUEGEN_HOME=/tmp/xg-e2e/home`（库副本 `/tmp/xg-e2e/vault/GJY`，副本里 C1 与课程排期被测试会话改过，用前可从真实库重拷），CDP 脚本在 `/tmp/xg-e2e/*.mjs`。改主进程/设置要重启窗口，只改渲染层可 reload。

## 待用户处理
- （已提交 2026-11-06）
- `~/.xuegen/models.json` 里未启用的中转渠道（provider `moxuna`）要不要删。
- SICP 文件与版本（找到后登记并排课）。

## 不要碰
- 真实 `~/.xuegen` 与 Obsidian 库（用户在用）；改库内容须用户同意，课程页走 unlock → 改 → lock → dashboard → render-board。
- 用户正式窗口（端口 9470）别点；更新前确认没在回答。
