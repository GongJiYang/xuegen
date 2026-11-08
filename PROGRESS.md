# PROGRESS（更新于 2026-11-08 晚，分支 desktop；**v0.6.0 已发布**：界面三批、总控首页、ui-fix2、Bear 视觉 V1–V4、技能提速）

## ▶ 下一步（新会话直接从这里开始）
**当前（2026-11-08 晚）界面收拢第一轮**——依据 NN/g 十原则、Microsoft HAX、GOV.UK（用户指定）。设计稿 `design/animate/?d=fix1`（已批准）。
1. **已完成未发版**（仓库工作区，未提交）：
   - `batch-ui-words-1`：`/` 菜单按任务分组（风格/上课/会话/打开/技能）、`/默认` `/收课`；技能中文名 + 一句话；按钮统一「开课 → / 回到这节课 →」；阅读说明、日历「Anki」去估时。Claude 顺手修了 Chicago「学习」菜单把按钮文字当提示词发出的老 bug。
   - `batch-ui-lesson-1`：界面代发的指令末尾带 `⟦xuegen:<动作>|slug|课名⟧`，对话里折叠成一行（`core/chat/action-marker.ts`）；课程会话输入区「总结 · 制卡 · 收课」；「默认 · 细讲」（`subjects.mjs` 读科目页 `## 讲解偏好`）。
   - `batch-ui-sessions-1`：会话列表（按天分组；Bear 标题 ▾、`⋯`「会话列表」、`/会话列表`；Chicago 窗口；bare 按钮）+ 日历「这天的会话」；主进程 `sessions.list`（`main/data/sessions.ts`）。
   - Claude 验收修补：未存盘的新会话也能列出同目录；旧开课会话按课程文件路径认课、标题「开今天的课」；「新建课程」不再误认；对话里隐藏「[课程页或技能可能已更新…]」。
   - 任务单已归档 `docs/archive/desktop/batch-ui-*.md`。机器检查：桌面 547 测试（高负载下 `use-skin`/`contract` 偶发超时，单跑通过）、根 162、lint 0。
2. 测试窗口：端口 9460，`XUEGEN_HOME=/tmp/xg-e2e/home`，库副本 `/tmp/xg-e2e/vault/GJY`（11-08 19:40 从真实库重拷，顶部加了护栏）。用户同意前三批不单独测，与总控首页合并一轮测（见第 3 条）。
3. **总控做主入口：已完成未发版**（2026-11-08 Devin 写，Claude 审查 + 真实窗口验收）。打开学根落在总控（启动恢复的旧会话不挡）；今日卡三皮肤都有；「让总控说说」按需发简报；「读完了」确定性打勾（测试副本实测：打勾、阅读页记一行、权限回 444、重复点被拒、真实库无改动）。Claude 修了三处：今日卡改用自己的本月数据（原来跟着日历翻页走）、总控切换失败时不发简报、启动落总控不再被恢复的会话挡住。任务单已归档。
   - 「学根自己开课」查清：启动时 Pi 恢复最近的会话文件（`continueRecent`），11-08 16:47 那条 CTM 开课消息几乎可以确定是 Claude 当天的验收脚本（`fresh.mjs` 点「开今天的课」）发的，不是应用行为。
   - 下一步：**请用户在测试窗口合并测一轮**（前三批 + 总控首页），测前已跑 `prepare.sh`（副本已重拷），测后跑 `check.sh`。之后用户说「发版」才发 v0.6.0。
4. **皮肤功能台账**：`docs/desktop/SKIN-LEDGER.md`（每项界面功能 × 各皮肤进度、全局要求 G1–G9、统一词表）；Claude 技能 `.claude/skills/xuegen-skin-ledger`，并已写进 `xuegen-arch-gate` 第 7 步——**每个界面批次收尾都更新台账**。台账已记的缺口：钉板、周期日历、科目分组总进度只有 Bear；Chicago 无总控入口；bare 无专注模式。
5. （11-08）CLAUDE.md 已改为 Devin；models.json 已删 moxuna（备份 `/tmp/models.json.bak-1108`）；用户已在 Obsidian 同步 Anki。

6. **书房（用户 11-08 要求，待出设计稿）**：原书通读从课程拿出来，新建 wiki 模块（暂名 `wiki/书房/`）记录自己读的书，计划内与计划外的书都由 Claude 排期。用户已定：不设每天时长，按章节与页数排每天读多少、估读完日期（「不估时长」只管上课）；同时读 计划内 1 本（Epp/CTM 轮流）+ 计划外 1 本；通读不跳过核心页读过的页；讲后读核心页完全不动（不加做题）。流程：总控批验收后 → 设计稿（库结构 + 界面）→ 用户确认 → 改库 + 派 Devin。

7. **速度测量（11-08，脚本 `/tmp/xg-e2e/timing.py <会话.jsonl>`）**：工具几乎不花时间，时间全在模型思考（thinking high，每步 5–60s）。课上答题 13–42s 正常；开课 11-07 用了 506s/45 步（找库 32s，v0.4.1 起已给绝对路径；翻原书 14 步约 3 分钟、一次导出 66 页，v0.5.0 已限 ≤10 页；讲课前先写 5 个概念页 + index/log 约 2.5 分钟；翻别的概念目录找格式约 1.5 分钟）；收课 11-07 用了 679s/62 步（脚本 23 次、写 14 次，含概念页与 Anki）。测试窗口空课收课 216s/23 步。已做（未发版）：`course` 收课第 0 步（没上过课直接说没有可收的）、一次解锁写完、记录样例 `references/record.md`、概念页挪到收课写（样例 `references/concept-page.md`，teach 同步）；Claude 直接改了 `lesson-actions.ts`：学根没回答过时不显示「总结 · 制卡 · 收课」。用户定思考档位不降。会话会记住自己的模型：测试窗口总控会话记的是 deepseek 官方（余额不足 402）；真实库 CTM 11-05、C 语言会话也记 deepseek，算法会话记已删的 moxuna。每天第一次开课开新会话，只有「回到这节课」进旧会话才会撞上。

8. **第二轮界面收拢（11-08 用户批准方向）**：自查结果 6 条——①等待时显示已用时间与步数 ②总控只摊开今天的对话 ③「读完了」10 秒撤销、收课后列改动并给「撤销这次收课」 ④按钮悬停说明后果 ⑤平实用语（已改 `instructions.md`）⑥「收课 ▾」小菜单（不写概念页 / 本次不记录）；小问题：日历图例补「读书」、技能面板勾选框样式。设计稿 `design/animate/?d=fix2` 用户已批准（含「撤销这次收课」按规则抵消）；**已完成未发版**（Devin 写，Claude 审查：修了「10 秒内连点两个读完了会丢掉第一个」；测试窗口验收：折叠、进度行、收课菜单与说明都对；真实库无改动；任务单已归档）。待 Bear 视觉批次处理：收课下拉菜单文字太淡；左上「要点 · 题目」按钮压住正文第一行。course SKILL 已加「这次改了」列表与撤销收课规则。之后做书房（第 6 条）。

9. **Bear 视觉收拢方案（11-08，待用户确认）**：`docs/desktop/BEAR-VISUAL-PLAN.md`（依据 Refactoring UI、Radix 字号与色阶、Apple HIG；测量：21 种字号、5 种字重、22 个散色、次要文字 3.1:1、faint 1.8:1、accent 文字 2.6:1、焦点样式仅 3 处、无深色）。分 V1 尺度变量 → V2 对比度与状态 → V3 主次 → V4 深色。用户定（11-08）：界面默认字号 13→14；**做深色**；**每批都先出设计稿给用户看**。设计稿 `design/animate/?d=bearv` 用户已批准，Claude 按五条规则复查后改了：灰 11 级 #63635f、accent-11 #0a65a0（在悬停底色上也 ≥4.5:1）、焦点环用 accent-11、今日卡标题降为说明、当前行升 fs-3、行高成对、最小内边距 4px，补了回答中/加载中与长中文开关。**V1 已完成未发版**（Devin 写，Claude 复核自查与机器检查；对比图 `/tmp/xg-e2e/shots/v1-compare/`；小尾巴：日历「C1 起」标签压住日期数字、图例在 340px 面板里折两行、`.bear-pin-chip` 圆角 12px——留给 V3）。**V2 已完成未发版**（Claude 把悬停兜底规则改成 `:where()` 零特异性，免得盖掉已有悬停；真实窗口强制焦点核对过；焦点环 2px accent-11、输入框聚焦、悬停兜底、禁用改 8 级灰不用透明度、今天/日历面板加载中、占位文字 11 级）。用户说「可以继续」，视为 bearv3 设计稿已批准；**V3a 已完成未发版**（对比图 `/tmp/xg-e2e/shots/v3a-compare/`）；**V3b 已完成未发版**（Claude 修了：课程会话输入框底行在窄栏里把「大白话」「总结」挤成竖排——加 nowrap + 整组换行，课程会话里隐藏 Enter 提示；会话列表类别栏加 title）；V4 深色任务单已写好 `docs/desktop/batch-bear-v4.md`（跟随系统外观、不加设置项；画布头像与窗口底色用 `useDark`），**V4 已完成未发版**（Claude 修了：折叠的「要点 · 题目」在滚动后仍压正文——加顶部底色条）。**Bear 视觉收拢 V1–V4 全部完成未发版**；三联对比图 `/tmp/xg-e2e/shots/final-compare/`（最初 / 浅色 / 深色，17 组）；截图脚本 `bear-shots.mjs`、`bear-shots-dark.mjs`、`bear-shots-light.mjs`。11-08 用户说「发版」，v0.6.0 已发布并替换已安装的学根（发版前未做用户合并测试——请用户在正式学根里用着反馈）；下一步：书房设计稿（第 6 条）；改前截图 `/tmp/xg-e2e/shots/v1-before/`（脚本 `/tmp/xg-e2e/bear-shots.mjs`，17 张）。Claude 修了：上次打开的是课程会话时启动不落总控（去掉 activeCourse 判断）。V3 其余几屏设计稿 `design/animate/?d=bearv3`（左边真实截图、右边改后；课程会话、收课菜单、阅读、卡片、技能、/ 菜单、会话列表）**待用户看**；已数值自查（深色实底按钮改用 var(--card) 字色）。用户授权 Claude 全程把控、逐批对照规则核实（记忆 xuegen-ui-rules-audit）。**用户定：界面批次只做 Bear**，Chicago/bare 只保证能编译（已写进 xuegen-arch-gate 与记忆）。

**2026-11-08 收拢（用户批准，v0.5.0）**：准则 `docs/platform/PRINCIPLES.md` + 库 `AGENTS.md`（四类划分、记忆分层、上下文预算、读原书）。库已改：教材复制到 `raw/books/`；`wiki/reading/epp.md`（11-14 起）、`ctm.md`（11-21 起，每 14 天）；离散/CTM 课程页收拢（R 行与原书通读移走、改计划记录移进 log）；四个科目页 `## 讲解偏好`（默认风格迁移自界面，**待用户确认**）；`wiki/profile.md`。备份 `/tmp/vault-backup-1108-reorg/`。
- 知识目录已移进 `wiki/知识/`（11-08，备份 `/tmp/vault-backup-1108-migrate/`；旧版 app 在 `/tmp/学根-v0.4.0-backup.app`）。待用户：Obsidian 里同步一次 Anki，确认卡片无重复。
- 待真实课验证：开课顺序、偏好隔离、60% 存档提示（只有单元测试，未在真实长会话里触发过）、日历「读书」。核实清单在用户桌面 `学根改动与核实-2026-11-08.md`。
- 已知小尾巴：C 语言/数据结构课程页还有「约 N 分钟」与「讲解风格」行；`strings.plan.ankiItem` 写着「Anki 20–30 分钟」；CTM 课程页「学习方法」一节与讲后读重复；Bear `use-skin`/`contract` 测试在高负载下超时（单跑通过）。

**用户决定：不再加新功能，只修问题。** 当前任务是陪用户真实上课、核对之前没在实课里验证过的规则，发现问题再修：
1. **周六（低强度日）总控简报**：应列出原书通读当天那一段（Epp、CTM 各一段，见课程页 `## 原书通读`）。离散 D1 已被用户挪到 11-07（周六），与 Epp Ch1 通读重叠，可视为一次。
2. **11-09 离散 D2**（第一次「讲后读」）：开课时学根应先补定 D1（§1.1–1.4）核心页、再定 D2 核心页，收课在 `Today` 写「讲后读 … · 2026-11-10 读」；左边钉板应出现今日要点与题目（真实课里还没见过）。
3. **11-13 周五整合**：第一次周核实；**辅助课**（C 语言周一三、数据结构周二四）第一次上。
4. 已知未修（低优先）：Chicago「继续学习」把按钮文字当提示词发出；讲解风格冲突（desktop.json courseStyles vs 课程页「讲解风格」，已诊断未修）；`progress-panel.tsx` 527 行待拆。
5. **搁置**（新功能，用户要求先不做）：原书显示 `docs/desktop/batch-books-1.md`（设计稿 `design/animate/?d=books` 已确认）；Bear 技能面板设计稿；Trilium 同步；应用图标。

**待用户自己处理**：离散 D1 在 11-06 旧会话里的作答没收课记录（开课时告诉学根讲过一遍）；离散课程页「讲解风格：深度」与实际所选不符；从学根「检查更新」装 v0.4.1（v0.4.0 仍走 API，可能 403，等一小时或让 Claude 直接装）。默认模型已改回 OpenDesign `deepseek-v4.1-flash-eco`（备份 `/tmp/settings.json.bak-1106b`）。

**重要**：安装版的技能来自打包快照（`Resources/xuegen/skills`），改仓库 SKILL.md 必须发版才进用户的学根；每次发版要用户明确说「发版」。发版流程见 `docs/desktop/RELEASE.md`（现在要上传 `notes.md` 附件）。
**测试注意**：测前跑 `/tmp/xg-e2e/prepare.sh`（备份真实库与 ~/.xuegen、重拷副本、副本 AGENTS.md 顶部加护栏），测后跑 `/tmp/xg-e2e/check.sh`。已查明测试窗口读真实库的原因：模型自己 `cat ~/.xuegen/wiki.json`（11-06 会话）。测试窗口（`XUEGEN_HOME=/tmp/xg-e2e/home`，端口 9460）里的学根会去读真实库（实测读过、没写过）；验收后用 `find <真实库> ~/.xuegen -newer <标记>` 确认。Electron 的 `net.fetch` 跟跳转后 `response.url` 为空，要读跳转用 `net.request` + `redirect` 事件。

## 当前位置
学习周期 C1（2026-11-06 ~ 12-24，周五至周四为一周）。主项：离散（Epp，周一三，D1 已挪到 11-07）、CTM（周二四，D1 = 11-10）；辅助：C 语言（周一三）、数据结构（周二四）。主项读原书 =「讲后读（错开）」核心页（开课时定，读在另一门主项下一个上课日）+ 课程页 `## 原书通读`（全书分段，每周六一段，不受周期限制）。**不估任何时长或读完日期**，只排当天学/读什么。

## 已完成（最近的在前）
| 批次 | 结果 |
|---|---|
| v0.5.0 | 准则文档；讲解风格只管本次会话（新增「默认」、不再保存 courseStyles/sessionStyle）；上下文 60% 先存档→开新会话；日历计入讲后读、Bear 低强度日显示「读书」；阅读队列支持教材（--every/--due/note）；脚本兼容 `wiki/知识/`；技能：开课顺序、按节读课程页、原书 ≤10 页、偏好分层、旧记录归档、course/references |
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
- SICP 文件与版本（找到后登记并排课）。

## 不要碰
- 真实 `~/.xuegen` 与 Obsidian 库（用户在用）；改库内容须用户同意，课程页走 unlock → 改 → lock → dashboard → render-board。
- 用户正式窗口（端口 9470）别点；更新前确认没在回答。
