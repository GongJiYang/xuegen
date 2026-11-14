# batch-no-resend-2（DeepSeek，约 15 分钟，先写测试）：「不重发」在真窗口里没生效——改成读刚到的历史，不读还没渲染的状态

## 现象（Claude 11-13 真窗口复现，batch-no-resend 之后）
测试窗口：总控点「核实 →」（离散）→ 学根答完 → 会话列表回总控 → 再点「核实 →」。会话文件 `/tmp/xg-e2e/home/sessions/--tmp-xg-e2e-workspace--/2026-11-13T13-37-30-…jsonl` 里核实请求仍有**两条**用户消息（13:37:30、13:38:39）。单测 33 条全过，但测不到这个。

## 根因（Claude 已核对）
- 学根端 `apps/desktop/src/agent/index.ts`：`open-session` 先在 `restart()` 里 `post({ type: "history", … })`，**之后**才 `post({ type: "session-opened", requestId })`。
- 渲染端 `useChat.ts`：`history` 只 `dispatch` 进 reducer（React 下一次渲染才生效）；`session-opened` 立刻 resolve `openSession` 的 promise。
- `use-course-sessions.ts` 的 `.then` 里读 `messagesRef.current`——它在 effect 里才更新，此刻还是切换前清空后的旧值，`alreadyAsked` 永远 false。单测的假 controller 是同步给 `messages` 的，所以没抓到。

## 要改
1. `apps/desktop/src/renderer/core/chat/useChat.ts`：加 `const openedHistoryRef = useRef<ChatMessage[]>([]);`；在 `client.subscribe` 回调里（和 `streamingRef` 同处，**同步**）`if (event.type === "history") openedHistoryRef.current = event.messages;`。返回值加 `openedHistory: () => openedHistoryRef.current`（`useCallback` 包一下，放进 useMemo 依赖）。
2. `apps/desktop/src/renderer/core/chat/chat-controller.ts`：接口加 `/** The transcript the last \`history\` event carried — read synchronously right after openSession resolves (React state lags behind). */ openedHistory(): ChatMessage[];`。所有实现 / 假 controller 补上（typecheck 报到哪补到哪，测试里的假 controller 默认 `() => []`）。
3. `apps/desktop/src/renderer/core/board/use-course-sessions.ts`：`.then` 里把 `alreadyAsked(messagesRef.current, text)` 换成 `alreadyAsked(controller.openedHistory(), text)`；删掉不再用的 `messagesRef` 及其更新。`activeCourse === slug` 分支（用 `controller.messages`）不动。

## 测试（先写，先跑确认失败）
- `useChat` 测试（照 `useChat.switch-guard.test.tsx` 的假 client）：推一个 `history` 事件后**不等渲染**、同一个同步代码块里调 `result.current.openedHistory()`（或在推 `session-opened` 的同一 tick 里读）→ 等于刚推的 messages。
- `use-course-sessions.test.tsx`：新用例模拟真实时序——假 controller 的 `messages` 一直是 `[]`（不更新），`openedHistory()` 返回含同样 verify 标记的用户消息 → 再点核实：`openSession` 被调用、`send` **没有**被调用。改实现前这条应失败（贴输出）。
- 把上一单里依赖 `messages` 同步更新的那两条用例改成通过 `openedHistory` 提供历史（行为断言不变）。

## 不许做
- 不改 `agent/` 下文件；不改开课锁；不加依赖；不 commit / push；不跑 prettier 整文件；**自己做完，不要调用别的 agent**。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
改了哪些文件；先失败的测试名与失败输出；验收输出最后几行；偏离之处。
