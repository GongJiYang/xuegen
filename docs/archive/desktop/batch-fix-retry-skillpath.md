# batch-fix-retry-skillpath（DeepSeek 返修）：断线自动重试的提示 + 技能路径不跟安装位置走

用户 11-09 遇到：收课时模型连接被中转断开（错误原文 `terminated`），界面显示「模型出错了。」；Pi 自动重试成功后报错仍留着，看起来像失败。另外换版后，旧会话里的学根照着历史里的旧安装路径（`/private/tmp/xg-pack/old/学根.app/...skills/...`）去读技能，读不到才改路径，耽误了收课。原因 Claude 已查明，照下面改。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`apps/desktop/src/agent/README.md`。
- 跨进程消息先改 `shared/` 类型 → 发送端 → 接收端，接收端运行时校验；决策逻辑是纯函数并有测试；文案只放 `core/strings.ts`。
- 不读写真实 `~/.xuegen/`（测试用临时目录）、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`/`@ts-ignore`。`App.tsx` 不加行。

## 一、断线与自动重试

原因：`agent/event-mapper.ts` 不处理 Pi 的 `auto_retry_start` / `auto_retry_end` 事件（见 `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.d.ts`：`{type:"auto_retry_start", attempt, maxAttempts, delayMs, errorMessage}`、`{type:"auto_retry_end", success, attempt, finalError?}`）；`renderer/core/chat/model-error.ts` 的 `isNetwork` 不认 `terminated`。

改法：
1. `model-error.ts`：`isNetwork` 的正则加 `terminated|premature close|other side closed|ECONNABORTED|EPIPE`。`MODEL_ERROR_SUMMARIES.network` 改为「连接中途断开了。」。
2. 协议（`shared/protocol.ts` 的 `ChatMessage`）加可选字段 `retry?: { attempt: number; maxAttempts: number } | "recovered"`：
   - `event-mapper.ts`：`auto_retry_start` → 给**最近一条带 `errorMessage` 的助手消息**设 `retry = { attempt, maxAttempts }`；`auto_retry_end` 且 `success` → 设 `retry = "recovered"`；`success` 为 false 时去掉 `retry`（照常显示报错）。照现有事件的写法发更新。
   - `agent/history.ts` 的 `historyFromMessages`（还原旧会话）：一条带 `errorMessage`（且不是用户停止 `aborted`）的助手消息，**后面在下一条用户消息之前还有正常的助手消息**，就标 `retry = "recovered"`。
3. 显示（`model-error.ts` 加纯函数，或在现有选择报错文案的地方）：
   - `retry` 是对象：显示一行「连接中途断开，正在自动重试（第 N / M 次）…」（`strings.chat.retrying(n, m)`），不显示「重试」按钮。
   - `retry === "recovered"`：只显示一行淡色「连接断开过一次，已自动重试」（`strings.chat.retried`），不显示报错块与「重试」按钮。
   - 其余照旧。三个皮肤都要能显示（bear 用现有的弱化文字样式类，bare/chicago 纯文字）。
4. 测试：`model-error` 认 `terminated`；`event-mapper` 两个重试事件；`history` 的 recovered 判断（后面有正常回答 → recovered；后面直接是用户消息 → 不标；`aborted` 不标）；皮肤渲染两种状态。

## 二、技能路径不跟安装位置走

原因：`agent/session.ts` 的 `skillsDir = join(repoRoot, "skills")`、`instructionsPath = join(repoRoot, "instructions.md")`，打包后 `repoRoot` 是 `.app/Contents/Resources/xuegen`，路径随安装位置与版本变化；Pi 把技能位置写进系统提示，旧会话的历史里留着旧路径。

改法：
1. `agent/environment.ts` 加 `export function stableRoot(home: string, root: string = repoRoot): string`：确保 `<home>/app` 是指向 `root` 的符号链接（不存在就建；是指向别处的链接就原子替换：先建 `<home>/app.tmp-<pid>` 再 `rename`；是普通目录或文件就**不动**、直接返回 `root`），返回 `<home>/app`。失败（权限等）时返回 `root`，不抛错。
2. `agent/session.ts`：`skillPaths(home)` 与 `readInstructions` 用 `join(stableRoot(home), "skills")` / `"instructions.md"`；`skillsDir` 常量保留给 `smoke.ts` 等只读用途，或一并改成函数——以不破坏现有调用为准，改动在报告里列出。
3. `main/` 里给数据请求跑脚本的路径（`runScript`）不用改（不经模型）。
4. 测试：`stableRoot` 在临时目录里：新建链接、链接指向旧位置时替换、`<home>/app` 是普通目录时不动并返回 root、不可写时返回 root。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文）

逐条对应一、二：改了什么、测试清单、验收输出、偏离与原因、未完成项。
