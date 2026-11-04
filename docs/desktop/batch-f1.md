# F1：功能数据层（无界面）

先读：`docs/desktop/FEATURES.md`（本批的依据）、根目录 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`、`skills/course/SKILL.md`、`skills/reading/SKILL.md`、`skills/teach/SKILL.md`、`skills/wiki-save/SKILL.md`。只读参考用户库的规则：`<库根>/AGENTS.md`、`<库根>/wiki/prompts/wiki/flashcard-rules.md`（库根从 `~/.xuegen/wiki.json` 的 `root` 读；**只读，不得修改用户库**）。

原则：**确定性逻辑放在 skill 脚本里**（零依赖、`--json`、原子写入、临时目录测试），学根和桌面版都调用同一个脚本；桌面主进程只做「调用脚本 + 校验 + 转发」。

## 1. skill 脚本

### 1.1 `skills/course/course-state.mjs list <coursesDir> --json`
- 现在 `course-state.mjs` 与 `render-board.mjs` 各有一个 `parseCourse`，结果不一致。抽出共享模块 `skills/course/course-parse.mjs`（导出 `parseCourse`、`listCourses`），两者都改用它；`render-board.mjs` 输出不变（用现有测试或补快照测试保证）。
- `list --json` 输出数组，每项：`{slug, title, weekLabel, week:{done,total,tasks:[{label,done}]}, overall:{done,total}, lastRecord:{date,seq}|null, nextSession, styleHint:null}`。日期一律 `YYYY-MM-DD`。
- 测试：用真实库课程文件的**结构**构造样例（无 frontmatter、`<!-- xuegen:course-state -->` 开头、`## This Week` 复选框、`## Learning Record` 下 `### 2026-10-21-01`、`## 计划表` 表格），至少覆盖 3 种形态。

### 1.2 新 skill `skills/calendar/`（SKILL.md + `calendar.mjs` + 测试）
- `calendar.mjs month <vault> <YYYY-MM> --json` → `{month, days:{"YYYY-MM-DD":{records:[{course,heading}], plans:[{course,label}], readingDue:[{slug,title}], log:[string], note:string|null}}}`。来源：课程 `## Learning Record` 下的 `### YYYY-MM-DD-NN`；课程 `## 计划表` 表格中带日期的行（形如 `| D2 | 10-22 | … |`，年份取课程上下文/当年）；`wiki/reading/*.md` 的 `due`；`wiki/log.md` 的 `## [YYYY-MM-DD]`；`wiki/calendar/YYYY-MM-DD.md` 笔记正文。
- `calendar.mjs get <vault> <YYYY-MM-DD> --json`、`write <vault> <YYYY-MM-DD> --text <string>|--stdin`（原子写入 `wiki/calendar/YYYY-MM-DD.md`，正文为空则删除该文件；文件带 frontmatter `date:`）。
- SKILL.md：用户说「在周五安排…」「11 月 5 日记一下…」「这周有什么安排」时使用；只写 `wiki/calendar/`，其他来源只读。
- 测试在临时库，覆盖每种来源与空月份。

### 1.3 新脚本 `skills/wiki-save/flashcards.mjs`（+ 测试）
- `stats <vault> --json` → `{total, unsynced, decks:[{deck, total, unsynced, files}], pendingExtracts}`。卡片 = `wiki/flashcards/**.md` 中的 `START`…`END` 块；已同步 = 块内或紧随其后有 `<!--ID: 数字-->`；牌组取文件中最近的 `TARGET DECK` 下一行。`pendingExtracts` = `wiki/extracts/**` 中 frontmatter `cards: pending` 的数量。**不要**扫描 `AGENTS.md`、`wiki/prompts/` 里的示例块。
- `add <vault> --deck <deck> --front <text> --back <text> --json`：按 `flashcard-rules.md` 的 Basic 格式追加到该牌组所在目录下的 `inbox.md`（不存在则创建，首行 `TARGET DECK` + 牌组名）；原子写入；返回 `{file, deck}`。拒绝空正反面与含 `END` 单独成行的内容。
- 测试：临时库中构造已同步/未同步/多牌组/示例块干扰。

### 1.4 `skills/teach/SKILL.md` 增加「讲解风格」一节
- 三种风格：**大白话**（生活类比、少术语、先直觉后定义、一次一个点）、**细讲**（按小步拆分、每步检验、讲清每个术语）、**深度**（机制、边界、反例、可用公式）。与已有「学习深度 概览/理解/深入」的关系写清（风格管讲法，深度管范围）。
- 规则：用户消息以 `[风格：X]` 开头时按 X 讲，并延续到风格改变；不要复述这个标签。

## 2. 桌面主进程数据通道

- `shared/protocol.ts` 新增 `DATA_CHANNEL = "xuegen:data"`，请求/响应类型与运行时守卫：
  `courses.list`、`reading.today`、`reading.stats`、`reading.add{source,priority}`、`reading.review{slug,outcome,position?}`、`cards.stats`、`cards.add{deck,front,back}`、`anki.status`、`calendar.month{month}`、`calendar.write{date,text}`、`skills.list`、`skills.setEnabled{name,enabled}`、`skills.fetch{url}`。
- 主进程 `src/main/data/`：每个动作调用对应脚本（`execFile(process.execPath 或 node, [脚本, …, "--json"])`，`ELECTRON_RUN_AS_NODE=1`），库根从 `$XUEGEN_HOME/wiki.json` 读取；超时、非零退出、非法 JSON 都转成 `{ok:false, error}`，文案进 `core/strings.ts`。
- `anki.status`：只读 AnkiConnect（`http://127.0.0.1:8765`，`version`、`deckNames`、`getNumCardsReviewedToday`、每牌组 `findCards "deck:X is:due"` 计数），1.5 秒超时；连不上返回 `{running:false}`。**禁止调用任何写入类 action**（加测试：动作白名单）。
- 技能：`skills.list` 合并 `scripts/lint-skills.mjs --json` 与各 SKILL.md 的 frontmatter，输出 `{name, description, source:"builtin"|"personal"|"pending", enabled}`；`disabledSkills` 存 `desktop.json`。`skills.fetch` 用 `git clone --depth 1` 到 `~/.xuegen/skills-pending/<name>`（只允许 https 仓库地址，名称按 frontmatter 校验），状态为 pending，**不自动启用**；启用 pending 技能时移动到 `~/.xuegen/skills/<name>`。
- preload 与 `core/client.ts` 增加对应方法；组件不得直接用 `window.xuegen`。

## 3. agent

- 新消息 `list-commands` → `commands`：`[{name, description, source:"skill"}]`，来自 resource loader 的技能，排除 `disabledSkills`；`skills.setEnabled` 后 agent 重新加载技能（新会话生效即可，在说明中写明）。
- 技能路径：内置 `repo/skills` + `~/.xuegen/skills`（存在时）。`disabledSkills` 通过初始化参数传给 agent。
- 风格前缀由 renderer 的 core 在发送时加（`[风格：大白话] 原文`）；`desktop.json` 增加 `courseStyles: {slug: style}` 与 `sessionStyle`，守卫与默认值（默认「大白话」，因为用户只用过它）。

## 验收（实际运行并贴输出）

```sh
npm run lint:skills && npm test                       # 根目录：skill 脚本测试
cd apps/desktop && npm run typecheck && npm run lint && npm test && npm run build && npm run smoke
```

- 用**用户库的只读副本**跑一遍（`cp -R <库根> <临时目录>/vault`，在副本上执行，绝不写真实库）：贴出 `course-state.mjs list --json` 的课程数与第一门课、`flashcards.mjs stats --json`（total 应约 470、已同步约 192）、`calendar.mjs month <副本> 2026-10 --json` 的有内容日期列表、`reading-queue.mjs stats --json`。
- 在副本上执行一次 `flashcards.mjs add` 与 `calendar.mjs write`，贴出生成文件内容。
- 不 git commit；只在 xuegen 仓库内修改；中文逐项报告。
