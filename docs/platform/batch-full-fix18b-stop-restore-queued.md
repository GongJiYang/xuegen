# batch-full-fix18b-stop-restore-queued（DeepSeek 返修，约 15 分钟，TDD）：停止时把排队的消息放回输入框（renderer 侧）

## 用户 11-11 定
停止 = 停下 + 清排队；排队的消息从对话里撤掉（fix18a 已做：agent 清队列并发 `messages-removed`），**放回输入框**。

## 现状
`apps/desktop/src/renderer/core/chat/useChat.ts`：`send` 把用户原话记进 `lastSentRef`（只记最后一条），`stop()` 发 `abort` 并返回 `lastSentRef`。
`renderer/skins/bear/composer.tsx` 的 `stopAndRestore()`：拿到返回值后，**输入框里已有字就不放回**。
问题：回答中发了 B、C 两条排队时，stop 只还 C；B 会丢。输入框里正好有字时，排队的话整个丢掉（现在对话里也撤了，用户找不回）。

## 改法（先写失败测试，再改）
只改 `renderer/core/chat/useChat.ts`、`renderer/core/chat/useChat.test.tsx`、`renderer/skins/bear/composer.tsx`、`renderer/skins/bear/composer.test.tsx`、`renderer/skins/contract.ts`（只改 `onStop` 的注释）。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

1. 先写测试，确认失败：
   - `useChat.test.tsx`（在「useChat stop hands back the prompt just sent」那组里，用现有 `setUp`/`sessionState`）：
     a. 先 `emit(sessionState(true))`（正在回答），`send("B")`、`send("C")` → `stop()` 返回 `"B\n\nC"`；再 `stop()` 返回 null。
     b. 正在回答时 `send("B")`，然后 `emit` 一个 `queuedFollowUps: 0` 的 state（B 已被 Pi 取走、开始回答，streaming 仍 true）→ `stop()` 返回 `"B"`（退回老规则：还最后发的那条）。
     c. 不在回答时 `send("A")` → `stop()` 返回 `"A"`（老行为不变）。
     d. 正在回答时用 `sendCommand("/skill:x")` 排队 → `stop()` 不还命令（返回 null）。
     `sessionState` 需要能传 `queuedFollowUps`，给它加一个可选参数，不改老调用。
   - `composer.test.tsx`：输入框里已有「新写的」，点停止、`onStop` 返回「B」→ 输入框变成 `"B\n新写的"`；输入框空时 → `"B"`（老行为）。
   跑一次贴失败输出。
2. `useChat.ts`：
   - 加 `queuedSentRef = useRef<(string | null)[]>([])`，注释：回答中发出、还在 Pi 队列里的消息（用户原话；命令和带标记的动作记 null，只占位不还）。
   - `send`：发之前若 `streamingRef.current` 为真，`queuedSentRef.current.push(<原话或 null，同 lastSentRef 的规则>)`。`sendCommand`：回答中也 push `null`。
   - 订阅里收到 `state`/`ready` 时：`const n = event.state.queuedFollowUps;` 若 `queuedSentRef.current.length > n`，从**前面**删到只剩 n 条（Pi 按顺序取走）；`streaming` 变 false 时清空。
   - `stop()`：先取 `const queued = queuedSentRef.current.filter((t): t is string => t !== null)`；清空 `queuedSentRef`。若 `queuedSentRef` 原来非空：`lastSentRef.current = null`，返回 `queued.length ? queued.join("\n\n") : null`。否则走老逻辑返回 `lastSentRef`。
3. `composer.tsx` 的 `stopAndRestore()`：有字时不再放弃，改成 `setValue(\`${back}\n${value}\`)`（光标放到 back 末尾）；`onInput` 同步传新值。改注释：排队的话已从对话撤掉，丢了就找不回，所以有字时放在前面。
4. `contract.ts` 里 `onStop` 注释改成：返回排队中被撤掉的话（多条用空行连起来），没有排队时返回刚发的那条；皮肤把它放回输入框（已有字时放在前面）。
5. 现有测试全部照旧通过（老用例里若有断言「有字时不放回」，改成新行为并在报告里说明）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx vitest run src/renderer/core/chat/useChat.test.tsx src/renderer/skins/bear/composer.test.tsx 2>&1 | tail -4 && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests|Test Files"
```
## 结束报告（中文）：第 1 步失败输出、改动、验收输出。
