# batch-no-resend（DeepSeek，约 15 分钟，先写测试）：回到当天已开过的课程会话时，不再重发同一个请求

## 现象（用户 11-13 报，真实会话为证）
总控「今天」点「核实 →」做离散周核实，之后回到总控再点，核实请求被**重发**进同一个会话：真实会话文件 `2026-11-13T06-07-58…discrete-math-epp` 里同一条 `⟦xuegen:verify|discrete-math-epp…⟧` 用户消息出现 4 次（06:07、06:21、06:26、12:33），学根每次都从头再核实一遍。「开课 →」同理（`open` / `resume` 标记）。

## 根因（Claude 已核对）
`apps/desktop/src/renderer/core/board/use-course-sessions.ts` 的 `startSession`（约 130–190 行）：当天记住的会话不算过期（`stale === false`），于是 `openSession(known, …)` 打开**同一个**会话文件，`.then` 里无条件 `deliver(text)`。没有任何一步检查「这个会话里已经发过这个请求」。

## 要改（只改 `use-course-sessions.ts`）
1. 加一个 ref 跟着 `controller.messages`：照现有 `messagesLength`（约 116、126 行）的写法，再加 `const messagesRef = useRef(controller.messages);`，在同一个 effect 里 `messagesRef.current = controller.messages;`。
2. 新增纯函数（同文件顶部，导出以便测试）：
   ```ts
   /** True when `history` already holds a user message carrying the same action marker (kind + slug) as `text`. */
   export function alreadyAsked(history: ChatMessage[], text: string): boolean
   ```
   用 `splitActionMarker`（`../chat/action-marker.js`）：`text` 没有标记（`action === null`）→ 返回 false；否则在 `history` 里找 `role === "user"` 且 `splitActionMarker(m.markdown)` 的 `action` 与 `slug` 都相同的消息。
3. `startSession` 的 `.then((opened) => …)` 里，在 `deliver(text)` 之前：若 `known !== null`（打开的是记住的旧会话，不是新开的）且 `alreadyAsked(messagesRef.current, text)` → **不 deliver**，只切过去（其余照旧：释放锁、更新 settings、放卡片）。
4. 同函数 `activeCourse === slug && !freshNow` 分支（约 145 行，已经在这门课的会话里又点了一次）：`alreadyAsked(controller.messages, text)` 为真时也不 `deliver`。

## 测试（先写，先跑确认失败）
在 `use-course-sessions.test.tsx`（照现有用例的假 controller 写法）：
- `alreadyAsked`：同 kind 同 slug → true；同 kind 不同 slug → false；不同 kind（`open` vs `verify`）→ false；`text` 无标记 → false；只有 assistant 消息带同样文字 → false。
- 记住的当天会话里已有一条 verify 消息 → 再调 `startSession(slug, verifyMessage)`：`openSession` 照常被调用（切过去），`send` **没有**被调用。
- 记住的当天会话里没有 verify 消息 → `send` 被调用一次（原行为不变）。
- 已在这门课的会话里（`activeCourse === slug`）、历史里已有同样的 `open` 消息 → 再点开课不 `send`。
- 11-12 的开课锁四条测试（A–D）照旧通过、不改。

## 不许做
- 只改 `use-course-sessions.ts` 和它的测试；不改 `opening` 锁的行为；不加依赖；不 commit / push；不跑 prettier 整文件；**自己做完，不要调用别的 agent**。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
改了哪些文件；先失败的测试名与失败输出；验收输出最后几行；偏离之处。
