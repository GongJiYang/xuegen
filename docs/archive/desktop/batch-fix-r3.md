# batch-fix-r3（DeepSeek 返修）：总控闪出更早对话 + 开课失败后重进不再开课

用户 2026-11-09 真实上课时报的两个问题。原因 Claude 已查清，照下面改。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`。
- 决策逻辑是纯函数并有测试；hook 的 effect 里不同步 setState；不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。
- 工作区里有书房批次未提交的改动（`skills/reading/bookshelf*`、`shared/data-protocol.ts`、`main/data/handler.ts` 等），不要动它们。

## R3 切回窗口 / 每次回答结束时，总控闪出「更早的对话」

原因：`core/board/use-reload-on-answer.ts` 的 `useReloadOnFocusAndDay`（切回窗口、过零点）和 `useReloadOnAnswer`（回答结束）调用各资源的 `reload()`；`core/board/use-resource.ts` 的 `reload` 先 `setState({ status: "loading" })`。`cycle.today` 变成 loading 的那一刻，App 里 `cycleId` 变成 null → `control.isControl` 为 false → `useControlFold` 不折叠 → 更早的对话闪出来，今日卡也消失一下。

改法（「有旧值就继续显示旧值，后台刷新」）：`use-resource.ts` 的 `reload` 改成
```ts
  const load = useCallback(() => {
    // Keep showing a value we already have; only an empty or failed resource shows loading.
    setState((current) => (current.status === "ready" ? current : { status: "loading" }));
    begin();
  }, [begin]);
```
（变量名以文件里实际的为准；`mutate` 不动。）同步更新 `use-resource` 的测试：已有值时 reload 期间仍是 ready 旧值、完成后换成新值；初次 / 出错时 reload 仍显示 loading。若别的测试依赖「reload 时先变 loading」，按新行为更新并在报告里列出。

## R4 开课失败（学根没回答），退出重进后点「开课」只切过去、不再开课

原因：`core/board/use-course-sessions.ts` 在**点击时**就写 `courseStartedOn[slug] = 今天`；之后 `openingAction` 判断「今天已开过」→ `switch-only` → `switchOnly(slug)` 只打开会话、不发开课指令。开课那次若失败（报错、断网、额度），当天就再也开不了课。取舍：仍然「一门课一天一个会话」，但**那个会话里学根还没回答过任何内容时，重新发开课指令**。

改法：
1. 新纯函数（放在 `core/chat/lesson-actions.ts` 旁边或 `core/board/` 合适的文件，+ 测试）：
```ts
/** True once 学根 has answered something in the transcript (a failed or unanswered opening does not count). */
export function hasAnswer(messages: readonly ChatMessage[]): boolean {
  return messages.some((message) => message.role === "assistant" && message.markdown.trim() !== "" && !message.errorMessage);
}
```
   `lessonActions` 里同样的判断改为调用它（行为不变）。
2. `use-course-sessions.ts`：照 `messagesLength` 的写法加一个 ref `answeredRef`，在同一个 `useLayoutEffect` 里更新为 `hasAnswer(controller.messages)`。
3. `switchOnly(slug)` 增加第二个参数 `retryText: string | null`：会话打开后（`openSession(...).then` 里）若 `retryText !== null && !answeredRef.current`，就 `controller.send(retryText)`（与 `startSession` 的 `deliver` 同样走 `send`，带原来的开课标记文本）。
4. `openCourse` 里 `switchOnly(slug)` 改为 `switchOnly(slug, fallbackText)`；`switch-only` 的其他调用若有，传 `null`。
5. 测试（`use-course-sessions.test.tsx`）：今天已开过、会话里没有学根回答 → 点开课会 `send` 开课指令；今天已开过、有回答 → 只切换不发送。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文）

R3、R4 各自：改了哪些文件、测试怎么写的、受影响的旧测试、偏离之处；验收输出；未完成项。
