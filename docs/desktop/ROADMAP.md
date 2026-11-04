# 桌面版路线图

每一批都能独立运行、独立验收。每批开工前在本目录写 `batch-N.md` 任务说明，验收通过后再进入下一批。

| 批次 | 名称 | 交付 | 验收要点 | 状态 |
|---|---|---|---|---|
| 1 | 能对话 | Electron 骨架、agent 进程、流式对话、表格/公式/Mermaid 渲染、模型选择、继续会话 | typecheck + build 通过；smoke 确认 skills 与系统提示加载；CLI 不受影响 | 任务说明已写（`docs/archive/desktop/batch-1.md`），未开工 |
| UI-0 | 皮肤架构 | core / 皮肤契约 / 登记表 / bare 参照皮肤 / 切换与持久化 / 画廊 / 契约测试；移除 Tailwind、shadcn、旧动效 | 见 `docs/archive/desktop/batch-ui-0.md` | 未开始 |
| UI-1 | Chicago 皮肤 | 经典 Mac OS 黑白像素风（system.css），设计见 `skins/chicago.md` | 见 `docs/archive/desktop/batch-ui-1.md` | 未开始 |
| 2 | 常驻看板 | 左侧课程看板：当前周、本周活动、总目标、下次起点；文件变化实时刷新；显示 `verify` 结果 | 与 `wiki/courses.html` 显示一致；看板无编辑入口；锁状态异常时明确提示 | 未开始 |
| 3 | 笔记面板 | 右侧 CodeMirror 笔记，实时预览；打开/新建 `notes/` 文件；与 agent 写入冲突时提示 | 保存后 Obsidian 打开格式不变；冲突不静默覆盖 | 未开始 |
| 2A | 卡片总览 | 左侧「学习看板」卡片标签页：按主题/牌组列出 `wiki/flashcards/`，每文件已同步（有 `<!--ID-->`）/未同步数量，卡片预览，在 Obsidian 中打开 | 计数与文件实际一致；只读 | 未开始 |
| 2B | Anki 状态 | 经 AnkiConnect 只读显示：Anki 是否运行、各牌组今日到期/新卡/已复习、近 7 天复习曲线；未运行时明确提示 | 与 Anki 内显示一致；不写 Anki | 未开始 |
| 2D | 制卡审核 | AI 起草的卡片逐张展示，标出疑似违反最小信息原则处，逐张通过/修改/删除后才写文件 | 未确认不写文件 | 未开始 |
| 3.5 | 阅读队列面板 | 与课程看板并列：今天到期的阅读材料、优先级、上次位置、待制卡摘录数；数据只读 `wiki/reading/`、`wiki/extracts/` | 与 `reading-queue.mjs today/stats --json` 结果一致；面板无编辑入口 | 未开始（依赖 reading 技能任务 1） |
| 4 | 更多可视化 | 注册 `markmap`、`vega-lite`；图表可导出 PNG | 新类型只增加注册项 | 未开始 |
| 5 | 体验完善 | 工作目录切换、会话列表、桌面内登录、快捷键 | 按需拆分 | 未开始 |

## 已定决策

- **Anki 同步由 Obsidian 的 obsidian-to-anki 插件负责**（2026-11-03）。桌面版对卡片文件与 Anki 都只读：只展示「N 张待同步」并提示在 Obsidian 中运行同步命令，不调用 AnkiConnect 的写入接口，不写 `<!--ID-->`。卡片内容以 `wiki/flashcards/` 的 Markdown 为准，复习排程以 Anki（FSRS）为准。

## 执行方式

- 代码由 Command Code（`cmd`）+ DeepSeek Flash 按 `batch-N.md` 编写，遵守根目录 `AGENTS.md` 与 `apps/desktop/AGENTS.md`；Claude 负责写任务说明、审查核心代码、验收与汇报。
- 审查不通过的问题整理成 `batch-N-fix.md` 再派发，修完重新验收，直到符合规范。
- 模型渠道：Command Code 官方（需有效登录）、Systalyze BYOK（`STLZ_API_KEY`）、或 DeepSeek 官方 API（尚未接入）。余额或额度不足时暂停并告知用户。
