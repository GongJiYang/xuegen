# batch-stage2-session-id（Devin 写基础代码）：消息协议带会话编号

路线 `docs/platform/ROUTE-1109.md` 阶段 2 第 1 项：「所有跨进程消息都带上 sessionId，为多进程铺路」。本批只做最小的一层：agent 发出的每条消息标明来自哪个会话；renderer 发给 agent 的「作用于当前会话」的三条请求标明目标会话，对不上就丢弃并报错。**不做界面**，renderer 收到消息后**暂不按 sessionId 过滤**（等阶段 4 多进程时再用）。

## 硬约束（压缩后也要记得）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`apps/desktop/src/agent/README.md`、`apps/desktop/src/shared/protocol.ts`。
- 只改下面列出的文件；不改 `renderer/skins/**`、`agent/guard/**`、`skills/**`、`main/data/**`（另一个审核在改后两个）。
- 不读写真实 `~/.xuegen/`、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`/`@ts-ignore`。不写新测试（DeepSeek 补），**现有测试必须全部通过**（改动造成的旧断言不符，按新形状更新断言，在报告里列出）。
- Pi 会话的编号是 `session.sessionId`（`agent/session.ts` 第 177 行附近已在用）。

## 1. `apps/desktop/src/shared/protocol.ts`

1.1 `SessionStatePayload` 在 `sessionFile` 后面加一个字段：
```ts
  /** Pi's id for the active session; null before the first session is ready. */
  sessionId: string | null;
```

1.2 `HostToAgentMessage` 里这三项各加一个可选字段 `sessionId?: string`（其余项不变）：
```ts
  | { type: "prompt"; text: string; sessionId?: string }
  | { type: "abort"; sessionId?: string }
  | { type: "compact"; sessionId?: string }
```
并在它们上方加一行注释：`/** `sessionId`, when given, must name the active session; a stale one is dropped with an error (see agent/index.ts). */`

1.3 `isHostToAgentMessage`：`abort`、`compact` 从「直接 `return true`」那组里移出来，与 `prompt` 一起校验 `value.sessionId === undefined || typeof value.sessionId === "string"`（`prompt` 还要保留 `typeof value.text === "string"`）。

1.4 把 `AgentToHostMessage` 的整个联合类型改名为 `AgentToHostEvent`（内容不变），然后新增：
```ts
/**
 * What actually crosses the agent → host boundary: an event plus the id of the
 * session it came from (null before a session exists, and for messages the main
 * process originates itself, such as `update-status` / `agent-status`).
 * Routing by it waits for the multi-process stage; today it is recorded only.
 */
export type AgentToHostMessage = AgentToHostEvent & { sessionId?: string | null };
```
其它文件里对 `AgentToHostMessage` 的引用保持不变（它仍是联合，可以照常按 `type` 收窄）。若 TypeScript 在某处收窄失败，在那一处改用 `AgentToHostEvent`，并在报告里列出。

## 2. `apps/desktop/src/agent/index.ts`

2.1 模块级 `post(message: AgentToHostMessage)` 保留（`start` 失败等无会话的地方用）。在 `AgentHost` 类里加：
```ts
  /** Post an event stamped with the session it belongs to. */
  private post(message: AgentToHostEvent): void {
    post({ ...message, sessionId: this.session?.sessionId ?? null });
  }
```
并把类里所有 `post(` 调用改成 `this.post(`（共约 24 处；类外的保持 `post(`）。import 加 `AgentToHostEvent`。

2.2 `snapshot()` 在 `sessionFile` 后加 `sessionId: session?.sessionId ?? null,`。

2.3 `handle()` 开头（`switch` 之前）加：
```ts
    if (
      (message.type === "prompt" || message.type === "abort" || message.type === "compact") &&
      message.sessionId !== undefined &&
      message.sessionId !== (this.session?.sessionId ?? null)
    ) {
      this.post({ type: "error", error: "这条请求属于另一个会话（可能刚切换过），已忽略；请在当前会话里重新操作。" });
      return;
    }
```

## 3. `apps/desktop/src/main/index.ts`

main 自己发给 renderer 的 `update-status`、`agent-status` 不用带 `sessionId`（字段可选）。只需确认转发 agent 消息时**原样转发**、不丢字段；若有按字段重建对象的地方，改成整体转发。不要加别的逻辑。

## 4. `apps/desktop/src/renderer/core/chat/useChat.ts`

4.1 第 178、187、237 行的 `prompt`、第 191 行的 `abort`、第 196 行的 `compact`：都带上 `sessionId: state.session?.sessionId ?? undefined`（读法按文件里现有的 state 结构取「当前会话状态里的 sessionId」；若当前会话状态存在别的名字下，用那个，报告里说明）。注意 `useCallback` 依赖数组随之更新，或改用 ref（照文件里 `styleRef` 的做法）避免回调频繁重建——**优先用 ref**。

4.2 收到的消息不做任何过滤，reducer 不改。

## 5. 文档

`apps/desktop/src/agent/README.md` 加一段「会话编号」：agent 发出的消息都带 `sessionId`；`prompt`/`abort`/`compact` 可带目标 `sessionId`，对不上即丢弃并回 `error`；renderer 暂不按它过滤，留给阶段 4 多进程路由。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && git diff --stat -- apps/desktop/src/shared/protocol.ts apps/desktop/src/agent/index.ts apps/desktop/src/main/index.ts apps/desktop/src/renderer/core/chat/useChat.ts apps/desktop/src/agent/README.md
```

## 结束报告（中文）

每节是否照做；偏离之处及原因；更新了哪些旧测试断言；未完成项。
