# batch-stage2-session-id-review（DeepSeek）：审核 + 补测试（消息协议带会话编号）

Devin 按 `docs/platform/batch-stage2-session-id.md` 写完（未提交），报告见 `/Users/gjy/pi-learning/devin-stage2-session-id.log`。A 审核（问题直接修）、B 补测试。不做界面。

## 硬约束

- 先读 `apps/desktop/AGENTS.md`、规格 `docs/platform/batch-stage2-session-id.md`、`apps/desktop/src/agent/README.md`。
- 只改：`shared/protocol.ts` 及测试、`agent/index.ts`（及新建的同名测试，若可测）、`renderer/core/chat/useChat.ts` 及测试、`chat-reducer` 测试。别碰 `skills/**`、`main/data/**`（另一个审核在改）、`agent/guard/**`、`renderer/skins/**`。
- 不读写真实 `~/.xuegen/`、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。

## A. 审核

1. agent 发出的**每一条**消息都带 `sessionId`（类内没有漏网的模块级 `post(`；会话切换后旧会话的事件不会以新编号发出——核对 `restart` 时先退订旧会话再换 `this.session`，顺序反了就修）。
2. `handle()` 的丢弃校验只作用于 `prompt`/`abort`/`compact`；`sessionId` 不带时照常执行；`session` 为 null 时带了编号的请求被丢弃且回中文 `error`。
3. renderer 的 `sessionIdRef` 在 `ready` 与 `state` 后都会更新；切换会话（`open-session`）后第一条 `prompt` 带的是新编号（如果存在「切换完成但 ref 还没更新」的窗口导致正常发送被误丢，修掉——例如在 `session-opened`/`state` 处理里同步写 ref，而不只靠 effect）。
4. `isHostToAgentMessage`：`sessionId` 为数字、null、对象时拒绝。

## B. 补测试

1. `shared/protocol.test.ts`：三种请求带/不带合法 `sessionId` 通过；非法类型拒绝。
2. agent 侧：若 `AgentHost` 可在测试里构造（看现有 `agent/*.test.ts` 怎么 mock Pi），测「编号对不上 → 回 error 且不调用 `session.prompt`/`abort`/`compact`」「对得上 → 照常」「不带 → 照常」「每条 post 都带 sessionId」；不可构造就把校验抽成纯函数 `isStaleRequest(message, activeId)` 放 `agent/index.ts` 旁的小模块并测它，在报告里说明。
3. `useChat.test.tsx`：收到 `ready`（sessionId=A）后 `send` 带 A；收到新 `state`（sessionId=B）后立即 `send` 带 B；`stop`、`compact`、重试同理。

## 验收命令（贴出最后几行）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run smoke 2>&1 | tail -3
```

## 结束报告（中文）

A 每条结论；改了哪些文件；新增测试数；未完成项。
