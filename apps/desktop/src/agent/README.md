# agent — agent 进程（utilityProcess）

负责：用 Pi SDK 创建与 CLI 等价的 Xuegen 会话（隔离环境变量须在 import Pi 前设置；加载仓库 `skills/` 与存在时的 `~/.xuegen/skills/`；追加 `instructions.md`；只启用 MCP 与 tool-search，不加载 codemode；拒绝项目信任，等价 CLI `--no-approve`），把 Pi 事件转换成 `shared/` 定义的消息。

不负责：窗口、文件监听、界面状态。

模块：

- `environment.ts`：环境隔离与 `findRepoRoot()`（main 也 import 这一份，避免重复实现）。
- `session.ts`：`createXuegenSession()`、模型列举与查找、`skillPaths()`、`listCommands()`（排除 `disabledSkills`）。Pi 的**值**导入必须保持动态（`applyXuegenEnvironment()` 之后）；顶层 `import type` 会被擦除，不违反该约束。
- `event-mapper.ts`：纯函数 `mapPiEvent(state, event, nextId)`，把 Pi 事件映射为协议消息；工具调用归属到「最近一条助手消息」，因此 `message_end` 清空流式 id 后工具事件仍能定位。
- `history.ts`：纯函数 `historyFromMessages()`。
- `index.ts`：只剩进程通信与会话驱动；保存最新快照，收到 `init` 时完整重发；`list-commands` 返回 `/` 菜单条目。
- `smoke.ts`：集成冒烟，不发模型请求。
