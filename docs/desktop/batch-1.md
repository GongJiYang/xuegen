# 桌面版 · 第 1 批：能对话

## 目标

在 `apps/desktop/` 新建 Xuegen 桌面版骨架：Electron 窗口里和 Xuegen agent 流式对话，Markdown 表格、KaTeX 公式、Mermaid 图正确渲染。CLI（`bin/xuegen.mjs`）保持不变，可照常使用。

## 硬约束

- 不改动 `bin/`、`skills/`、`instructions.md`、`defaults/`、根目录 `package.json` 的现有行为。桌面版是独立 npm 项目：`apps/desktop/package.json`，自己的 lock 文件。
- 运行时只用 Pi SDK `@earendil-works/pi-coding-agent@1.2.0`（与根目录版本一致，精确锁定），不 fork、不改源码。先读 `node_modules/@earendil-works/pi-coding-agent/docs/sdk.md` 和 `examples/sdk/`（尤其 `04-skills.ts`、`12-full-control.ts`、`13-session-runtime.ts`、`14-codemode-mcp.ts`）再写代码，API 以导出的类型声明为准，不要凭记忆猜。
- 与 CLI 共享同一个个人目录：`XUEGEN_HOME`（默认 `~/.xuegen`），因此复用已有登录凭据、设置和会话。复刻 `bin/xuegen.mjs` 里的隔离设置：`PI_CODING_AGENT_DIR`、`XUEGEN_HOME`、`AI_AGENT=xuegen`，且必须在 import Pi 之前设置环境变量（Pi 在模块加载时捕获路径）。
- 会话配置等价于 CLI：不自动发现扩展/技能/提示模板/主题/上下文文件；只加载仓库 `skills/` 目录；把 `instructions.md` 追加进系统提示；启用 MCP 与 tool-search 扩展（SDK 默认不加载，按 sdk.md 手动加入 `extensionFactories` 并调用 `session.bindExtensions()`）。路径从仓库根目录解析（`apps/desktop` 的上两级），不要复制 skills。
- 工作目录（cwd）：默认 `~/learning`（不存在则创建），后续批次再做选择界面。

## 技术栈

- electron-vite + Electron + React 18 + TypeScript（strict）。
- 进程划分：
  - **agent 进程**：用 Electron `utilityProcess` 跑 Pi 会话（崩溃不拖垮窗口）。
  - **主进程**：管窗口、转发消息、agent 进程退出时可重启。
  - **preload**：`contextBridge` 暴露最小类型化 API；`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- 渲染：`streamdown`（流式 Markdown，含 GFM 表格、KaTeX、Mermaid、代码高亮）。若 streamdown 无法满足，退回 `react-markdown + remark-gfm + remark-math + rehype-katex + mermaid`，并在报告里说明原因。
- 样式：Tailwind + shadcn/ui（只引入用到的组件）。跟随系统亮/暗色。

## 功能范围（只做这些）

1. 输入框发送消息；Enter 发送，Shift+Enter 换行；运行中可「停止」（`abort`）。运行中再发消息时作为 follow-up 排队。
2. 流式显示助手文本（`message_update` 的 `text_delta`）；`message_end` 后以完整消息为准。
3. 工具调用显示为可折叠卡片：工具名、参数摘要、成功/失败。
4. 每条助手消息有「复制 Markdown」按钮，复制原始 Markdown。
5. 顶栏：模型下拉框（列出已配置凭据可用的模型，切换当前会话模型）；「新会话」按钮；「继续最近会话」（启动时默认继续当前 cwd 的最近会话，等价 `xuegen -c`）。
6. 未登录/无可用模型时，显示明确提示：「请先在终端运行 xuegen 并执行 /login」。本批不做登录界面。
7. 错误（模型报错、agent 进程崩溃）在界面上显示，不静默吞掉。

## 代码组织（为扩展留余地）

```
apps/desktop/
  src/main/        主进程：窗口、utilityProcess 管理、IPC 转发
  src/agent/       agent 进程：Pi 会话创建（xuegen 配置）、事件 → 消息协议
  src/shared/      主进程/agent/渲染共享的 IPC 消息类型（单一定义）
  src/preload/
  src/renderer/    React 界面
    components/chat/
    components/markdown/   渲染器注册表：代码块语言 → 渲染组件
```

渲染器注册表：`mermaid`、`math` 等代码块语言映射到组件，新增类型只需注册一项（后续批次会加 `markmap`、`vega-lite`）。

不做：课程看板、笔记面板、登录界面、打包安装包、自动更新。

## 验收（全部要实际运行并贴出输出）

1. `cd apps/desktop && npm ci && npm run typecheck && npm run build` 全部通过。
2. 新增 `npm run smoke`：用无窗口的 Node 脚本直接调用 `src/agent` 的会话创建函数，确认 skills 加载了 `teach/course/course-board/wiki-save/article`、系统提示包含 instructions.md 的首行，并打印可用模型数量。不发送模型请求。
3. 根目录 `node bin/xuegen.mjs --version` 仍正常输出。
4. `git status` 中除 `apps/desktop/` 外无改动（本文档除外）。
5. 最后用中文报告：做了什么、偏离规格之处及原因、未完成项。不要自行 git commit。
