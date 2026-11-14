# batch-switch-carry（DeepSeek，约 15 分钟，先写测试）：确认「切换」时，排队没发出的话放进新会话的输入框

## 现象
回答进行中又打了一句（排在队里），然后点切换会话 → 弹框选「切换」。`use-switch-guard.ts` 的 `confirmSwitch` 调 `deps.stop()` 但丢掉返回值：排队那句被学根撤回，又没放回输入框，**丢了**。停止键（`composer.tsx` 的 `stopAndRestore`）会放回，切换不会。

## 用户定的行为（11-12）
确认「切换」后，**只把排队里撤回的话**放进切过去之后的输入框（放在已有草稿前面，换行隔开，光标停在放回的文字末尾），和停止键的放法一样。**不放回「刚发出、正在回答的那句」**（它的回答已存下一半）。没有排队的话时什么都不放。

## 要改（只改这几处）
1. `core/chat/useChat.ts` 的 `stop`（约 76 行）：把撤回逻辑拆出一个内部函数 `withdrawQueued(): string | null`（只处理 `queuedSentRef`，返回撤回的用户原话，多句用 `\n\n` 连接，没有则 null；有排队时同样清 `lastSentRef`）。`stop` 改为：发 abort → `const queued = withdrawQueued()` → 有排队（`queuedSentRef` 原本非空）就返回 `queued`，否则照旧返回 `lastSent`。**`stop` 对外行为不变**（现有测试不许改）。
2. 新增 `stopForSwitch(): string | null`：发 abort + `withdrawQueued()`，不返回 lastSent（但同样清掉 `lastSentRef`）。传给 `useSwitchGuard` 的 `stop` 换成它。
3. `core/chat/use-switch-guard.ts`：`confirmSwitch` 保存 `deps.stop()` 的返回值；在 `runPending` 真正执行切换**之后**把它放进新状态 `carriedDraft: string | null`（`useState`）。`SwitchGuard` 加 `carriedDraft` 与 `takeCarriedDraft(): void`（置回 null）。`cancelSwitch` 不动它。
4. `core/chat/chat-controller.ts` 与 `useChat.ts` 返回值加 `carriedDraft`、`takeCarriedDraft`。
5. `skins/contract.ts` 的 `ComposerProps` 加：
   ```ts
   /** Words a confirmed session switch withdrew from the old session's queue; the skin puts them into the field once, then calls onCarriedDraftTaken. */
   carriedDraft: string | null;
   onCarriedDraftTaken(): void;
   ```
   组装处（`grep -rn "onStop=" src/renderer --include=*.tsx | grep -v test`）把 controller 的两项传进去。
6. `skins/bear/composer.tsx`：`carriedDraft !== null` 时，用和 `stopAndRestore` 一样的放法（抽一个共用的 `restore(back: string)` 函数，`stopAndRestore` 也改用它），放完调 `onCarriedDraftTaken()`。用 `useEffect([carriedDraft])` 触发（项目 lint 规则：effect 里不同步 setState 自己的 state 时，照 `shell.tsx` 「Adjusted during render」的写法处理；lint 拦住就改写法，不放宽规则）。bare、chicago 的 composer 只接这两个 props 保证能编译，可以不实现。

## 测试（先写，先跑确认失败）
- `useChat.switch-guard.test.tsx`：回答中 `send("排队那句")` → `guardSwitch(run)` → `confirmSwitch` → 推一个 `streaming:false` 的 state → `run` 已执行、`carriedDraft === "排队那句"`；`takeCarriedDraft()` 后为 null。
- 同文件：没有排队、只有正在回答的那句 → 确认切换后 `carriedDraft === null`。
- 现有 `stop` 相关测试全部不改、照旧通过。
- `skins/bear/composer.test.tsx`：`carriedDraft="排队那句"`、原有草稿「草稿」→ 输入框为「排队那句\n草稿」，`onCarriedDraftTaken` 被调用一次。

## 不许做
- 不改 `agent/` 下任何文件；不改开课锁；不加依赖；不 commit / push；不跑 prettier 整文件；**自己做完，不要调用别的 agent**。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files" && npm run -s build 2>&1 | tail -1
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | grep -E "^# (pass|fail)|lint-wording"
```

## 结束报告（中文）
改了哪些文件；先失败的测试名与失败输出；验收输出最后几行；偏离之处。
