# batch-switch-guard（Devin，约 1 小时，先写测试）：回答进行中切换会话要先问、再正常停止

## 现象（用户 11-12 报）
在一个会话里学根还在回答时切到另一个会话（侧栏「开课 / 回到这节课」、会话列表、总控入口），切回来后那条回答停在半句。

## 根因（Claude 读代码得出，有一处待核对）
- `apps/desktop/src/agent/index.ts` 的 `restart()`（切换会话走它）第一步是 `this.unsubscribe?.(); this.session?.dispose();`，没有先停止正在进行的回答。
- 渲染端 `core/chat/useChat.ts` 的 `openSession` 先 `clear-messages`，再等新会话的 `history`；渲染端不截历史，学根发 `history` 也不截条数。
- **待核对（先做这一步，写进报告）**：Pi 的 `AgentSession.dispose()`（`node_modules/@mariozechner/pi-coding-agent/dist/core/` 下）在回答进行中被调用时，已流出的那部分 assistant 消息会不会写进会话文件。核对结果决定第 3 步是否必要。

## 用户定的行为（A 方案，11-12）
回答进行中点任何「切换会话」的入口时，先弹确认：
- 文案：「学根还在回答，切走会中断这次回答。」按钮「切换」「等它说完」。
- 选「等它说完」：什么都不做。
- 选「切换」：先和按停止键一样正常停止（`controller.stop()` 那条路：abort，已说出的部分保存），**等学根回报不再 streaming 之后**再切过去。
- 不在回答中：照旧直接切换，不弹。

## 要改
1. **渲染端拦截点**：找出所有切换会话的调用（`controller.openSession`、`controller.newSession`、`controller.continueSession` 的全部调用处，`grep -rn "openSession(\|newSession(\|continueSession(" apps/desktop/src/renderer | grep -v test`，附结果）。在 `core/chat/useChat.ts` 加一个统一的 `guardSwitch(run: () => void): void`：`streaming` 为假直接 `run()`；为真则把 `run` 存起来、置 `pendingSwitch` 状态，由界面弹确认。各调用处改成经 `guardSwitch`。
2. **停止后再切**：确认「切换」时调用 `stop()`，等下一个 `state` 事件 `streaming === false`（或 2 秒超时后照样切）再执行存起来的 `run`。停止被 `stop()` 放回输入框的原话照旧处理。
3. **学根端兜底**（核对结果是「dispose 会丢已流出部分」时才做）：`agent/index.ts` 的 `restart()` 在 `dispose()` 前，若会话正在回答，先 `await session.abort()`（用 Pi 现有的中止接口，和 abort 消息走同一处），再 dispose。
4. **契约与界面最小接线**（Claude 之后写 Bear 弹框样式，本单只做能用的最小版）：`ChatController` 加 `pendingSwitch: boolean`、`confirmSwitch(): void`、`cancelSwitch(): void`；`skins/contract.ts` 的 `ShellProps` 加同名三项；三套皮肤的 Shell 在 `pendingSwitch` 为真时渲染一个最小确认条（文案进 `strings.ts` 新开 `strings.switchGuard`：`text`、`confirm`「切换」、`cancel`「等它说完」），bear 只要求能用、不要求视觉。

## 测试（先写，先跑确认失败）
- `useChat`：不在回答时 `guardSwitch` 立即执行；在回答时不执行、`pendingSwitch` 为真；`cancelSwitch` 后不执行、`pendingSwitch` 为假；`confirmSwitch` 后发出 abort，收到 `streaming:false` 的 `state` 后才执行；2 秒没回报也执行。
- 各调用处：在回答中点开课 / 回到这节课，不直接调用 `openSession`。
- 第 3 步若做：`restart()` 在回答中先 abort 再 dispose（用假会话断言调用顺序）。

## 不许做
- 不加依赖；不 commit / push；不放宽 eslint；**自己做完，不要调用别的 agent**。
- 不改开课锁（`use-course-sessions.ts` 里的 `opening` ref，11-12 刚修）的行为。
- 文案只进 `strings.ts`；`npm test` 末尾 `lint-wording` 0 处。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files" && npm run -s build 2>&1 | tail -1
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -1
```

## 结束报告（中文）
dispose 核对结论（附源码行）；切换调用处 grep 结果与逐处改法；先失败的测试；验收输出；偏离之处。
