# PROGRESS（更新于 2026-11-14 19:10；最新发布 v0.12.2；当前主线：总控右栏「动态」+ 术语阅读层 +「撤销这次改动」都已做完待用户看；领域总控未开始（ROUTE 4a））

## ▶ 下一步（新会话直接从这里开始）

**总清单 = `docs/platform/ROUTE-1109.md`（「待办总表」一节）。每次报告末尾附阶段完成表（记忆 xuegen-route-progress）。界面已在做（用户批准了周计划本 / 总控面板），界面代码由 Claude 亲自写（11-12 起）。**
**派活规则**：Devin 一次一批；DeepSeek 一次只跑一个、单子切小（10–15 分钟、先写测试）、命令必须接 `< /dev/null`（见 CLAUDE.md，模型 `deepseek-v4.1-flash` 不带 eco）。OpenDesign 断了就接着上次进度重派一次，再断就停下问用户。派 DeepSeek 时同时跑看守 `/tmp/xg-watch-pi.sh`（改里面的 LOG/FILES、PID）。派 Devin 前先 `ps` 确认没有残留的 `devin -p`（11-12 出过两个同时跑同一单）。

### ★★★★★★★★★★ 11-14 19:10 术语块挪位 + 阅读层排版（全部未提交、未发版、未 push）
- 用户指出宽窗口「本周」下面空一块（今天 925px、本周 673px 并排）。术语块挪进右栏「本周」下面（`bear-cp-col` + `bear-cp-termslot`），宽窗口填满到「今天」底边、行多了在块内滚动；单列（面板 ≤1200px）时按内容高、最多 320px 滚动。两门以上课出课程筛选（全部 / 离散 / CTM，带个数），标题旁写总数；最多显示 40 节课。
- 阅读层（拆成 Bear `reader.tsx`）：术语页顶部写「概念页 · 离散 D1 · 11-07」，去掉正文里重复的大标题（`stripTitle`），窄一点的行宽、行距 1.75、小节标题加分隔线、表格去掉「数据表格」字样；底部「← 上一个 · 离散术语 3 / 6 · 下一个 →」，← → 键也能翻（同一门课内，`termTrail` / `ReaderNav`）。
- 真机：截图 `/tmp/xg-e2e/shots/wide-terms.png`（1800 宽）、`narrow-terms2.png`（1440 宽）、`reader-page.png`、`many-terms.png`（临时塞 20 行测滚动）。
- **检查**：类型 0 错；eslint 干净；vitest 1403 过；build 过；lint-wording 0。`bear/control-panel.tsx` 467 行，仍建议拆。

### ★★★★★★★★★ 11-14 18:40「撤销这次改动」做完并真机验过（全部未提交、未发版、未 push）
- 后端 Devin `batch-plan-undo`（已归档 `docs/archive/desktop/`）：`skills/course/plan-undo.mjs`（`list` / `undo --since`，按时间找这一轮的「计划 / 顺延」jj 提交，恢复这些提交改过的课程文件，之后又被别的提交改过就拒绝；提交「撤销计划 <slug> <date>」）、`close/restore.mjs`（从收课撤销抽出）、协议 `plan.undoable` / `plan.undo`。不做快照：jj 本来就逐轮记账，按回答开始时间找提交即可。
- 前端 Claude：`use-plan-changes.ts` 记每轮开始时间（`today.ts` 新增 `realNowIso()`——真实时间，不受 `XUEGEN_TODAY` 影响，因为要和 jj 提交时间比），卡片和横幅上「撤销这次改动 / 正在撤销… / 已撤销」，撤销后重读周表格 / 课程 / 周期，下一条消息带 `undoneNote`。
- **真机场景**（测试窗口，真模型）：让总控「把离散 D5 从 11-18 挪到 11-19」→ 卡片「改了 1 处排期」、横幅、两处撤销按钮 → 点卡片上的撤销 → 课程页 D5 回 11-18、jj 多一条「撤销计划 discrete-math-epp 2026-11-14」、卡片标「已撤销」、横幅消失、周表格 D5 回到周三。截图 `/tmp/xg-e2e/shots/after-change.png`、`after-undo.png`、`week-grid.png`。`undoneNote` 下一条消息带上没在真机上发消息验（有单元测试）。
- **小问题待做**：卡片「在周表格里看」只切到对应周，不会把页面滚到周表格（周表格在今天卡下面）。
- **检查**：类型 0 错；eslint 干净；vitest 1396 过；build 过；根 `npm test` 674 过。

### ★★★★★★★★ 11-14 17:30 总控右栏「动态」做完并真机验过（全部未提交、未发版、未 push）
- 用户批准设计稿 `control-activity.html` 后照做：右栏一轮一张卡（`core/board/activity-feed.ts`），改动比较 `plan-diff.ts`（回答前后 `cycle.month` 本月 + 下月比较，`use-plan-changes.ts`），周表格 / 月历标记 + 横幅（Bear `changes-banner.tsx`、`planbook.tsx`），宽阅读层（`use-reader.ts` + Bear `control-feed.tsx`）。顺手修：周表格回答结束后不重新读取（`use-control-plan.ts` 加 `useReloadOnAnswer`）。
- **术语改为在学根里打开**：用户点术语报「Unable to find a vault」——Obsidian 登记的库是 `~/Documents/Obsdian-gjy/GJY`（符号链接到 `~/xuegen-data/vault`），按真实路径打不开，正式版也一样（待办「Obsidian 重新选库」）。Devin `batch-wiki-read`（`wiki.read`，`main/data/wiki-page.ts`，只读、限 wiki/ 内 .md、realpath 守卫）；术语点开进阅读层，层里留「在 Obsidian 打开」。
- **真机场景**：在测试窗口让总控「把离散 D4 挪到 11-17」（真模型，32 步，只改测试库副本）：卡片「改了 1 处排期 · 离散 D4 11-16 → 11-17」，横幅出现，11-16 删除线「→ 11-17」、11-17 蓝框「从 11-16 挪来」，「知道了」清掉标记，「看回答」只显示回答文字。截图 `/tmp/xg-e2e/shots/after-2.png`、`after-4.png`、`reader-term.png`、`feed-2.png`。
- **没做**：「撤销这次改动」（要后端快照，见 `ROUTE-1109.md` 4c）；bare / chicago 不画动态卡（仍是普通对话）。
- **检查**：类型 0 错；eslint 干净；vitest 1387 过；build 过；根 `npm test` 661 过、lint-wording 0；lint:skills 0 错。`App.tsx` 452 行（本轮前就是 452，没增加，仍超 450）；`bear/control-panel.tsx` 463 行，建议拆。两张 Devin 任务单与报告已移到 `docs/archive/desktop/`。

### ★★★★★★★ 11-14 16:40 用户回复五点后（全部未提交、未发版、未 push）
- **用户定**：①总控右栏方案可以（先出设计稿）；②术语只要 wiki 链接；③课后读阅读组已列出，不改；④计划通用性列为最后做的发展方向（已写进 `ROUTE-1109.md` 待办总表 4b）；⑤字号还原不要快捷键。
- **术语块做完并在测试窗口验过**：Devin `batch-terms-data`（`skills/course/course-terms.mjs` + `terms.list` 协议与路由，读学习记录「存库」行；真实库 2 组：离散 D3 1 个、D1 5 个）；界面 Claude 写（`core/board/terms.ts` 纯函数 + `use-terms.ts` + Bear `terms-block.tsx`，在「今天 · 本周」和下面三栏之间，链接 `obsidian://open?path=…`，悬停看定义）。测试窗口 Electron 已按原环境变量重启（主进程要重启才认新请求）。
- **设计稿等用户看**：`docs/desktop/mockups/control-activity.html`（截图 `/tmp/xg-e2e/shots/mockup-control-activity-v2.png`）：①右栏动态卡 ②正在改一行进度 ③改动标在周表格 + 横幅 ④宽阅读层。用户批准后：动态卡 / `planDiff` / 标记 / 阅读层 Claude 写，「撤销这次改动」后端派 Devin。
- **检查**：类型 0 错；vitest 1364 过；根 `npm test` 661 过、lint-wording 0；lint:skills 0 错；eslint 干净。任务单 `batch-terms-data.md` 与报告待归档。

### ★★★★★★ 11-14 傍晚：用户七点要求（全部未提交、未发版、未 push）
- **已做并在测试窗口验过**：Bear ⌘0 回总控（捕获阶段先处理，正文缩放跳过已处理的键；bare / chicago 仍是缩放还原）；标签放不下收进 ＋（`fitTabs`，总控和当前标签永远留，弹框顶部「放不下的标签」）；周 / 日视图核实格和今天卡统一按 `verifiedOn` 打 ✓；总控动画第一轮（纯 CSS，`prefers-reduced-motion` 关闭）。
- **DeepSeek 三张单子都做完**（我已复查）：`batch-rename-a-wording-rules`（词表 + lint 加「讲后读 / 带读 / 主项课」，数据格式白名单）、`batch-rename-b-skills`（9 个技能对用户说的字改新名字；**开课不再问课后读读没读**，第 5 步改「回忆」）、`batch-split-control-card`（control-card 291 行 + rows / pending，planbook 176 行 + planbook-items，`controlCard()` 160→18 行）。拆分后白名单跟着挪到新文件；SKILL.md 第 45 行一句错误说明已改。
- **检查**：类型 0 错；vitest 1355 过；根 `npm test` 654 过、lint-wording 0 处；lint-skills 0 错。
- **待用户定**（方案见项目库 `internal/xuegen-1114-proposals.md`）：①总控右栏改「动态」栏 + 改动直接标在周表格上（要不要撤销、要不要先出设计稿）；②术语背诵块（只列 wiki 链接还是也改 Anki 顺序）；③「本周课后读」集中块（周表格课后读行去掉还是留数字）；④计划通用性三步（摸底 → 计划样例测试 → 规则写成数据）；⑤Bear 正文字号还原另给键吗。`App.tsx` 452 行仍超，未派。

### ★★★★★ 11-14 下午：四步全部做完（全部未提交、未发版、未 push）
- **机器检查**：desktop 类型检查 0 错；vitest 141 个文件 1350 过 / 1 跳过；根目录 `npm test` 651 过、lint-wording 0 处；改过的文件 eslint 干净。
- **② 测试**：DeepSeek（`docs/desktop/batch-panel-v2-tests.md`）修了大半后卡住不动（14:22–14:31 无改动、无报告），已杀掉，剩下 Claude 补完。四处叫法测试（`consistency.test.ts`）收紧成只认「导读课」、不许出现「带读 / 辅助」。
- **③ 面板 v2 补齐并在测试窗口验收**（截图 `/tmp/xg-e2e/shots/`）：今天格「整合日 · 先做两门周核实」；整合日周 / 日视图主课格出「离散 周核实 / CTM 周核实」（`planbook.ts verifyItems`，月视图不出）；Anki 格「42 张 · 打开 →」不折行；课后读行用短名「课后读 · 离散 §1.1–1.4」；别的日子显示「这天只能看…」；其余文案改名（导读课 / 课后读 / 主课），`readingOptions.guided「带读」`是新课表单的读法、故意没改。**改了 Devin 的 verifiedOn 规则**：会话里已有核实请求时点「开始」也记下今天（否则行一直停在「开始 →」）；实测点离散「开始」→ 只切过去不重发、记下 verifiedOn、回总控变 ✓「今天已开始 · 回到核实 →」。陪读 → 开自由会话、折叠成「陪读」、顶栏出现临时标签（实测后已停止回答）。
- **④ 顶栏标签页**（`core/board/session-tabs.ts` 纯逻辑 + `use-session-tabs.ts` + Bear `session-tabs.tsx` / `use-tab-shortcuts.ts`，契约 `ShellProps.tabs`）：总控 + 今天开过的课（按开课顺序）+ 当前不在其中的临时标签 + ＋（原会话列表）；忙时圆点、切换前问「等它说完」；⌃Tab / ⌃⇧Tab 轮换；专注模式只留 ⋯；900px 能放下。
- **等用户定**：⌘0 回总控和「正文缩放还原」冲突，暂未绑；标签太多时现在是缩短加省略号，没有收进 ＋；周视图的核实格按「周目标完成」算 ✓，今天卡按 verifiedOn 算 ✓（今天卡已 ✓ 时周视图仍是 ●），要不要统一。
- **待办**：9 个技能文字、SKIN-LEDGER §3 词表和 lint 规则里的旧叫法还没改；`planbook.ts`（335 行）、`control-card.ts`（441 行）、`App.tsx` 原本就超 300 行，这次又涨了，可派 DeepSeek 拆。测试窗口 `desktop.json` 改过 courseStartedOn（备份 `desktop.json.bak-1114`）。

### ★★★★ 11-14 接手（上个 Claude Code 会话 11-13 22:05 因额度不足 403 中断，接着做）
- **用户 11-13 已批准**：面板 v2 设计稿 `docs/desktop/mockups/panel-v2.html`、新名字（主项课→主课、带读→导读课、讲后读→课后读，入口「陪读」，只改给人看的字）、标签页 `mockups/tabs.html`。
- **v0.12.2 已发布**（`bd1953e`，11-13 21:54，修重复核实 / 开课重发）。
- **Devin `batch-verified-on.md` ✅**：协议 `verifiedOn`（每门课哪天发起过周核实），`use-course-sessions.ts` 记下；它范围内 70 条测试全过（日志 `devin-verified-on.log`）。
- **面板 v2 界面（Claude 写，未提交）做到一半**：`action-marker.ts` 加 `accompany`；`control-card.ts` 分组 / 中性文字 / 陪读 / verified 状态；`use-control-card.ts`、`use-control-planbook.ts` 接 `onAccompany`（借用普通会话：打开后发带 `accompany` 标记的话）与 `verifiedOn`；Bear `control-card.tsx` + `skin.css` 分组、勾选框、「陪读 →」；`planbook.tsx` 过期 ↷、阅读 ☐；`control-panel.tsx` 落后不标黄；`strings.ts` 状态格 / 书房中性文案。产品代码类型检查过，**测试未跟上：7 个类型错误（全在测试）+ 21 条测试失败（旧文案 / 旧结构断言）**。
- **用户 11-14 定的顺序**：①本条存档 → ②修测试（类型 0 错、全过）→ ③测试窗口对照 panel-v2.html 验收（核实行 ✓「回到核实 →」、陪读入口、20 条文字对照）→ ④写顶栏标签页并验收。**陪读后端暂时借用普通会话，不派单独会话类型（用户未定）。不发版、不 push。**

### ★★★ 11-13 夜：重复核实 bug + 面板 v2 第二版
- **用户定带读 = A（保持是课）**；补充：阅读行（只勾选的）也要能开会话陪读 → 设计稿阅读行加「陪读 →」（开会话、不记完成）；改名建议：主项课→主课、带读→导读课、讲后读→课后读（只改给人看的字，数据字段不变），**等用户确认改名与设计稿**。
- **重复核实 bug（用户在 v0.12.x 报）**：真实离散会话里核实请求发了 4 次（06:07/06:21/06:26/12:33）。根因：①`startSession` 打开当天记住的会话后无条件重发请求（开课同理）；②总控「今天」的核实行没有「已做过」状态，引人再点。修复第 1 轮（DeepSeek `batch-no-resend.md`，`alreadyAsked`）单测全过但**真窗口仍重发**：`history` 先到、`session-opened` 后到，`.then` 读的是还没渲染的旧消息。第 2 轮 `batch-no-resend-2.md`（`controller.openedHistory()` 同步读刚到的历史）✅：真窗口复验——回总控再点离散核实只切过去、会话文件不新增请求；CTM 第一次核实照常发出。桌面 1331 / 根 651 全过。**未发版**（等用户说）。②行状态（核实行变「回到核实 →」）还没做。

### ★★★ 11-13 晚：v0.12.1 已发布（`96578e7`，修总控「本月」空白）；标签页已批准；面板 v2 设计稿等用户看
- v0.12.1：组装处 `panelProps.month` 写死 null → 本月空白。改为传月数据、默认周视图、点格子看那天 + 回到今天、今日卡常驻；DeepSeek 补组装处回归测试 `use-control-planbook.test.tsx`（先改回 null 确认会失败）。漏检原因：上次验收只截了周视图，测试只测组件和翻页、没测组装接线。
- **标签页：用户 11-13 批准**（`mockups/tabs.html` 6 条规则照稿）。和面板 v2 一起做（同在顶栏）。
- **面板 v2 设计稿 `docs/desktop/mockups/panel-v2.html`，等用户批准**：①顶栏换标签页；②「今天」按完成方式分「上课（开会话、收课才算完成）/ 阅读（左侧勾选框，勾了就记下）/ 复习（Anki，学根不记）」；③去掉评判 / 催促字眼（没学、晚了、过了日子还没做、比计划晚），改成「原排 11-12」「预计 12-29 收尾」等中性说法；原计划日期挪到总进度底行。稿里有 20 条文字对照表。
- **待用户定**：带读算上课还是阅读（A 推荐：保持是课、界面归「上课」、只改文字；B：改成阅读、要改数据和技能）。
- 用户 11-13 反馈的根因：今天清单三种完成方式（开会话 / 一键记完成 / 只打开工具）共用同一种按钮样子；带读放在「书房」行却要收课。

### ★★★ 11-13 13:30 v0.12.0 已发布（`bc26196`，tag v0.12.0，GitHub latest，zip + notes.md）
- 用户定：**公开仓库只推代码和说明**；任务单（batch-*）、`docs/platform/`、PANEL-PLAN、PROGRESS.md 以后都留本地不提交（约 38 个文件）。
- 发版前面板收尾（Claude）：周格子写短名（`PlanItem.short` 补讲后读 / 自读）；面板按区域宽度切布局（容器查询，1440 + 聊天栏变单列）；`bookTitle` 去掉带备注的路径（补测试）；总进度每门课一行 + 路线一行；卡片表头 + 格式不全；书房「加一本书」小表单；总控里「技能与设置」「新卡片」改弹框（`shell.tsx` `dialogTool`）。异步连点：书房 done / extract、阅读队列 add / review 加锁（DeepSeek `batch-async-guard-a.md`）。桌面 1315 / 根 651 全过、用词 0。
- 用户自己在学根里「检查更新」安装（替换前确认没在上课 / 收课）。

### ★★ 11-12 晚 第二轮（用户批准新排序后执行，全部未提交）
- ✅ 切换会话截断（Devin `batch-switch-guard.md`）：Pi `dispose()` 会丢已流出部分（源码已核对）→ `agent/restart.ts` 先 `await abort()` 再 dispose；渲染端 `use-switch-guard.ts` 7 处切换入口统一经 `guardSwitch`。Claude 写 Bear 弹框 `SwitchGuard`（`.bear-guard`，「等它说完」实心 + 默认聚焦，Esc = 等它说完）。真窗口验过：回答中切换 → 半句 938 字存进会话文件、切回可见；等它说完 → 不切、照常说完。**待用户定**：确认「切换」时排队未发的话被丢（停止键会放回输入框）。待 DeepSeek 审。
- ✅ 总控去掉「课程与计划」按钮 + 侧栏 + ⌘1–5（`shell.tsx` `hasDrawer`），真窗口验过。
- ✅ Epp 01-28 → 01-31 **不是 bug**：旧值按 started 11-09 算，新值按今天 11-12 算（11-09–11 自读没读）；空「## 暂停」小节是有意保留（renderIndex 注释）。总控列的 4 处清单已取出（epp.md 加 target；index Epp 行；CTM 04-17→04-20；空暂停节），**等用户选 A 全写 / B 只写书页**（Claude 建议 A）。
- ✅ 书房恢复当天 today 仍给出一段（DeepSeek `batch-shelf-resume-today.md`）：`bookView.resumedToday` + today 文字 + 今天卡片该行无按钮；根 651 / 桌面 1298 全过、用词 0，副本复现已消失。
- ✅ 设目标日期（用户选 A）：测试库 `bookshelf target epp --date 2027-01-15` 已写，4 处与总控预告一致（CTM 04-21，因日期变成 11-13）。
- ✅ 切换时排队的话放进新会话输入框（用户同意；DeepSeek `batch-switch-carry.md`）：桌面 1302 / 根 651 全过、用词 0。真窗口未点。
- **标签页（用户 11-13 提）**：设计稿 `docs/desktop/mockups/tabs.html`（A 总控 / B 课程回答中 / C 没开课 / D ＋列表 + 规则表），**等用户批准**。分两步：先只改界面（总控 + 今天开过的课），4b 后后台接着回答。
- 下一步：第 5 项面板三宽度验收 → 第 7 项规范表 → 第 6 项异步入口审查（DeepSeek）。

### ★★ 11-12 21:30 交接：还没做的（按顺序）
2. **总控里去掉「课程与计划」按钮和侧栏**（用户 11-12 定的「总控里不显示侧栏」，这批漏做）：只在总控会话去掉，课程会话保留。界面，Claude 改（`skins/bear/shell.tsx` 顶栏按钮 + 抽屉，条件 `props.planbook !== null`）。
3. **设目标日期写库**：用户同意了，但总控在测试窗口里说「这次落地会有 4 处改动、3 个日期数字变化，你本来只想要两处」，完整清单没拿到（只在界面上，会话文件里搜不到）。下一步：在测试窗口让总控逐条列出 4 处（文件 / 行 / 改前 / 改后）给用户看，用户确认后再写。另：Epp 预计 01-28 → 01-31 是不是重画目录凭空挪日期（可能是 bug），要查。注意：这是测试窗口的库副本（`/tmp/xg-e2e/vault/GJY`），不是真实库。
4. **面板验收没做完**：1440、900 两个宽度截图与设计稿 `?d=dash` 同宽并排对照；1920 只截了真窗口、没逐元素对照。按 `docs/desktop/FEATURE-UX-CHECKLIST.md` 逐项写验证方式。
5. **用用户给的规范把面板过一遍**（用户 11-12 给的链接：NN/g 首页十条、导航菜单、About Us、F 型阅读、表单设计；GOV.UK 界面文案；Material 3 窗口断点、字体层级；WCAG 2.2；Core Web Vitals；Google SEO 入门）→ 出一张「规范 · 条目 · 现状 · 改不改」表给用户看（About Us / SEO 对桌面应用多半不适用，表里写明理由）。
6. **同类异步问题审查没做完**：开课连点已修；其他「点了发异步、结果晚到」的入口（读完了、存进书页、改计划、加卡等）还没逐个查。
7. **领域总控（阶段 5 v0）**：设计稿 `docs/desktop/DOMAIN-RECALL.md` 未写、Devin 单未派；等用户说开工。
8. **「今天到期」列（卡片块）**：新功能，数据要从 `anki.status.due` 按牌组对上、Anki 没开时降级；用户说按批次排，具体批次未定。
9. 之后：批 5（开下一周期向导 + 周期事务）、批 6（「今天学过」一行 + 设置开关）、收尾（SKIN-LEDGER 补记、约 95 个文件未提交、发版须用户说「发版」）。

### ★★ 11-12 晚：已做完、已验证（全部未提交）
- **总控面板（Claude 写）**：`core/board/use-control-panel.ts`（数据拼装，不另发请求）、`skins/contract.ts` 新插槽 `ControlPanel` / `ControlPanelProps`、`skins/bear/control-panel.tsx`（六格、今天、本周 / 月 + 切换、总进度、书房、已登记没排、卡片）、bare 最小实现、chicago 占位、`planbook.tsx` 抽出 `PlanbookBody` 复用、`use-control-planbook.ts` 组装 `panelProps`、`App.tsx` 用 `ControlPanel` 替换 `Planbook`（432 行）、`skin.css` 加 `.bear-cp-*`（只用 Bear 变量，内容最宽 1480 居中，≤ 900 变一列）、`strings.panel` 补标题 / 按钮 / 校验文案。真窗口确认：六格中文标签、本周表格、周 / 月切换、总进度只剩主项（用户定带读不进总进度）、书房按钮。
- **设目标日期**：书房行「设目标日期」展开小输入框（用户选 A），格式错在框下提示、不发；对了发给总控（`control-prompts.ts` 的 `setTargetPrompt`），消息折叠成「交给总控 · Epp」、原文收在默认关闭的 `<details>` 里。
- **书房路径泄露**：`panel.ts` 新 `bookTitle()` 去掉资料标题末尾的 `` （`raw/…`） ``，测试 15/15。
- **开课连点重复开会话**：Devin `docs/platform/batch-open-lock.md`（第二轮；第一轮只改了 `dateKey → todayKey`，保留），`use-course-sessions.ts` 加同步锁 `opening` ref（开始加锁，then / catch 都释放；打开中再点只聚焦），测试 A–D 四条；全量桌面 1280 pass、根 650 pass、lint-wording 0。真窗口连点一次后每门课只有一个会话文件；修复前后没做对照。
- **面板数据（Devin）+ 指令折叠（DeepSeek）**：见下面 11-12 傍晚 / 夜两条。
- 测试窗口：端口 9460，`XUEGEN_HOME=/tmp/xg-e2e/home`、`XUEGEN_TODAY=2026-11-12`、假 Anki 18765，日志 `/tmp/xg-e2e/dev-panel.log`；设置文件是 `/tmp/xg-e2e/home/desktop.json`（不是 settings.json）。CDP 脚本 `node /tmp/xg-e2e/cdp.mjs '<js>' <截图名> <等待毫秒>`（参数顺序别错）。侧栏总进度里收起的课程卡，「回到这节课」要先点 `button.bear-p4-top` 展开才出现。
- 这次会话后期 Claude Code 自动模式的安全检查（classifier）间歇不可用，Bash 会被拦，等一会儿重试即可。

### ★ 11-12 上午：批 3 周计划本界面做完，等用户试用（全部未提交、未发版）
- 验收：对照设计稿逐元素核对 `docs/desktop/PLANBOOK-AUDIT-3b.md`，第一轮 9 处不合格（最重：右侧聊天栏被截、月视图每格塞整节课内容）→ DeepSeek 3b-fix-a 全修，Claude 复验通过（剩 1 个溢出是今日简报代码块，框可横向滚，设计如此）。场景走查 13 场景 / 103 项全过；桌面 1234 条、根 643 条全过；用词闸门 0 处。
- 本轮新查出：①讲后读「读完了」页码从没记进书页（11-08 起，check-5 已修）；②走查脚本误点计划本顶栏新加的「今天」按钮，「今天」面板从没打开过、S1 先前的通过不可信 → 改成只点 `role=tab` 并先确认激活的是目标标签再读，重跑全过；③走查脚本每个场景都调 prepare.sh 整库备份，把磁盘塞满（盘剩 124MB）→ 已删 37 份自动备份（约 27GB，留 `/tmp/vault-backup-test-1111-2301`），脚本改为一轮只调一次 prepare.sh、场景之间 rsync 还原快照。磁盘写满期间核对过真实库：jj 干净、最新一笔仍是「计划 algorithms-sedgewick」，`~/.xuegen` 无影响。②③已记进发现记录。
- **等用户**：①要不要现在开测试窗口试用（库副本、日期今天、假 Anki 42 张）；②看一眼设计稿没画、Claude 自己定的 3 处：总控默认打开「日」视图（今天清单，可直接开课）；「课程与计划」侧栏打开时暂时盖住右侧聊天栏；打印和浅色模式没法自动测，请用户点「打印」看看。③磁盘（11-12 10:30 `df` 可用约 13GB），建议用户有空清理。
- 11-12 10:40：用户让清备份、开窗试用、准备批 4–6 策划。已做：删 0307/0312 两份测试备份，`prepare.sh` 改成只留最新一份 + 1111-2301；测试窗口已开（端口 9460，`XUEGEN_TODAY=2026-11-12`，假 Anki 42 张，日志 `/tmp/xg-e2e/dev-try3.log`）；策划稿 `docs/platform/PLANBOOK-456-PLAN.md`（Q1–Q7 待用户定，定了再写任务单）。
- 11-12 11:00 用户试用发现周计划本和设计稿差很多（Devin 做的 3b，Claude 验收漏了）。根因之一：`skin.css` 的 `.bear-pb button` 重置优先级高于 `.bear-pb-cell`，格子线和留白全没生效。**用户定：以后界面代码由 Claude 亲自写，返修仍交 DeepSeek**（已写进 CLAUDE.md 与记忆）。二次返修：DeepSeek `docs/desktop/batch-planbook-3b-fix-b.md`（CSS，在跑，日志 `deepseek-3b-fix-b.log`）→ `batch-planbook-3b-fix-c.md`（周格子读法开头、今天只主项 ●、今天 Anki 格「今天 N 张 + 打开 →」、标题「· 计划本」，待派）→ Claude 并排截图 + 量计算样式复验。批 4–6 的界面部分改由 Claude 写（策划稿拆分待按此改）。
- 11-12 中午：fix-b ✅（Claude 复验：真窗口格子 padding 8px、边线 1px；桌面 1238 pass）；fix-c 在跑（`deepseek-3b-fix-c.log`）。用户定：**总控做成一页面板**（总控里不显示侧栏，侧栏内容全挪到这一页；课程会话侧栏不变）；Q2 暂停、Q3 周期事务批准；批 6 改成只显示「今天学过」一行 + 设置开关、不另记时；整体骨架写成 GitHub 上的书已进 ROUTE 阶段 6。Claude 出了面板设计稿 `design/animate/src/dash.{jsx,css}`（`?d=dash`，截图 `/tmp/dash-shots/`），**等用户看**；批准后批 3.5 + 批 4 合并成「总控面板」，Claude 写界面。
- 11-12 下午：用户**批准面板设计稿 `?d=dash`**；给了 UX 清单原稿 `~/Desktop/feature-ux-spec-template.md`，Claude 修订成 `docs/desktop/FEATURE-UX-CHECKLIST.md`（功能卡、A/B/C 分级、每项要写验证方式、视觉 / 一致性 / 撤销三档 / 脚本契约，修订说明 9 条），SKIN-LEDGER G1 已加「总控例外：一页面板」。以后每个界面功能按它写单、验收。下一步：fix-c 验收 → 写「总控面板」任务（数据 Devin + 界面 Claude，按清单填功能卡）。
- 11-12 下午：fix-c ✅（Claude 复验：真窗口周格子有读法开头、今天只主项 ●、今天 Anki「今天 42 张 · 打开 →」、标题「总控 · C1 · 计划本」；桌面 1246 pass、根 643 pass、用词 0 处；DeepSeek 报告曾误跑 prettier 后逐块还原，测试与截图未见副作用）。批 3 返修完。待办总表已写进 ROUTE「待办总表」。下一步：写总控面板任务（功能卡按 FEATURE-UX-CHECKLIST，标出顺手认领的界面讨论项）给用户过目。
- 11-12 下午：用户批准总控面板计划 `docs/desktop/PANEL-PLAN.md`（功能卡、做/不做、顺手认领）。在跑：Devin `docs/platform/batch-panel-a-data.md`（协议补 target/targetLate/delayDays/broken、书房 pause/resume、`panel.ts` 状态格/在读表/已登记没排），日志 `devin-panel-a-data.log`。用户特别要求解决 1920 显示：设计稿加 1920 档（内容最宽 1480 居中、格子只写短内容），规则写进 PANEL-PLAN「宽屏 1920」。之后：数据 B（动作标记补齐 + 面板按钮发话）→ Claude 写界面 → DeepSeek 审/返修 → 验收。
- 11-12 傍晚：面板数据 A（Devin）✅，Claude 复验：桌面 1260 / 根 650 全过、用词 0；在副本上手跑 pause/resume（暂停后 today 无段、排队书不顶上、非在读不能暂停、恢复后接着排）。**待审一处**：恢复当天 today 仍给出一段（单子说「明天接着读」）——交 DeepSeek 审时一起看。在跑：DeepSeek `docs/desktop/batch-panel-b-markers.md`（建课 / 周核实 / 起草卡片 / 剪藏 / 面板书房按钮的指令都折叠；新 `control-prompts.ts`），日志 `deepseek-panel-b.log`。之后 Claude 写面板界面。
- 11-12 夜：指令折叠（DeepSeek batch-panel-b）交回，Claude 复验：桌面 1275 / 根 650 全过、用词 0；建课、周核实、起草卡片、剪藏、书房按钮（`control-prompts.ts`，还没接到界面）都已带动作标记；练习题的提示 / 跳过是用户自己的点击，不折叠。**待办**：面板书房按钮接到 `control-prompts.ts`（界面批）。
- 11-12 深夜：①书房路径泄露已修（`bookTitle` 清洗，测试 15/15）；②开课连点已修（Devin 第二轮，同步锁 `opening` ref + A/B/C/D 四条测试，全量 1280 通过，真窗口连点后每门课仅一个会话文件；修复前后未做对照）；③总进度只放主项（`role === "main"`，带读不进总进度，用户定）；④卡片「今天到期」列界面本就没有，属新功能待定；⑤设目标输入框、三宽度截图对照未做。**领域总控**：计划在 ROUTE 阶段 5 与 PROGRESS「11-11 定方向」，但 11-12 待办总表漏列；设计稿 `DOMAIN-RECALL.md` 未写，Devin 单未派。
- 用户试用后：按反馈派返修 → 批 4（总进度 / 书房目标日期显示 / 加书）→ 批 5（开下一周期向导）→ 批 6（时间记录）。另：用新流程把 11-11 全部改动重新走查一遍再报结论（见下节末条）。

### ★ 11-12 凌晨：新查 bug 流程（用户同意，`docs/platform/CHECK-PROCESS-1111.md`）
- 起因：真机过界面发现 6 处（fix-d 已修：已收课仍显示开课；fix-e 在修：Anki 张数、讲后读行、自读叫法、空「还没有书」行、带读名字/预计日期、右侧带读完成态）。
- 五步：①用词闸门 `batch-check-1-wording-lint.md`（待派，fix-e 后）②一件事只算一次 + 跨处一致性测试 ③`XUEGEN_TODAY` ④场景表自动走查 ⑤任务单写「还在哪些地方显示」、发现表加「为什么没抓到」（已执行）。
- 11-12 进度：①用词闸门 ✅（`scripts/lint-wording.mjs` + `wording-rules.json`，已挂进根 npm test，0 处）③`XUEGEN_TODAY` ✅ ＋ `XUEGEN_ANKI_URL` ✅ ④场景表 `SCENARIOS.md` ✅、走查脚本 `/tmp/xg-e2e/scenarios/run.mjs` 第一轮 12 场景 94 项全过（S6 书房目标显示为已知缺口→批 4）②一致性测试在跑（DeepSeek `batch-check-2-consistency.md`）。批 2 数据接口在跑（Devin `batch-planbook-2-data.md`）。走查新发现记进 PLANBOOK「场景走查发现」。
- 11-12 凌晨：新流程 ①–⑤ 全部落地；批 2 数据接口 ✅（+返修：自读日期、书房测试假绿）；批 3（3a 核心 + 3b 界面 + 3b-fix-a 9 处返修）✅，验收表 `docs/desktop/PLANBOOK-AUDIT-3b.md`，场景走查 13/103 全过；讲后读页码从未记进书页的老 bug 已修（check-5）。走查脚本曾把磁盘塞满（已清 37 份约 27GB 备份、脚本改 rsync 快照，见上节）。全部未提交。
- 做完后用新流程把 11-11 全部改动重新走查一遍，再向用户报结论。

### ★ 11-11 晚：周计划本 + 两种排期（设计稿已批准）——当前主线
- 规则与拆批见 `docs/platform/PLANBOOK-1111.md`；设计稿 `design/animate/src/plan2.*`（`?d=plan2`）。用户说「设计稿非常好，就按这个来」。
- 用户已同意：A 辅助课去完结（并进书房叫「带读」）、B 新周期 5 步向导（总控技能 + 按钮）、C 书房目标日期只作对比。
- 批 1 进度（11-11 22:30）：技能文字已改（course 辅助课不设完结 / cycle-plan 新周期 5 步、简报「带读」「自读」/ reading 读法与 target）；库已改（用户同意）：c-language、algorithms-sedgewick 去 `end=`、D14 按 jj 原文放回（12-28、12-29），jj「计划 …」两笔，备份 `/tmp/vault-backup-1111-aux/`。在跑：Devin `batch-planbook-1-target.md`（日志 `devin-planbook-1-target.log`）；DeepSeek `batch-planbook-1-check-a.md`（只写测试）。之后：审 Devin → DeepSeek 补测/审 → bug 检查其余模块。
- 批 1 完成（11-11 23:30，未提交）：bookshelf `target`（Devin，手测通过）；带读不设完结测试（DeepSeek check-a，+todo 跨周期）；返修 fix-a（带读提示加 elastic、排课卡「不设完结」、real 测试去掉 Last updated 日期依赖）。根 597 / pass 596 / todo 1；桌面 1117 pass。
- 11-11 深夜：技能文字已按措辞审查改完（cycle-plan 4、course 7、course-board 7、calendar 2、reading 1、snapshot 1）；用户定 4 条待定：G7 放开预计日期、日子类型对用户叫「主攻日」（数据仍「深度」）、「结课」只给主项（带读写「预计 … 学完」）、顺延提示说日期不说编号；SKIN-LEDGER G7 与词表已更新。在跑：Devin `batch-planbook-2-carry.md`（带读跨周期 + check 放过越界）；DeepSeek `batch-planbook-1-fix-b.md`（strings.ts 文案）。待派：书页小标题「核心页已读」→「讲后读已读」（bookshelf.mjs 兼容旧标题）。
- 技能措辞审查完成：`docs/platform/WORDING-AUDIT-1111.md`（33 确定 + 4 待定；按表改技能文字由 Claude、strings.ts 随周计划本界面批）。
- 已知缺口（排进批 2）：checkCycle 把越过周期的带读课次报成「在周期之外」（带读一拖过周期 check 就报错）；`cycle.mjs day` 只认当前周期模板的科目，带读跨周期会看不到。小尾巴：提交过的 `.close/` 暂存目录不清理，会越攒越多。

### ★ v0.11.0 已发布（11-11 16:00，`dd5ba6c`，tag v0.11.0，GitHub latest）——下一步：界面讨论
- 内容：全量测试 fix1b–fix18（fix15 访达 PATH 最要紧；停止清排队放回输入框；书房同日 done 防重；vault-lint 断链 + 概念页 frontmatter）。结果表见 `docs/platform/FULL-TEST-1110.md`「三件的结果」。
- 已安装 0.11.0（11-11 核对 Info.plist）。
- **界面讨论前要做的两件（用户 11-11 提）**：
  1. **有逻辑没界面**逐条过（清单在 `docs/platform/FULL-TEST-1110.md`「有逻辑没界面」，带 ? 的先核对）：卡片缺 END 块数；收课历史与撤销（jj 里收课/存档点/偏好/计划/顺延记录无处看）；讲解偏好看不到、不能删改；流程第 n/8 步；周期推迟天数与「留到下个周期」（?）；渐进阅读推后/暂停/笔记（?）；vault-lint、course-state verify 结果；检查更新只在原生菜单；会话列表只读当前目录；没逻辑也没界面：课程 archive、英文术语卡。
  2. **技能措辞审查**：9 个 `skills/*/SKILL.md` 里凡是 AI 会说给用户听的话，对照 `docs/desktop/SKIN-LEDGER.md` 第三节词表与 G4（不出现脚本名、路径、内部词）逐条查；已知：讲后读/核心页混用（见下）；`strings.ts:522`「写入库，由 Obsidian 同步到 Anki」已过时（插件已停，现直连）。产出一张表：技能 · 原句 · 问题 · 改成。
- **待做（用户 11-11 定方向，暂不实现）：领域总控 v0，不接 RAG**。用途：忘了的词去问。已定：① 汇总记录两种都要——脚本从概念页抽术语（标题 +「**中文**（English）」）生成 `wiki/_generated/glossary/<科目>.md`，收课提交时随看板重画；AI 收课时在科目页写「## 领域小结」（≤ 20 行，规则同讲解偏好）；② 先在总控里问（只读 `domain` 技能），不加界面；③ 查询范围 = 该科目知识页 + 课程页学习记录（不查会话、闪卡）。依据：最大科目约 10 万字，整份放得进上下文。用户说开工再写设计稿 `DOMAIN-RECALL.md` 与 Devin 单。
- 11-11 已办（用户同意）：库补记 jj `b22b0f29`「补记：11-10 晚顺延与改计划」，连同 `3b35f4ff` 一起推到私有远端（`main@origin` = `b22b0f29`）；那 5 个 `.close/` 暂存目录移到 `/tmp/xg-close-backup-1111/`；库工作副本干净。
- 11-11 OpenDesign 服务端 `resolve Billing Scope: 503 database_unavailable` 几乎每次都断（不是本地网络）；fix17 末尾一行、fix18b 实现、fix18c 审核由 Claude 做（用户同意）。
- 界面讨论要带的清单（11-11 追加：组合学习 tab + 「提前」动作（一门课一会话，tab 只排顺序）；固定流程步骤做成数据（供「第 3/8 步」与工具行人话）；用户学习规则集中成 JSON（10 页、1/3/7/14、15 行等现散在脚本/护栏/SKILL.md）；讲后读不自动顺延、`!` 一直挂着的显示；**讲后读/核心页术语混用**（11-11 离散 D3 开课：「两节核心页同天」「顺到 11-17 告诉我一声」——对用户只说「讲后读 · pp.… · 日期」，核心页留作技能内部词；两份讲后读撞同一天自动错开或合成一行）；**核心操作用时基线** `docs/platform/SPEED-BASELINE.md`；**总控做成「周计划本」为主、聊天为辅**（参考 jellymai/study-planner：10 分钟时间网格→自动记实际学习时长、周目标/周复盘→接周模板与整合日、周待办→自动列讲后读/书房/课程排期里的复习（不列 Anki 过期卡）、日/周/月视图+打印；该仓库无许可证、数据存浏览器，**只借思路不嵌入、不拷代码**）；顺延保持每门课各自挪，用户 11-11 认可）：FULL-TEST-1110「有逻辑没界面」；第 0 节「待用户定 ③」；4b 节；fix18 小尾巴（刷新后停止可能撤掉正在回答那条；连发瞬间状态回传少还一条）。

### （已完成）全量测试（11-11 14:50）——3 件已做完并随 v0.11.0 发布，以下仅存档
- 用户 11-11 15:00 定（已完成：fix16–18）：
  1. 停止 = 停 + 清排队（Pi `clearQueue()`），排队那条**放回输入框**（不留在对话里）。涉及界面，但用户已直接定，可做。
  2. 书房同一天 `done` 两次**拦截**（第二次报「今天这段已记过」，不前进；把 B5 的 todo 测试转正）。
  3. vault-lint **加**断链检查与知识页 frontmatter（`sources:`）检查（把 B7 两条 todo 转正）。
- 用户问的另两件（已答，记在这里备查）：顺延逻辑见 FULL-TEST-1110「顺延说明」；中英术语：现在只有 teach 规定「新术语第一次出现加粗、括号给英文原名」，**英文术语卡（双向）还没做**（阶段 6）。
- 「有逻辑没界面」清单（用户要汇总，界面讨论时用）：见 FULL-TEST-1110「有逻辑没界面」。
- 然后：发版（fix15 最急，用户说「发版」才发）。
- 结果逐条在 `docs/platform/FULL-TEST-1110.md`「发现」表（现象 / 复现 / 根因 / 修复 / 验证）。全部改动**未提交**。
- 已做：A1/A2；B1–B8；C1–C8（C7 开发模式测不了）；D 场景大部分。
- **最重要的发现（fix15）**：装好的学根（从访达启动）PATH 里没有 Homebrew，`jj` 找不到——真实使用里收课/计划/顺延从没进 jj、撤销收课不可能成功（真实会话 5 次 `spawnSync jj ENOENT`）。已修并用访达式 PATH 验证。数据没丢（文件都写了，只是没单独 jj 记录）。发版后才生效。
- 已修并验证（13 单 fix1b–fix13）：原书一次 ≤ 10 页写进 bash 护栏；撤销按钮调 `course_close undo`；「不记录」不出撤销；OpenDesign「Billing Scope」503 自动重试（`agent/transient-error.ts`）；课程会话能记「以后讲<科目>都…」（收课暂存 add 本科目页、只许改讲解偏好、标签「偏好」）；讲后读去旧备注、书房不重复记；会话标题「C 语言」；verify 漏报无标记页、任务计数统一；卡片缺 END（末尾静默丢 / 中间粘成错卡）；测试只复制 wiki/；calendar month 校验；PATH 补 Homebrew（fix15）。用户 11-11 定：顺延时已完成的课不占日子。
- **待用户定**：① 停止后排队消息乱序送出（停止时清队列；排队气泡撤掉还是放回输入框）；② 一天 `done` 两段要不要防重；③ 界面讨论新增：重试提示多行与重复错误、5xx 文案、日历辅助行短名、卡片面板显示缺 END 数、会话列表只读当前目录。
- 没测：上下文 60% 自动提示；低强度日问「今天学什么」（界面日期改不了）。

### ★ 新会话从这里开始（11-10 23:40 交接）：全量测试
- **v0.10.0 已发布**（tag v0.10.0，GitHub latest；排期弹性 + 总控「顺延今日内容」）。用户自己在学根里「检查更新」安装（替换前确认没在上课/收课）。
- **用户 11-10 要求：全量测试并修 bug**。计划 = `docs/platform/FULL-TEST-1110.md`（A 机器检查 / B 脚本端到端分给 DeepSeek / C 桌面真机 / D 用户场景回归）。方法：找 bug 用 `systematic-debugging`（先四步查根因再改），修 bug 用 `test-driven-development`（先写失败测试），报完成前 `verification-before-completion`（贴验证输出）；界面点击用 `webapp-testing`（Python Playwright `connect_over_cdp` 接测试窗口 9460）。四个技能已装在 `pi-learning/.claude/skills/`（项目级，已扫过：无联网/删除脚本）。DeepSeek 单子切小、只写测试报告失败，返修另开单。
- 测试窗口必须带 `XUEGEN_DESKTOP_CWD=/tmp/xg-e2e/workspace`。

### 0. 当前状态（11-10 21:30 交接）——除界面讨论外的活都做完了
- **RENAME-DAY 全部完成**（第 0–7 步）：库英文名、数据根 `~/xuegen-data/{vault,sessions,workspace}`（中文名留链接）、库 AGENTS.md 去 Migration status 并改路径、Obsidian_to_Anki 插件已停用。**待用户**：Obsidian 重新选库 `~/xuegen-data/vault`；打开学根看一眼；以后检查每次开课 AI 的 8 步（用户 11-10 说会做）。
- **Anki 11-10 修复**：收藏集 11-09 08:21 损坏（当时 Claude 会话用 Python 直接打开正在运行的 Anki 数据库），用 11-08 19:10 自动备份无损恢复（545 笔记/220 复习）。规矩见记忆 anki-db-hands-off。卡片与 Anki 对齐：501 块全有 ID；从没同步过 AnkiWeb（建议用户开）。
- **已随 v0.9.0 推送**：`9fcf024` 数据根脚本英文名；`f8fd333` 0.9.0 收缩删旧名（Devin + Claude 补 4 处）；`7420ff2` anki-sync 重复卡回填 ID；`5f9711e` exactOptionalPropertyTypes；`8e12c92` App.tsx 459→447。CHANGELOG Unreleased 已写。
- **11-10 真机验收（测试窗口，库副本）通过**：今日卡；CTM 开课 8 步全合规、全新路径；收课 stage→snapshot→check→commit，看板进 `_generated/`；断线重试提示（假 503 服务）显示正常。**发现**：①测试窗口以前没设 `XUEGEN_DESKTOP_CWD`，收课暂存写进了真实工作区（已删，验收规程已改）；②连续失败两次时，第一条失败消息一直停在「正在自动重试（第 1 / 3 次）…」不撤（`agent/event-mapper.ts` 只记最后一条失败消息 `lastFailedMessage`；协议没有撤消息的类型），恢复行还写「断开过一次」——待做方向第 10 条只完成一半，怎么显示多次失败在界面讨论时定，再派 DeepSeek（先写测试：两次 503 后成功 → 只剩一行恢复提示）。
- 库 vault-lint 剩 5 条是 raw 深层 `.gitkeep` 误报，装上 0.9.0 后消失。
- **v0.9.0 已发布**（`05f4bf0`，tag v0.9.0，GitHub latest）；用户自己在学根里「检查更新」安装（替换前确认没在上课/收课）。
- **11-10 夜：排期弹性 + 总控手动顺延（本地提交 `d3374cf`、`d7a8e80`，未发版）**。用户定：周期固定 7 周学时、不固定日期；结束日只看主项课；周序号按日历往后数（可出 W8）；总进度周格子跟实际周数走；英文术语卡做双向；504 已不出现；真实 models.json 不加非 eco。实现：`cycle.mjs` 推算实际起止（`loadElasticCycles`/`elasticCycles`/`shiftRoute`，路线结束日同步平移），`plan-view` 格子按周数；主项排课 `--elastic` 不写 `end=`；`course_plan` 新增 `shift`（总控说「顺延今日内容」→ 每门课 today=明天）。真机验收通过（测试窗口，`XUEGEN_DESKTOP_CWD=/tmp/xg-e2e/workspace`）：推迟 14 天的库总进度显示 2028-08-03、C1 9 格；总控只用 course_plan shift 把 CTM/数据结构 D1 挪到 11-12、jj「顺延」、辅助 D14 进「留到下个周期」。小偏差：总控没按技能最后跑 overview 报晚几天（只估了「约 5 天」）。用户今天（11-10）没上的 CTM D1、数据结构 D1：明天开课自动顺延（或装新版后在总控说「顺延今日内容」）。
- **下一步**：全量测试（见上 ★）；然后界面讨论（显示当前步骤、工具行人话、课程停用通道 archive、重试提示文案）。

### 0b. 之前的记录（11-10 19:30 交接）
- **v0.8.0 已发布并已安装**（`7462ff7`，tag v0.8.0；`/Applications/学根.app` = 0.8.0；`~/.xuegen/app` → 安装包资源）。
- **RENAME-DAY：第 0–5 步完成，第 6 步差用户 Obsidian 重新选库 + 学根看一眼，第 7 步待做**（`docs/platform/RENAME-DAY.md`）：
  - 改名已应用：目录 30、文件 160（搬动 119）、链接改写 926 条（164 个文件）、`.gitignore` `raw/学习路径/`→`raw/library/`。库里已是 `wiki/knowledge`、`wiki/shelf`、`clippings`、`raw/library`。
  - 核对全过：按目标比**新增断链 0**（前后都是 53 条老断链）；`wiki/courses` 0555、9 个课程页 0444；`jj st` 无 `A raw/library/`；`bookshelf today`、`cycle.mjs day`、`course-state verify` 正常；vault-lint 60 个问题与试运行一致（老问题，多为「后缀解析」）。
  - 已 `jj commit`：**`ce4adc4c` 「改名：库全英文命名（rename-vault）」**（基线 `796fa733855d`，撤回用 `jj restore --from 796fa733855d`）。
  - **第 4 步推送被 Claude Code 自动模式拦（Git Destructive）**，用户 11-10 19:50 已跑：本地 `main` 书签已移到 `ce4adc4c`，第一次推送网络失败，**第二次成功**：私有远端 `main` 已到 `ce4adc4c`。**第 4 步完成。**
  - **第 5 步 11-10 完成**：数据根 = `~/xuegen-data/{vault,sessions,workspace}`（里面留 `库/会话/工作区` 中文链接，`~/学根` → `~/xuegen-data`）；`~/.xuegen/sessions`、`~/learning`、`wiki.json`、`~/Documents/学习路径`（原已断）、`~/Documents/Obsdian-gjy/GJY` 都已改指新路径。核对：jj 干净、0555/0444、书房 today、cycle day、course-state verify（参数是 `wiki/courses`）、vault-lint 60 全正常。
  - **第 6 步**：库 AGENTS.md 去 Migration status + 正文旧目录改英文 → jj `c6f3bb61` 已推送（备份 `/tmp/vault-backup-1110-agents/`）；NEW-MACHINE.md（及 `~/xuegen-data/换电脑清单.md`）、`/tmp/xg-e2e/{prepare,check}.sh` 的 `REAL=` 已改。**待用户**：Obsidian 重新选库 `~/xuegen-data/vault`、删旧入口；打开学根看今天/书房/一门课。
  - **待派 DeepSeek**：`docs/platform/batch-data-root-english.md`（`xuegen-data-root.mjs` 改认英文子目录；NEW-MACHINE 第 3 步已按新名写）。11-10 派发被自动模式拦，等用户放行或自己跑。
  - 第 7 步卡片：停 Obsidian_to_Anki 插件、`anki-sync push ~/xuegen-data/vault --dry-run --json` 给用户看。
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

### 2. DeepSeek / Devin 队列
（空。4a 接入、4a-2 回归、整理批、0.9.0 收缩都已完成并发布。）

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
界面讨论 → 4b 多进程 → 阶段 5 领域记忆 → 阶段 6 功能（见 ROUTE）。

### 设计与决定（11-09 用户定，详见文档）
- 顺序：3 收课事务 → 4a 沙盒 → 界面讨论 → 4b 多进程；RAG 推迟（领域记忆会话用，资料超 100 万上下文再做；范围会话+知识页+raw）。
- 阶段 3（`STAGE3-DESIGN.md`）：暂存目录 `~/学根/工作区/.close/`；课程会话的课程页和概念页只经 `course_close`；校验过直接提交；Anki 不进事务。
- 阶段 4a（`STAGE4A-DESIGN.md`）：受保护脚本做成专用工具；bash 网络只放 AnkiConnect；`@anthropic-ai/sandbox-runtime` 锁 0.0.81。
- 权限：读取除凭据外都放开；总控不写知识页；库根 AGENTS.md 禁写；MCP 放行+日志。阶段 2 定位为防误操作护栏+审计，真正边界是 4a 沙盒。
- 已提交（desktop 分支，未推送）：4ddb88a 阶段 1、58724db 阶段 2、9649662 文档、3444bb7 guard 库优先、44ee2f2 3a+3b、037283d 3c、b0f3563 顺延、c7ed8c0 撤销保留新建页、c32672d 3d、2150f12 4a-1。文档、归档**未提交**。

### 小尾巴
- 课程没有删除/停用的通道：以后加 course_plan 的 `archive`（界面讨论时定显示）。
- 断线重试：连续失败多次时第一条不撤（见第 0 节）。
- 桌面单测偶发失败：疑为 `renderer/skins/use-skin.test.ts` 的「loads a registered skin」负载下超时（Devin 11-10 也遇到一次）。
- 英文术语卡：用户 11-10 定做双向（阶段 6 学习内容，未开始）。

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
- **Anki（用户 11-11）**：只在每日任务里一行提醒 + 今日待复习数；没刷不提醒、不补救（FSRS 自己调）。现状已符合。
- 书房规则（用户 11-08）：每天都读、每段 ≤ 10 页、计划内一次一本（先 Epp 后 CTM）、计划外一本、不跳核心页、显示预计读完日期但不估时长。IR 实测（11-09）：FSRS 不排阅读，书房管读、摘录做卡进 FSRS。
- 架构（用户 11-09 定）：数据根 + 库独立私有仓库；jj；卡片直连 AnkiConnect；库全英文命名；会话角色权限清单写死（不让模型生成）；收课事务化（Atomix 式三类效果）；系统沙盒用 `@anthropic-ai/sandbox-runtime`；RAG 只检索 Markdown 原文（node:sqlite FTS5 trigram，后加向量）。
- 发版须用户说「发版」；流程 `docs/desktop/RELEASE.md`；**替换已安装的学根前请用户自己退出**（只看会话文件时间不可靠）。

## 待用户处理
- Obsidian 重新选库为 `~/xuegen-data/vault`（11-10 数据根改名后），删掉旧入口。
- 英文术语卡方向；UI 重新讨论。

## 不要碰
- 真实 `~/.xuegen`、Obsidian 库（11-09 起在 `~/学根/库`，jj+git，私有远端 `GongJiYang/xuegen-vault`；旧路径是链接）、会话 `~/学根/会话`、主 Anki 收藏集：改动须用户同意并先备份。测试用 `XUEGEN_HOME=/tmp/xg-e2e/home`（端口 9460；测前 `/tmp/xg-e2e/prepare.sh`，测后 `check.sh`；截图脚本 `/tmp/xg-e2e/bear-shots*.mjs`、`audit.mjs`）。
