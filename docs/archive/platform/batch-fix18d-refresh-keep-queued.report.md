# batch-fix18d-refresh-keep-queued 报告

## 1. 先写的失败测试

新增用例（`apps/desktop/src/agent/event-mapper.test.ts` 的「queue and state」、`history.test.ts` 的 `withQueued` 块）跑一次：

```
$ npx vitest run src/agent/event-mapper.test.ts src/agent/history.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/agent/event-mapper.test.ts > mapPiEvent queue and state > remembers the queued texts, steering first, so a transcript rebuild can add them back
AssertionError: expected undefined to deeply equal [ '甲改', '乙' ]
 FAIL  src/agent/event-mapper.test.ts > mapPiEvent queue and state > drops the remembered texts when the queue empties
AssertionError: expected undefined to deeply equal []
 FAIL  src/agent/history.test.ts > withQueued > appends a message for a prompt that is still queued in Pi
TypeError: withQueued is not a function
 FAIL  src/agent/history.test.ts > withQueued > returns the transcript unchanged when nothing is queued
TypeError: withQueued is not a function
 FAIL  src/agent/history.test.ts > withQueued > appends two queued prompts in order
TypeError: withQueued is not a function
      Tests  5 failed | 34 passed (39)
```

## 2. 改了什么

- `src/agent/event-mapper.ts`
  - `EventMapperState` 新增 `queuedTexts: string[]`（注释：还在 Pi 队列里的原话，steering 在前，刷新后重建转写时补回去），`createEventMapperState()` 初始化为 `[]`。
  - `case "queue_update"` 里除 `queuedFollowUps` 外同时设 `queuedTexts: [...event.steering, ...event.followUp]`；队列清空时自然变回 `[]`。
- `src/agent/history.ts`
  - 新导出 `withQueued(history, queued, nextId)`：队列为空时原样返回同一个对象；否则按 steering→followUp 顺序在 `messages` 末尾追加 `{ role: "user", markdown, streaming: false, toolCalls: [] }`，id 由 `nextId("user")` 生成，`notes` 与已有消息不变。注释里写明原因（排队的话还没进 Pi 会话记录，不补回就会让停止时「撤掉最后 n 条用户消息」撤错，fix18d）。
- `src/agent/index.ts`
  - `refreshHistory()` 里改成 `withQueued(historyFromEntries(...), this.mapperState.queuedTexts, this.nextId)`。只改这一处；`openSession`/`restart` 那次重建（新会话、队列必空）不动。
- 测试：`event-mapper.test.ts` 加 2 条（steering 在前；两数组都空 → `[]`），`history.test.ts` 加 3 条（追加一条并校验 id/字段、原消息与 notes 不变；空队列原样返回；两条按顺序追加）。
- 老用例没有改断言：mapper state 全量相等比较没有出现（现有用例只断言单个字段），所以没有出现「补 `queuedTexts: []`」这种改动。

## 3. 验收输出

```
$ npx vitest run src/agent/event-mapper.test.ts src/agent/history.test.ts src/agent/turn.test.ts 2>&1 | tail -4
 Test Files  3 passed (3)
      Tests  57 passed (57)
   Start at  19:05:01
   Duration  1.03s (transform 142ms, setup 385ms, collect 155ms, tests 18ms, environment 1.67s, prepare 201ms)

$ npm run -s typecheck && npm run -s lint
（无输出，通过）

$ npx vitest run 2>&1 | grep -E "Tests|Test Files"
 Test Files  148 passed (148)
      Tests  1408 passed | 1 skipped (1409)
```

## 4. 未做 / 需要注意

- 没提交、没推送，没加依赖，没改 renderer 和 `skins/`，没启动 Electron，没碰 `~/.xuegen`。
- 一处行为边界（未改，属范围外）：刷新后补回的排队消息只在 `history`/UI 里存在，Pi 队列仍是真相源；如果排队消息在刷新之后才被 Pi 消费，`queue_update` 会把它移出 `queuedTexts`，下一次刷新就不会再补（此时它已进会话记录）。
