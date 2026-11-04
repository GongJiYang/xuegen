# F2：功能界面

前置：F1 已完成并经 Claude 验收（数据通道、脚本、agent 命令列表可用；库副本上 6 门课、466 张卡/192 已同步、日历聚合正确）。风格在 `desktop.json` 中的取值为 F1 实现的英文键（如 `plain`），界面显示中文「大白话/细讲/深度」，映射放在 `core/strings.ts`。

先读：`docs/desktop/FEATURES.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/skins/chicago.md`、`apps/desktop/AGENTS.md`，以及**视觉基准** `/Users/gjy/pi-learning/design/chicago/features.html`（打开看 `?tool=progress|reading|cards|calendar|skills`、`?demo=slash`、`?demo=day`；像素细节、文案、交互以它为准，直接移植 CSS 与交互逻辑，不自行发挥）。

## 1. core（无样式，带测试）

- `core/board/`：视图模型与控制器 hook——`useCourses`、`useReading`、`useCards`、`useAnki`、`useCalendar(month)`、`useSkills`。全部经 `core/client.ts` 调 F1 的 `xuegen:data` 动作；加载中 / 出错 / 空 三态显式建模；写入动作（加入阅读、读完、存为新卡、写日历、技能开关）成功后刷新相关数据，失败给 Notice。
- `core/chat/style.ts`：当前风格（会话级，默认取当前课程的 `courseStyles`，再默认「大白话」）；发送时加前缀 `[风格：X] `；用户消息显示时把前缀拆成**标签**，正文不重复显示前缀。
- `core/commands/`：`/` 菜单命令表 = 内置命令（`/大白话 /细讲 /深度 /继续 /今天学到这里 /进度 /加入阅读 /今天读什么 /制卡 /日历 /技能`）+ agent `commands`（`/skill:名`，只含启用的）。过滤（按命令名、说明、分组）、上下键、回车、Esc 的纯函数与测试。执行：风格类改风格；面板类打开对应工具窗；`/继续` 发送「继续 <课程>，从下次起点开始」；`/今天学到这里` 发送收尾句；`/skill:名` 插入到输入框等用户补充。
- `core/today.ts`：「接着上次」= 上次学习记录日期最近的课程的 `nextSession`。
- **阅读输入的真实约束**（F1 验收发现）：`reading-queue.mjs add` 只接受库内 `raw/` 或 `Clippings/` 下的原文。因此：
  - 新增数据动作 `reading.sources`（主进程列出库内 `raw/`、`Clippings/` 下尚未入队的 `.md`/`.pdf`，按修改时间倒序，最多 50 条；守卫 + 测试）。
  - 「加入阅读」输入框边输入边给出候选（来自 `reading.sources`），选中候选 → `reading.add`。
  - 输入的是 `http(s)://` 网址 → 不调用脚本，改为发送给学根：「/skill:reading 把这篇文章剪藏到 Clippings 并加入阅读队列（优先级 X）：<网址>」，并在输入框下提示「已交给学根剪藏」。
  - 其他路径 → 显示脚本返回的错误原因（如「原文必须位于 raw/ 或 Clippings/ 下」）。

## 2. 契约（`skins/contract.ts`）与 bare

新增插槽（bare 全部用语义 HTML 实现，契约测试覆盖）：
- `ToolDock`：工具图标列（总进度、阅读、卡片、日历、技能），当前工具高亮；⌘1–⌘5。
- `TodayPanel`：计数 + 接着上次卡片 +「继续学习」。
- `ProgressPanel`、`ReadingPanel`、`CardsPanel`、`CalendarPanel`、`SkillsPanel`：props 是 core 的视图模型 + 回调，不含样式参数。
- `DayEditor`：日历写入对话框（标题、正文、保存路径提示、保存/取消）。
- `SlashMenu`：命令列表、选中项、选择回调。
- `ComposerProps` 增加 `style`、`onStyle`、`commandsOpen` 等所需字段；`UserMessageProps` 增加 `styleTag`。
- `ShellProps` 增加「学习」菜单的工具项与「风格」菜单所需回调。

## 3. Chicago 实现（照 `features.html`）

- 布局：对话窗口（左）｜右列「今天」+ 工具窗（一次一个，切换时缩放矩形）｜最右图标列（32×32 像素图标由 `pixelSvg` 按当前配色生成）。专注模式隐藏右列与图标列。
- 菜单栏：「学习」（今天学到这里 ⌘E、五个工具 ⌘1–⌘5）、「风格」（三种风格带勾选）。
- 输入框：上方一行风格单选 + 「输入 / 查看功能」提示；打 `/` 弹出分组菜单（设计稿 `?demo=slash`）。
- 日历：**双击某天打开 DayEditor**；单击显示当天详情；◀ ▶ 翻月；格子标记 ● ◆ ▲ ✎ 用 `Fusion12Diagram` 字体；非本月格子 25% 网点。
- 卡片：Anki 未打开时显示「Anki 未打开：打开后显示今日复习」+「重试」；打开时显示今日到期与已复习数。
- 所有新文案进 `core/strings.ts`；所有新图案两色；新动效只用已有意图。

## 4. 画廊

`?gallery&skin=<id>` 增加全部新插槽的样例（含空、加载中、出错、Anki 未打开、技能待审核、`/` 菜单展开、DayEditor 打开）。

## 验收（实际运行并贴输出）

- 全部命令通过：`npm run lint:skills && npm test`（根目录）；`apps/desktop` 下 typecheck、lint、test、build、smoke。
- 用 CDP 真实时间截图（不要用 virtual time）对比设计稿：五个工具窗、`/` 菜单、DayEditor 各一张，逐张说明与设计稿的差异（应只有真实数据不同）；五套配色仍各两色。
- 在**库副本 + 临时 XUEGEN_HOME** 下启动开发版 Electron，走一遍：加入阅读 → 读完；存为新卡 → 待同步 +1；双击 11 月 5 日写入 → 文件出现在副本 `wiki/calendar/2026-11-05.md`；切换风格 → 用户消息带标签、发出的文本带前缀；`/` 菜单能看到启用的技能、关闭某技能后新会话里消失。贴出副本中生成的文件内容。
- 截图不入库；不 git commit；中文逐项报告。
