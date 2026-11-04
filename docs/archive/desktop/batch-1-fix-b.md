# 第 1 批修复 B：界面（shadcn 风格、公式、动效）

前置：修复 A 已通过验收。先读 `apps/desktop/AGENTS.md`，尤其第 12 节（shadcn/ui）和第 13 节（GSAP）；写动效前先读 `~/.commandcode/skills/` 下的 `gsap-react`、`gsap-core`、`gsap-performance`。只改 `src/renderer/` 与相关配置。

## 任务

1. **迁移到 Tailwind v4 + shadcn/ui**：用 `npx shadcn@latest init` 初始化（基色 neutral、CSS 变量），提交 `components.json`；删除 Tailwind v3 的 `tailwind.config.ts`/旧 PostCSS 配置（按 v4 官方方式接入 Vite）。`cn()` 放 `src/renderer/lib/utils.ts`。
2. **用 shadcn 组件重做现有界面**（不改功能）：
   - 顶栏：模型选择用 `Select`，新会话/继续会话用 `Button` + `Tooltip`。
   - 工具调用卡片：`Collapsible` + `Badge`（running/success/error）。
   - 错误与未登录提示：`Alert`。
   - 消息列表：`ScrollArea`；输入框：`Textarea` + `Button`（发送/停止切换）。
   - 整体布局预留三栏：`Resizable`（左看板、右笔记两栏本批放占位空状态，带 lucide 图标与一句说明）。
   - 界面文案集中到 `src/renderer/strings.ts`。
3. **只保留一套 Markdown 渲染**：保留 `streamdown`，删除重复的 `react-markdown`（及只为它引入的依赖）。
4. **修复 KaTeX 不渲染**：`$$E=mc^2$$` 和 `$…$` 当前显示为纯文本。查 streamdown 当前版本文档，正确启用数学插件并引入 KaTeX 样式；` ```math ` 代码块继续走注册表。给出修复前后对比说明。
5. **Mermaid 跟随主题**：亮/暗色切换时重新渲染；渲染失败显示原始代码 + `Alert`，不白屏。
6. **GSAP 动效**（安装 `gsap` 与 `@gsap/react`，精确版本）：
   - 新消息块出现：淡入 + 轻微上移（opacity、y，0.2s，`power2.out`）。
   - 工具卡片展开/收起：高度用 shadcn Collapsible 自带过渡，GSAP 只做内容淡入。
   - 用 `gsap.matchMedia()` 尊重 `prefers-reduced-motion`。
   - 流式文字不做逐字动画。动画写在 `use<Name>Animation` hook 中。
7. **亮/暗色**跟随系统，两种主题下截图检查可读性。

## 验收

- 修复 A 的全部命令仍通过（typecheck、lint、test、build、smoke）。
- `npm run dev` 启动后，用一条包含表格、行内公式、块公式、mermaid 图、代码块的测试消息验证渲染（可在开发模式下用一个仅开发环境可见的「渲染示例」入口，不发模型请求）。截图保存到 `docs/desktop/screenshots/`（亮色、暗色各一张）。
- 报告逐项说明处理结果。不要 git commit。
