# 批次 PL-5：「正在思考」那一行不再闪、不再跳

用户反馈：思考时「正在思考」一闪一跳。Claude 已查清原因：

1. **闪**：Bear 的 `Thinking`（`skins/bear/slots.tsx`）同时有两层动画——`ShimmeringText` 的流光，外加 `useMotion(bearMotion, "busy", …)` 的透明度呼吸（1 ↔ 0.55，0.9 秒往返）。两层叠加看起来就是一闪一闪。
2. **跳**：这一行画在每个回答块（`AssistantMessage`）的末尾，由 `activityOf(message, thinking)` 逐块计算。一次回答里学根每调用一次工具就会开一个新的回答块，于是这一行：工具刚结束、新块还没开始时，上一块已不在 streaming、新块还没出现 → 返回 null，整行消失；新块出现后再在新块末尾重新挂载（头像画布重建）。结果是行消失、头像重画、位置跳动。

修法：整次回答只画**一行**，挂在对话末尾，回答进行中一直在（空档时显示「正在思考」）；去掉呼吸动画，只留流光。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**，代码照抄；不要重新设计、改名或「顺手优化」。做不通时停下，在报告里写清卡在哪。
- 只准改：`renderer/core/chat/activity.ts`、`renderer/core/chat/activity.test.ts`、`renderer/skins/contract.ts`、`renderer/App.tsx`、`renderer/skins/bear/slots.tsx`、`renderer/skins/bear/skin.css`、`renderer/gallery/Gallery.tsx`，以及第 6 步因类型报错需要补 `activity` 的测试文件。bare 与 chicago 的渲染代码不动。
- 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。`App.tsx` 改完不得超过 450 行。

以下路径都相对 `apps/desktop/src/`。

## 第 1 步：`renderer/core/chat/activity.ts`

文件末尾追加：

```ts
const THINKING: Activity = { mood: "thinking", label: strings.chat.thinking };

/**
 * The one in-progress line for a whole answer (Bear draws it once, after the
 * transcript), or null when no answer is running.
 *
 * While `busy`, it follows the last assistant block — a running tool, then
 * thinking, then writing — and falls back to 正在思考 in the gaps between
 * blocks (a tool just finished and the next block has not started), so the
 * line never disappears mid-answer.
 *
 * @param busy     True from send until the answer ends (the controller's `streaming`).
 * @param thinking The session-level flag from `isThinking`.
 */
export function turnActivity(messages: ChatMessage[], busy: boolean, thinking: boolean): Activity | null {
  if (!busy) return null;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return THINKING;
  return activityOf(last, thinking) ?? THINKING;
}
```

## 第 2 步：`renderer/core/chat/activity.test.ts`

1. import 里加 `turnActivity`。
2. 文件末尾追加（`assistant(...)` / `user(...)` 之类的构造函数若本文件已有，照已有的用；没有就照本文件现有测试里构造 `ChatMessage` 的写法写一个，最少字段即可）：

```ts
describe("turnActivity", () => {
  it("is null when no answer is running", () => {
    expect(turnActivity([], false, false)).toBeNull();
  });
  it("shows 正在思考 right after sending, before any assistant block", () => {
    expect(turnActivity([USER_MESSAGE], true, false)?.mood).toBe("thinking");
  });
  it("follows the last block: a running tool, then writing", () => {
    expect(turnActivity([USER_MESSAGE, RUNNING_TOOL_BLOCK], true, false)?.mood).toBe("searching");
    expect(turnActivity([USER_MESSAGE, STREAMING_TEXT_BLOCK], true, false)?.mood).toBe("writing");
  });
  it("keeps 正在思考 in the gap after a tool finished, instead of disappearing", () => {
    expect(turnActivity([USER_MESSAGE, FINISHED_TOOL_BLOCK], true, false)).toEqual({ mood: "thinking", label: strings.chat.thinking });
  });
});
```

其中四个常量按本文件已有的消息构造方式定义：
- `USER_MESSAGE`：role `user`，markdown `"问题"`。
- `RUNNING_TOOL_BLOCK`：role `assistant`，`streaming: true`，markdown `""`，`toolCalls` 一项：toolName `read`、status `running`、argsSummary `'{"path":"wiki/a.md"}'`。
- `STREAMING_TEXT_BLOCK`：role `assistant`，`streaming: true`，markdown `"正在写的内容"`，无工具。
- `FINISHED_TOOL_BLOCK`：role `assistant`，`streaming: false`，markdown `"先查一下"`，`toolCalls` 一项 status `success`。

## 第 3 步：`renderer/skins/contract.ts`

`ThreadProps` 里 `systemNotes: ThreadNote[];` 下面加：

```ts
  /**
   * The answer-in-progress line for the whole turn (core's `turnActivity`), or
   * null when idle. A skin that draws it once after the transcript (Bear) never
   * remounts it between assistant blocks; skins may ignore it.
   */
  activity: Activity | null;
```

（`Activity` 已在本文件 import。）

## 第 4 步：`renderer/App.tsx`

1. 找到 import `activityOf` 或 `../core/chat/...` 的位置，加 `import { turnActivity } from "./core/chat/activity.js";`（路径照 App.tsx 里其他 `./core/chat/` import 的写法）。
2. `<Thread` 的属性里 `systemNotes={controller.systemNotes}` 下面加 `activity={turnActivity(controller.messages, controller.streaming, controller.thinking)}`。

## 第 5 步：`renderer/skins/bear/slots.tsx` 与 `skin.css`

1. `Thread` 的解构参数加 `activity,`。在 `{messages.length > 0 && notes(messages.length)}` 这一行**上面**插入：

```tsx
        {activity && <ActivityLine activity={activity} />}
```

2. `AssistantMessage`：解构参数里删掉 `activity,`；删掉 `{activity && <ActivityLine activity={activity} />}` 这一行。
3. `Thinking`：删掉 `useMotion(bearMotion, "busy", ref, []);` 这一行，以及只为它存在的 `const ref = …` 和 `ref={ref}`。改完后若 `bearMotion` / `useMotion` 在本文件已无其他用处，删掉对应 import（`AssistantMessage` 里还用 `useMotion(bearMotion, "appear", …)`，应保留）。
4. `ActivityLine` 上方注释改为：`/** The single line under the transcript while an answer runs: the avatar's mood and what 学根 is doing. */`
5. `skin.css`：在 `[data-skin="bear"] .bear-activity {` 规则里加一行 `margin: 0.6em 0 0;`。

## 第 6 步：其他 Thread 调用处

- `renderer/gallery/Gallery.tsx` 里每个 `<slots.Thread` 加 `activity={null}`；如果其中有一个是专门演示「正在思考」的样例，给它 `activity={{ mood: "thinking", label: strings.chat.thinking }}`（`strings` 已 import 就直接用）。
- 跑 `npm run typecheck`，测试文件里手写 `ThreadProps` 缺 `activity` 的，补 `activity: null`。

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
wc -l src/renderer/App.tsx
grep -n "busy" src/renderer/skins/bear/slots.tsx
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全绿；`App.tsx` ≤ 450 行；`slots.tsx` 里不再有 `"busy"`；新增改动只在允许的文件里。

## 结束报告

改了哪些文件；每一步是否照做；偏离之处与原因；未完成项。
