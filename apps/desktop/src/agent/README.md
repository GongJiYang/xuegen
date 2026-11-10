# agent — agent 进程（utilityProcess）

负责：用 Pi SDK 创建与 CLI 等价的 Xuegen 会话（隔离环境变量须在 import Pi 前设置；加载仓库 `skills/` 与存在时的 `~/.xuegen/skills/`；追加 `instructions.md`；只启用 MCP 与 tool-search，不加载 codemode；拒绝项目信任，等价 CLI `--no-approve`），把 Pi 事件转换成 `shared/` 定义的消息。

不负责：窗口、文件监听、界面状态。

模块：

- `environment.ts`：环境隔离与 `findRepoRoot()`（main 也 import 这一份，避免重复实现）；`stableRoot(home)` 把 `<home>/app` 指到当前安装根，让 Pi 写进系统提示的技能路径不随版本/安装位置变化。
- `session.ts`：`createXuegenSession()`、模型列举与查找、`skillPaths()`、`readInstructions(home)`、`listCommands()`（排除 `disabledSkills`）。Pi 的**值**导入必须保持动态（`applyXuegenEnvironment()` 之后）；顶层 `import type` 会被擦除，不违反该约束。
- `event-mapper.ts`：纯函数 `mapPiEvent(state, event, nextId)`，把 Pi 事件映射为协议消息；工具调用归属到「最近一条助手消息」，因此 `message_end` 清空流式 id 后工具事件仍能定位；`auto_retry_start` / `auto_retry_end` 给失败的那条消息打 `retry` 标记（重试中／已恢复）。
- `history.ts`：纯函数 `historyFromEntries()` / `historyFromMessages()`；还原旧会话时，失败消息后面紧跟一条正常回答就标 `retry = "recovered"`。
- `index.ts`：只剩进程通信与会话驱动；保存最新快照，收到 `init` 时完整重发；`list-commands` 返回 `/` 菜单条目；`ready`/`state` 带当前会话 `role`（总控 / 课程 / 自由）与 `sessionId`。
- `snapshot.ts`：纯函数 `sessionState()`，Pi 会话（可为 null）+ 外壳状态 → `SessionStatePayload`，不依赖 SDK 即可测。
- `session-request.ts`：`withSessionId()`（给每条发出的消息盖章）与 `isStaleRequest()`（判断请求是否属于当前会话）。
- `turn.ts`：`prompt` / `compact` / `abort` 三条会话内请求的执行与错误上报；先做陈旧校验，不通过就回 `error`、不碰会话。
- `guard/`：工具层权限拦截（路线阶段 2，见 `guard/README.md`）。`session.ts` 把它注册为第一个 extension；角色由 `new-session`/`open-session` 消息带来，缺省或恢复的会话从转录文件开头的开课标记与 `desktop.json` 映射推断，推不出按 `free`。
- `tools/`：专用工具。`course-close-tool.ts` 的 `course_close`（阶段 3c）在 agent 进程里用 `ELECTRON_RUN_AS_NODE=1` 子进程调 `skills/course/course-close.mjs`，不经 bash；谁可用、收哪门课由 guard 判（`guard/README.md`「专用工具」）。以后 `calendar_write`、`cycle_write` 照同一模式加（阶段 4a）。
- `smoke.ts`：集成冒烟，不发模型请求。

会话编号（`sessionId`）：agent 发出的每条消息都带它（`SessionStatePayload` 里也有），main 原样转发给 renderer。`prompt` / `abort` / `compact` 三条「作用于当前会话」的请求可带目标 `sessionId`，与 agent 当前会话对不上即在 `turn.ts` 里丢弃并回 `error`（不碰会话），防止切换会话间隙的旧请求落到新会话上；不带编号照常执行。renderer 在收到 `ready` / `state` 时立即更新自己记的编号（不只靠 effect），所以切换会话后的第一条请求带的是新编号；收到的消息暂不按 `sessionId` 过滤，路由留给路线阶段 4 的多进程。
