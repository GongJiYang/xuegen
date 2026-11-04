# 第 1 批修复 A：核心正确性与结构

审查对象：cmd 第 1 批产出（`apps/desktop/src/{agent,main,preload,shared}`）。先读根目录 `AGENTS.md` 与 `apps/desktop/AGENTS.md`，本批所有改动必须符合其中规范。只改本文件列出的问题；界面样式、shadcn、GSAP、KaTeX 留给修复 B，本批不碰 `src/renderer/components/`（`useChat.ts` 的 reducer 抽取除外）。

## 必修 bug

1. **工具卡片永远不显示**（`src/agent/index.ts`）。Pi 的事件顺序是：助手 `message_end`（内容含工具调用）→ `tool_execution_start/end` → 下一条 `message_start`。当前代码在 `message_end` 时清空了 `currentAssistantId` 和 `toolCalls`，所以工具事件到达时找不到所属消息、直接丢弃。改为把工具调用归属到「最近一条助手消息」，并用 `node_modules/@earendil-works/pi-coding-agent/docs/json.md` 中的事件序列写单元测试证明卡片能收到 running → success/error。
2. **启动时丢失 ready/history**。主进程在创建窗口之前就启动 agent，agent 的 `ready`、`history` 可能在渲染进程订阅前发出而丢失；`init` 目前只回 `state`。改为：agent 保存最新快照（state、模型列表、历史），收到 `init` 时完整重发；渲染进程挂载后发送 `init`。
3. **会话配置与 CLI 不等价**（`src/agent/session.ts`）。CLI 只加载 `builtin:mcp` 和 `builtin:tool-search`，没有 codemode。删除 `createCodemodeExtension` 和 `defaultTools: ["+codemode", "+tool_search"]` 覆盖；tool-search 的激活交给 MCP 扩展（与 CLI 行为一致，依据 `docs/sdk.md` 的 codemode/MCP 段落）。另外 CLI 带 `--no-approve`（忽略需要信任的项目本地文件），查 `docs/security.md` 与 SDK 类型，找到 SDK 中的等价配置并应用；找不到就在报告中说明。
4. **重启状态用错消息类型**（`src/main/index.ts`）。「正在重启」用 `fatal` 发送，且 `restartCount` 永不归零、正常退出（code 0）也报 fatal。在协议中新增 `agent-status`（`starting | ready | restarting | crashed | stopped`），agent 成功 `ready` 后重置计数。

## 结构与规范

5. **抽出纯函数事件映射**。`src/agent/index.ts` 362 行，超过 300 行上限，且映射逻辑与副作用混在类里无法测试。拆为：
   - `src/agent/event-mapper.ts`：纯函数 `mapPiEvent(state, event) → { state, messages }`，不读时间与全局（ID 生成器作为参数传入）。
   - `src/agent/history.ts`：`historyFromMessages` 等纯函数。
   - `src/agent/index.ts`：只剩进程通信与会话驱动。
6. **去掉手写的鸭子类型与强转**。删除 `AgentSessionLike`、`as unknown as`、`as never`；在 `src/agent/` 内直接使用 Pi 导出的 `AgentSession`、`AgentSessionEvent` 等类型（只做 type import 不影响「先设环境变量再加载 Pi」的约束，需在注释中说明）。
7. **IPC 通道名与守卫集中到 `shared/`**。`"xuegen"` 在 main 与 preload 各写一遍；改为 `shared/` 导出常量。主进程收到渲染进程消息时用 `isHostToAgentMessage()` 类型守卫校验，非法消息丢弃并记录。协议的 `switch` 加 `assertNever` 穷尽检查。
8. **仓库根目录查找重复**。main 与 `agent/environment.ts` 各有一份 `findRepoRoot`；保留一份（main 可以 import agent 侧的 Node 模块，依赖方向允许），main 计算后通过环境变量传给 agent，不再修改自身 `process.env`。
9. **`AvailableModel` 与协议 `ModelInfo` 重复**：统一用 `shared/` 的 `ModelInfo`。
10. **对话状态 reducer**：把 `src/renderer/components/chat/useChat.ts` 中的状态更新抽成纯函数 `chat-reducer.ts`（同目录），`useChat` 用 `useReducer` 调用它。

## 工程配置

11. 依赖版本全部改为精确版本（去掉 `^`），重新生成 lock 文件。删除未使用的依赖。
12. 新增 `.gitignore`：`node_modules/`、`out/`、`*.tsbuildinfo`。删除已生成的 `*.tsbuildinfo`。
13. 加入 ESLint（typescript-eslint，含 `no-explicit-any`、`consistent-type-imports`、React hooks 规则）+ Prettier，新增 `npm run lint`、`npm run format`。
14. 加入 Vitest，新增 `npm test`。至少覆盖：`event-mapper`（含工具事件顺序、错误/中止、follow-up 排队）、`history`、`chat-reducer`、IPC 类型守卫、渲染器注册表。

## 验收（全部实际运行并贴输出）

```sh
cd apps/desktop
npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run smoke
node ../../bin/xuegen.mjs --version
git -C ../.. status --short
```

- `smoke` 额外断言：扩展列表中没有 codemode。
- 报告中列出每一项（1–14）的处理结果与对应文件。不要 git commit。
