# batch-fix18d-refresh-keep-queued（DeepSeek 返修，约 15 分钟，TDD）：刷新窗口后停止，不再撤掉正在回答的那条

## 现象（FULL-TEST-1110 fix18 小尾巴 ①）
回答甲时发乙（排队）→ 刷新窗口（⌘R）→ 停止：画面上被撤掉的是**甲**（正在回答的那条），乙还在队列外漂着。

## 根因
- 窗口刷新时 renderer 发 `init`，`apps/desktop/src/agent/index.ts` 的 `refreshHistory()` 用 `historyFromEntries(session.sessionManager.getBranch(), …)` 从 Pi 会话记录重建 `this.history`。
- 乙还在 Pi 的队列里，没进会话记录 → 重建后的 `this.history` 里**没有乙**。
- 停止时 `turn.ts` 的 `case "abort"`：`clearQueue()` 清掉 1 条 → `removeLastUserMessages(1)` 从 `this.history` 末尾找最后 1 条用户消息 → 找到的是甲，发 `messages-removed [甲]`。

## 改法（先写失败测试，再改）
只改：`apps/desktop/src/agent/event-mapper.ts`、`agent/event-mapper.test.ts`、`agent/history.ts`、`agent/history.test.ts`、`agent/index.ts`。不 commit / push、不加依赖、不改 renderer 和 skins/ 下任何文件。
**自己做完，不要调用 `pi`、`devin` 或任何别的 agent。不读写 `~/.xuegen/`，不碰真实 Obsidian 库，不启动 Electron。**

1. 先写测试，跑一次贴失败输出：
   - `event-mapper.test.ts`：`queue_update` 事件 `{ steering: ["甲改"], followUp: ["乙"] }` 之后，mapper state 的新字段 `queuedTexts` 等于 `["甲改", "乙"]`（steering 在前），`queuedFollowUps` 仍是 2；再来一个两数组都空的 `queue_update` → `queuedTexts` 为 `[]`。
   - `history.test.ts`：新纯函数 `withQueued(history, queued, nextId)`：
     a. history 末尾是用户甲 + 助手回答，`queued = ["乙"]` → 返回的 messages 末尾多一条 `{ role: "user", markdown: "乙", streaming: false, toolCalls: [] }`，id 用 `nextId("user")` 生成；原来的消息和 `notes` 不变。
     b. `queued = []` → 原样返回（同一个对象也可以）。
     c. 两条排队 `["乙", "丙"]` → 按顺序追加两条。
2. `event-mapper.ts`：`EventMapperState` 加 `/** 还在 Pi 队列里的原话（steering 在前），刷新后重建转写时补回去。 */ queuedTexts: string[];`，初始 `[]`；`case "queue_update"` 里同时设 `queuedTexts: [...event.steering, ...event.followUp]`。
3. `history.ts`：导出 `withQueued(history: HistoryReplay, queued: readonly string[], nextId: (prefix: string) => string): HistoryReplay`。注释写一句：排队的话还没进 Pi 会话记录，重建转写时不补回，停止时「撤掉最后 n 条用户消息」就会撤错（fix18d）。
4. `index.ts` 的 `refreshHistory()`：重建后 `this.history = withQueued(this.history, this.mapperState.queuedTexts, this.nextId)`。只改这一处；约 73 行 `openSession` 里那次重建是新开会话，队列必然为空，不用改。
5. 现有测试全部照旧通过，老用例不改断言（如果某个老用例对 mapper state 做了整对象相等比较、因多了 `queuedTexts` 失败，只在期望值里补 `queuedTexts: []`，并在报告里列出）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx vitest run src/agent/event-mapper.test.ts src/agent/history.test.ts src/agent/turn.test.ts 2>&1 | tail -4 && npm run -s typecheck && npm run -s lint && npx vitest run 2>&1 | grep -E "Tests|Test Files"
```

## 结束报告（中文，写到 `docs/platform/batch-fix18d-refresh-keep-queued.report.md`）：第 1 步失败输出、改了什么、验收输出。
