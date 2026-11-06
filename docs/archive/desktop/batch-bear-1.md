# 批次 BE-1：Bear 皮肤骨架（Shell、对话、输入区、小插槽）

## 先做这件事（上下文被压缩后也要重做）
重读本文件、`.windsurf/rules/xuegen-guard.md`、`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。**Bear 的唯一设计依据是 `docs/desktop/skins/bear.md`**，每个颜色、字号、行为都按它做；文档没写的，照 Chicago 的现有行为做（读 `apps/desktop/src/renderer/skins/chicago/` 对应文件），并在报告里列出来。

## 本批硬约束
1. 新代码只放在 `apps/desktop/src/renderer/skins/bear/`，外加 `skins/registry.ts` 一条登记。**不改 core、shared、main、agent、chicago、bare**；需要改它们时停下，写进报告。
2. 不 import 其他皮肤（eslint 已禁止）；需要 Chicago 的字体文件就**复制**到 `skins/bear/assets/`。
3. 文案只用 `core/strings.ts` 里已有的；缺文案时在报告里列出需要的键，不要写死中文。
4. 动画库（`motion`、`@animate-ui/react`、`radix-ui`）只在 bear 目录里用。只做 bear.md 第 5 节列出的微交互，不加入场动画、滚动特效、逐字效果。
5. 不放宽 eslint、不加 `eslint-disable` / `@ts-ignore`；不 commit；不启动 Electron；不读写 `~/.xuegen`。

## 范围
**本批做：**
- `bear/index.ts`：导出 `bearSkin: SkinModule`，懒加载 `bear/skin.css`，`bodyScaleSteps: [0.875, 1, 1.125, 1.25, 1.5]`，`motion`，`content`，`slots`。
- `registry.ts` 登记：`{ id: "bear", name: "Bear", version: "0.1", description: "iA Writer / Bear：只有一栏正文，侧栏收进抽屉", load }`。
- `bear/skin.css`：bear.md 第 2、3 节的 token 和正文排版，全部写在 `[data-skin="bear"]` 下；正文字号由 `data-body-scale` 决定（基准 16px），字体由 `data-body-font` 决定（`pixel` 按 `hei`）；`@font-face` 只声明 `Fusion12Diagram`。
- 插槽：`Shell`（标题栏 + 上下文 Popover + 「⋯」菜单 + 右侧抽屉 + 抽屉里的 `ToolDock` 标签 + 通知）、`Thread`、`UserMessage`、`AssistantMessage`、`Thinking`、`ToolActivity`、`Exercise`、`CourseIntroCard`、`Composer`、`SlashMenu`、`ModelPicker`、`Notice`、`BoardPanel`、`NotesPanel`。
- `bear/content.tsx`：`ContentRenderers.Node`，覆盖 core 解析出的全部节点类型（看 `core/content/` 与 chicago 的 `content.tsx` 支持哪些：正文、表格、代码、字符图、mermaid、公式、callout 等），按 bear.md 第 3 节排版。
- `bear/motion.ts`：bear.md 第 5 节的 `MotionPreset`，用 `motion` 的 `animate()`，返回可取消的 handle；写 `motion.test.ts`。

**本批不做（下一批 BE-2）**：`TodayPanel`、`ProgressPanel`、`ReadingPanel`、`CardsPanel`、`CalendarPanel`、`SkillsPanel`、`DayEditor` 的正式样式。本批给它们写**最小可用版**：语义 HTML，把 props 里的数据如实显示出来，按钮能调用对应回调，套 bear 的基础字体颜色即可。每个文件顶部注释写明「BE-2 完善」。

## 完成标准（逐条可核对）
1. 契约测试 `skins/contract.test.tsx` 对 `bear` 全部通过（它会遍历 registry）。
2. `?gallery&skin=bear` 能渲染画廊（看 `gallery/` 的用法，确保 Bear 的插槽都能显示）。
3. Shell：`activeTool` 不为空时抽屉打开并选中对应标签；切换标签调用 `onOpenTool`；`focusMode` 时标题栏只剩「⋯」；上下文 Popover 显示 `contextUsage.detail` 并能调用 `onCompact`；「⋯」菜单里的每一项都调用对应的 props 回调（新会话、继续会话、模型、思考强度、正文字体、正文字号、皮肤、专注模式）。
4. Thread：`intro` 与 `systemNotes` 按 `beforeIndex` 插入；用 core 的 `useFollowBottom`、`useScrollMemory`、`thinkingFor`。
5. Composer：Enter 发送、Shift+Enter 换行；流式时按钮变「停止」调用 `onStop`；`/` 弹出 SlashMenu 且键盘上下选择、Enter 执行（行为照 chicago 的 composer，并参考 `chicago/composer.test.tsx` 给 bear 写 `composer.test.tsx`）。
6. 字符图用 `Fusion12Diagram`，字号只会是 12px 或 24px。
7. 新增测试：`motion.test.ts`、`composer.test.tsx`、Shell 抽屉/菜单的交互测试 `shell.test.tsx`。

## 验收命令（必须自己跑并贴最后几行）
`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。

## 结束报告
改了/新增了哪些文件；完成标准 1–7 逐条说明怎么满足的；偏离 bear.md 的地方及原因；缺的文案键；遇到「走不通」的地方写清卡在哪、试过什么。

## 执行记录（2026-11-05）
Devin（swe-2-high）一次完成，自报全绿。Claude 审查后修正：`hast-react.ts` 两个皮肤各有一份相同副本 → 移到 `core/content/hast-react.ts` 共用；`IntersectionObserver` 兜底从皮肤正式代码移到 `src/test/setup.ts`；新增文案 `topBar.coursesAndPlans`（课程与计划）；真实 Electron 里发现正文列按 12px 算 em 只有 410px（改为按正文字号，612px）、抽屉在 portal 里拿不到按钮重置、启动时抽屉自动打开（改为启动关闭、之后 activeTool 变化才打开，并改了两条测试）、「回到最新」压在正文上、浏览器默认焦点框。
