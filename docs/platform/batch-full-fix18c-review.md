# batch-full-fix18c-review（DeepSeek 审核，约 10 分钟）：审 fix18a + fix18b（停止清排队、放回输入框）

## 背景
用户 11-11 定：停止 = 停下 + 清排队；排队消息从对话里撤掉、放回输入框（已有字时放在前面）。
任务单：`docs/platform/batch-full-fix18a-stop-clear-queue.md`、`batch-full-fix18b-stop-restore-queued.md`。18b 的实现由 Claude 写（中转 503）。

## 要审的改动（`git diff` 看）
`apps/desktop/src/agent/turn.ts`、`agent/index.ts`（`removeLastUserMessages`）、`shared/protocol.ts`（`messages-removed`）、`renderer/core/chat/chat-reducer.ts`、`renderer/core/chat/useChat.ts`（`queuedSentRef`）、`renderer/skins/bear/composer.tsx`（`stopAndRestore`）、`renderer/skins/contract.ts`（`onStop` 注释）及对应测试。

## 做法
- **只读代码、可以加测试；不改实现文件。** 发现问题就写一条会失败的测试证明它，报告里列出，不要修。不 commit/push。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
重点看：
1. agent 的 `removeLastUserMessages(n)` 删掉的是否一定是排队的那几条（Pi 队列里 n 条 ↔ 转写缓存最后 n 条用户消息）；有没有情况会删到正在回答的那条 A。
2. renderer 的 `queuedSentRef` 与 Pi 的 `queuedFollowUps` 会不会对不上（例：state 事件先于/晚于 send 到达；Pi 取走一条时 streaming 是否会短暂变 false；切会话 / 新会话 / 打开会话时没清空）。
3. 停止后马上再发 C：C 是否正常发出、不再被当作排队；`lastSentRef` 是否正确。
4. 排队的是带标记的动作（开课等）或命令：不放回输入框，但对话里也撤掉了——对不对，有没有漏。
5. 输入框已有字时拼接 `B\n草稿`、光标位置。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests|Test Files"
```
## 结束报告（中文）：每个重点的结论（没问题 / 有问题 + 失败测试名 + 复现）；验收输出。
