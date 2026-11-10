# batch-control-refresh（DeepSeek 返修，约 10 分钟）：总控会话也收到「技能可能已更新，先重读」

11-10 4a 真机验收：总控会话**一个学习周期只有一个**（`settings.controlSessions[cycleId]`，要用 7 周）。`[课程页或技能可能已更新…]` 提醒（`strings.chat.refreshNote`）现在只发给课程会话（`renderer/core/board/session-freshness.ts` 的 `needsRefresh` 在没有 `activeCourse` 时直接 false）。结果：发版或技能改了之后，老总控会话凭旧技能做事（验收里它不用新工具 `course_plan`，直接改只读课程页、用 bash 刷看板，全被拦）。**先写测试再改。只改逻辑，不改任何外观。**

## 硬约束
- 只改 `src/renderer/core/board/session-freshness.ts`、`src/renderer/core/board/use-session-freshness.ts`、`src/renderer/App.tsx`（传一个参数）、`src/renderer/core/strings.ts`（加一条文案）及它们的测试。不改样式、组件结构。不 commit/push、不加依赖。

## 要做的
1. `strings.chat` 加 `controlRefreshNote: "[技能可能已更新：先重读要用的技能（course、cycle-plan 等），以文件为准]"`。`message-renderer.tsx` 里显示时剥掉 `refreshNote` 前缀的那段，**同样剥掉 `controlRefreshNote`**（用户看不到这串）。
2. `needsRefresh` 加参数 `isControl: boolean`：`isControl` 为真、`messageCount > 0`、且这个会话文件在本次 app 运行里还没「见过」（`seen[sessionFile] === undefined`）→ 真。课程会话逻辑不变。
3. `useSessionFreshness` 加参数 `isControl`：回答结束时，总控会话也记 `seen[file] = 0`（不用拉课程列表）；算 note 时 `isControl` 用 `controlRefreshNote`，课程会话用原来的 `refreshNote`。
4. `App.tsx`：在调 `useSessionFreshness` 之前算 `const openIsControl = isControlSession(settings, cycleId, openSessionFile)`（`use-control-session.ts` 已导出），传进去。`cycleId` 若在那一行之后才定义，把它的计算挪到前面（只挪位置，不改逻辑）。

## 测试
- `needsRefresh`：总控、本次运行没见过 → 真；见过 → 假；总控空会话（0 条消息）→ 假；课程会话原有用例不变。
- `use-session-freshness` 的 hook 测试（照现有 `use-session-freshness.test.tsx`）：总控会话第一条消息带 `controlRefreshNote`，回答结束后第二条不带。
- `message-renderer` 测试：带 `controlRefreshNote` 前缀的用户消息显示时不含这串。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/renderer 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
新增测试数、改了什么、验收输出。
