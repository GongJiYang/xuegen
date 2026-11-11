# batch-full-fix18a-stop-clear-queue（DeepSeek 返修，约 15 分钟，TDD）：停止时清掉排队消息（agent 侧 + 协议 + reducer）

## 用户 11-11 定
停止 = 停下 + 清排队；排队那条从对话里撤掉、放回输入框（放回输入框是 fix18b，不在本单）。

## 现象与根因（FULL-TEST-1110 C3）
回答中发 A → 再发 B（排队）→ 停止 → 发 C：会话里顺序成了 C、答 C、B、答 B。
Pi `abort()` 不清跟进队列；`apps/desktop/src/agent/turn.ts` 的 `runPromptTurn` 在交给 Pi 之前就把 B 画进了对话（`message-start`/`message-end` + `appendUserMessage`）。
Pi 有 `session.clearQueue(): { steering: string[]; followUp: string[] }`（`node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.d.ts` 634 行），会清空队列并发 `queue_update`。

## 改法（先写失败测试，再改）
只改下面这些文件：`apps/desktop/src/agent/turn.ts`、`agent/turn.test.ts`、`agent/index.ts`、`shared/protocol.ts`、`renderer/core/chat/chat-reducer.ts`、`renderer/core/chat/chat-reducer.test.ts`。不 commit/push、不加依赖，不改任何 skins/ 下文件。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

1. 先写测试，确认失败：
   - `turn.test.ts`：harness 的 session 加 `clearQueue: vi.fn(() => ({ steering: [], followUp: [] }))`，deps 加 `removeLastUserMessages: vi.fn((count) => …)`（返回被删的 id 数组）。新用例：
     a. 队列里有 1 条（clearQueue 返回 `followUp: ["B"]`）→ `clearQueue` 在 `abort` **之前**调用（用 `mock.invocationCallOrder` 比）；`removeLastUserMessages` 以 1 调用；posted 里有 `{ type: "messages-removed", ids: [<返回的 id>] }`。
     b. 队列空 → 不调 `removeLastUserMessages`，不发 `messages-removed`；`abort` 照调。
     c. steering 1 条 + followUp 1 条 → `removeLastUserMessages(2)`。
   - `chat-reducer.test.ts`：state 有消息 u1、a1、u2，收到 `messages-removed` `ids: ["u2"]` → 只剩 u1、a1；其余字段不变。未知 id → 不报错、消息不变。
   跑一次贴失败输出。
2. `shared/protocol.ts` 的 `AgentToHostEvent` 加：
   `/** 停止时清掉的排队用户消息：从对话里撤掉（fix18，用户 11-11 定）。 */ | { type: "messages-removed"; ids: string[] }`。
3. `turn.ts`：`TurnSession` 加 `clearQueue(): { steering: string[]; followUp: string[] };`；`TurnDeps` 加 `/** 从转写缓存删掉最后 count 条用户消息，返回它们的 id。 */ removeLastUserMessages(count: number): string[];`。`case "abort"` 改为：先 `clearQueue()`，n = 两数组长度和；n > 0 时 `const ids = deps.removeLastUserMessages(n); if (ids.length) deps.post({ type: "messages-removed", ids });`；再 `await session.abort()`；最后 `deps.emitState()`。注释写清：排队消息在交给 Pi 前已画进对话，且它们一定是最后 n 条用户消息（之后发的也会排队）。文件头注释里「three requests」相关描述如有需要顺手补一句。
4. `index.ts` 的 `turnDeps()`（约 146 行 `appendUserMessage` 旁边）实现 `removeLastUserMessages`：从 `this.history.messages` 末尾往前找 role 为 `"user"` 的消息，取最后 count 条，从 `this.history` 删掉，返回它们的 id（按原顺序）。
5. `chat-reducer.ts` 的 `reduceAgentEvent` 加 `case "messages-removed": return { ...state, messages: state.messages.filter((m) => !event.ids.includes(m.id)) };`。如果别的地方对 `AgentToHostEvent` 做了穷尽 switch 而 typecheck 报错，只在那里加一个什么都不做的分支并告诉我是哪里。
6. 现有测试全部照旧通过（`turn.test.ts` 现有 harness 加了字段后老用例不能改断言）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx vitest run src/agent/turn.test.ts src/renderer/core/chat/chat-reducer.test.ts 2>&1 | tail -4 && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests|Test Files"
```
## 结束报告（中文）：第 1 步失败输出、改动、验收输出。
