# 批次 BE-11c：对话里「正在思考」那一行带小机器人，表情跟着学根在做的事变

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计；某一步做不到时停下，在报告里写清卡在哪一步、报错原文。

## 本批硬约束（压缩后也要记得）

1. 只改 / 新建这些文件：
   - 新建 `apps/desktop/src/renderer/core/chat/activity.ts`、`activity.test.ts`
   - `apps/desktop/src/renderer/core/strings.ts`
   - `apps/desktop/src/renderer/skins/contract.ts`
   - `apps/desktop/src/renderer/core/chat/message-renderer.tsx`
   - `apps/desktop/src/renderer/skins/bear/control-bot.tsx`、`slots.tsx`、`skin.css`
   - `apps/desktop/src/renderer/skins/bear/vendor/grokbot-web/grokbot-web.d.ts`（只改第 4 步那一行）
   - `apps/desktop/src/renderer/skins/bare/messages.tsx`
   - 第 3 步说明的「补字段」：typecheck 报 `AssistantMessageProps` 缺 `activity` 的文件（只补 `activity: null`）
   - `docs/desktop/skins/bear.md`（改一行）
   其他文件一律不动；**不要**改 `grokbot-web.js`。
2. 不加依赖。文案只写在 `core/strings.ts`。样式限定在 `[data-skin="bear"]` 下。
3. 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 `git commit` / `git push`。
4. 不加 `eslint-disable`、`@ts-ignore`、`any`。不改 `App.tsx`。

## 先读

`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`；`core/chat/message-renderer.tsx`、`core/chat/thinking.ts`；`skins/contract.ts` 的 `AssistantMessageProps`、`ThinkingProps`；`skins/bear/slots.tsx`（`AssistantMessage`、`Thinking`）、`skins/bear/control-bot.tsx`、`core/board/bot-state.ts`；`skins/bare/messages.tsx`。

设计稿（只看）：`/Users/gjy/pi-learning/design/animate/src/thinking.jsx`。

## 背景

用户反馈：小机器人只在总控标题栏，平时看不到它的表情变化。改为：**所有会话**里，回答进行中那一行（原来只写「正在思考」）前面放一个 24px 的小机器人，表情和文字跟着学根在做的事变：

| 情况 | 表情（grokbot 状态） | 文字 |
|---|---|---|
| 正在跑只读工具（read / grep / find / ls） | `searching` | 正在查资料：<参数摘要> |
| 正在跑其他工具（bash / write / edit …） | `working` | 正在动手：<工具名 参数摘要> |
| 刚发出问题、这一块还没有任何输出 | `thinking` | 正在思考 |
| 正文正在一个字一个字出来 | `writing` | 正在写 |

回答结束这一行就消失。总控标题栏的头像保持不变。

## 步骤

### 第 1 步：`core/strings.ts`

在 `chat: { … }` 对象里，`thinking: "正在思考",` 之后加：

```ts
    activitySearching: (detail: string): string => `正在查资料：${detail}`,
    activityWorking: (detail: string): string => `正在动手：${detail}`,
    activityWriting: "正在写",
```

### 第 2 步：新建 `core/chat/activity.ts`，原样如下

```ts
/**
 * What 学根 is doing in an assistant block right now, for the line that used to
 * read only 「正在思考」: looking things up, changing things, thinking, or
 * writing. Pure: the message and the thinking flag are arguments.
 */

import type { ChatMessage } from "@shared/protocol.js";
import { strings } from "../strings.js";

export type ActivityMood = "thinking" | "searching" | "working" | "writing";

export interface Activity {
  mood: ActivityMood;
  label: string;
}

/** Pi's tools that only look at files; every other tool may change something. */
const LOOKING_TOOLS = new Set(["read", "grep", "find", "ls"]);

/** Longest tool detail shown after 「正在查资料：」 / 「正在动手：」. */
const MAX_DETAIL = 40;

function clip(text: string): string {
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL - 1)}…` : text;
}

/**
 * The block's current activity, or null when nothing is in progress.
 *
 * A running tool wins (it is what 学根 is waiting on); then an empty block is
 * thinking (`thinking` comes from `thinkingFor`); then streaming text is writing.
 */
export function activityOf(message: ChatMessage, thinking: boolean): Activity | null {
  if (message.role !== "assistant") return null;
  const running = [...message.toolCalls].reverse().find((call) => call.status === "running");
  if (running) {
    if (LOOKING_TOOLS.has(running.toolName)) {
      return { mood: "searching", label: strings.chat.activitySearching(clip(running.argsSummary || running.toolName)) };
    }
    return { mood: "working", label: strings.chat.activityWorking(clip(`${running.toolName} ${running.argsSummary}`.trim())) };
  }
  if (thinking) return { mood: "thinking", label: strings.chat.thinking };
  if (message.streaming && message.markdown.trim() !== "") return { mood: "writing", label: strings.chat.activityWriting };
  return null;
}
```

### 第 3 步：新建 `core/chat/activity.test.ts`，原样如下

```ts
import { describe, expect, it } from "vitest";
import type { ChatMessage, ToolCallView } from "@shared/protocol.js";
import { activityOf } from "./activity.js";
import { strings } from "../strings.js";

function call(toolName: string, argsSummary: string, status: ToolCallView["status"]): ToolCallView {
  return { toolCallId: `${toolName}-${status}`, toolName, argsSummary, status };
}

function assistant(overrides: Partial<ChatMessage>): ChatMessage {
  return { id: "a1", role: "assistant", markdown: "", streaming: true, toolCalls: [], ...overrides };
}

describe("activityOf", () => {
  it("looks things up while a read-only tool runs", () => {
    const message = assistant({ toolCalls: [call("read", "wiki/courses/ctm.md", "running")] });
    expect(activityOf(message, true)).toEqual({ mood: "searching", label: strings.chat.activitySearching("wiki/courses/ctm.md") });
  });

  it("works while any other tool runs, clipping a long detail", () => {
    const long = "node skills/course/course-schedule.mjs plan wiki/courses/ctm.md --days tue,thu";
    const activity = activityOf(assistant({ toolCalls: [call("bash", long, "running")] }), false);
    expect(activity?.mood).toBe("working");
    expect(activity?.label.endsWith("…")).toBe(true);
    expect(activity?.label.startsWith(strings.chat.activityWorking("bash node"))).toBe(true);
  });

  it("thinks on an empty block, writes while text streams, and is idle when done", () => {
    expect(activityOf(assistant({}), true)).toEqual({ mood: "thinking", label: strings.chat.thinking });
    expect(activityOf(assistant({ markdown: "第一句" }), false)).toEqual({ mood: "writing", label: strings.chat.activityWriting });
    expect(activityOf(assistant({ markdown: "完了", streaming: false, toolCalls: [call("read", "x", "success")] }), false)).toBeNull();
  });

  it("is null for user messages", () => {
    expect(activityOf({ id: "u1", role: "user", markdown: "问题", streaming: false, toolCalls: [] }, true)).toBeNull();
  });
});
```

### 第 4 步：类型与契约

1. `skins/bear/vendor/grokbot-web/grokbot-web.d.ts`：把
   ```ts
   export type GrokBotState = "idle" | "thinking" | "working" | "notifying" | "sleeping";
   ```
   改为
   ```ts
   export type GrokBotState = "idle" | "thinking" | "working" | "notifying" | "sleeping" | "searching" | "writing";
   ```
2. `skins/contract.ts`：
   - import 区加 `import type { Activity } from "../core/chat/activity.js";`
   - `AssistantMessageProps` 里 `thinking: boolean;`（连同注释）之后加：
     ```ts
       /** What 学根 is doing in this block right now (思考 / 查资料 / 动手 / 写), or null. */
       activity: Activity | null;
     ```
3. 跑 `npm run typecheck`：凡是报 `AssistantMessageProps` 字面量缺 `activity` 的地方（测试等），在其 `thinking` 那一项之后补 `activity: null,`。只做这一种补法。

### 第 5 步：`core/chat/message-renderer.tsx`

1. import 区加 `import { activityOf } from "./activity.js";`
2. 在 `<slots.AssistantMessage` 的属性里，`thinking={thinking}` 之后加 `activity={activityOf(message, thinking)}`。

### 第 6 步：`skins/bear/control-bot.tsx` 改成通用的小头像

把整个文件替换为：

```tsx
/**
 * The small grokbot avatar Bear draws: in the 总控 title (22px) and on the line
 * that says what 学根 is doing (24px). Ink body, paper eyes, so it never competes
 * with the one accent colour. Decorative: the text beside it says the same thing.
 *
 * The engine needs a 2D canvas; where there is none (jsdom in tests) the avatar
 * keeps its space but draws nothing.
 */

import type { BotMood } from "../../core/board/bot-state.js";
import type { ActivityMood } from "../../core/chat/activity.js";
import { GrokBotView } from "./vendor/grokbot-web/grokbot-web.js";

const INK = { bodyColor: "#1f2124", eyeColor: "#fbfbfa", badgeColor: "#1f2124", particleColor: "#1aa3ff" };

/** True where a 2D canvas exists (Electron), false in jsdom. */
function canDraw(): boolean {
  return typeof CanvasRenderingContext2D !== "undefined";
}

export function MiniBot({ mood, size }: { mood: BotMood | ActivityMood; size: number }) {
  return (
    <span className="bear-bot" aria-hidden="true" style={{ width: size, height: size }}>
      {canDraw() && <GrokBotView state={mood} shape="blob" size={size} autoExpression theme={INK} />}
    </span>
  );
}

export function ControlBot({ mood }: { mood: BotMood }) {
  return <MiniBot mood={mood} size={22} />;
}
```

### 第 7 步：`skins/bear/slots.tsx`

1. import 区加：
   ```tsx
   import type { Activity } from "../../core/chat/activity.js";
   import { MiniBot } from "./control-bot.js";
   ```
2. `AssistantMessage` 的参数解构里，`thinking,` 之后加 `activity,`；并把
   ```tsx
         {thinking && <Thinking label={strings.chat.thinking} />}
   ```
   改为
   ```tsx
         {activity && <ActivityLine activity={activity} />}
   ```
   （`thinking` 参数仍保留在解构里；若 lint 报它未使用，把解构里的 `thinking,` 删掉，其余不动。）
3. 在 `export function Thinking(…) { … }` 整个函数之后插入：

```tsx
/** The line under an answer in progress: the avatar's mood and what 学根 is doing. */
function ActivityLine({ activity }: { activity: Activity }) {
  return (
    <div className="bear-activity">
      <MiniBot mood={activity.mood} size={24} />
      <Thinking label={activity.label} />
    </div>
  );
}
```

### 第 8 步：`skins/bear/skin.css` 末尾追加

```css
/* The in-progress line: avatar + what 学根 is doing (BE-11c). */
[data-skin="bear"] .bear-activity {
  display: flex;
  align-items: center;
  gap: 10px;
}
[data-skin="bear"] .bear-activity .bear-bot {
  margin-right: 0;
  vertical-align: middle;
}
[data-skin="bear"] .bear-activity .bear-thinking {
  margin: 0;
}
```

### 第 9 步：bare 也显示同样的文字

`skins/bare/messages.tsx` 的 `AssistantMessage`（或渲染 `strings.chat.thinking` 的那个组件）：参数解构里加 `activity,`；把只在 `thinking` 时显示 `strings.chat.thinking` 的那一处改为：显示条件仍是原来的条件，文字改成 `activity?.label ?? strings.chat.thinking`。若该组件拿不到 `activity`（不是 `AssistantMessageProps` 的组件），不改 bare，在报告里说明。

### 第 10 步：`docs/desktop/skins/bear.md`

把 BE-11b 加的那行「总控会话时标题前有 22px 墨色小机器人…」改为：
`- 小机器人（grokbot-web，打包在 skins/bear/vendor/，见 SOURCE.txt）：回答进行中那一行前面 24px，表情与文字随学根在做的事变（思考 / 查资料 / 动手 / 写）；总控会话标题前 22px，显示待命 / 提醒 / 休息 / 思考 / 动手。`

## 完成标准（可观察）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && git status --short apps/desktop docs/desktop/skins
```

- 贴出每条输出的最后 15 行。`activity.test.ts` 的 4 个用例通过；原有测试全部仍通过（Bear 与 bare 原来断言「正在思考」的测试应仍通过，因为空块时文字仍是「正在思考」）。
- 若某个断言与实际行为不符：先不要改测试或代码去迁就，在报告里写出失败的断言、实际值和你判断的原因，停下。

## 结束报告

列出：改了 / 新建了哪些文件（第 4 步补字段的文件单独列出）；每一步是否照做；偏离之处及原因；未完成项。
