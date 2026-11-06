# 批次 BE-7：改计划不带风格标签 + 工具步骤折叠成一行（逐步执行清单）

用户反馈（2026-11-05）：
1. 点「改计划」发出的消息前面带了「大白话」标签——改计划/建课不是讲解，不该带风格。原因：这两条走 `controller.send`（会加风格前缀），应走 `controller.sendCommand`（不加）。
2. 一次改计划刷出 25 行工具调用（`▸ bash {"command": …} · 成功`）和 22 个「复制 Markdown」，用户不看这些过程，要求压成一行。原因：一次回答由多条 assistant 消息组成（每个工具一步一条），每条都渲染自己的工具行和复制按钮。

## 规则（上下文被压缩后先重读本文件）
- **只照下面的步骤做，逐字使用给出的代码。** 不要自己设计、不要改写、不要补充。
- 只动：`apps/desktop/src/renderer/core/board/use-course-sessions.ts`、`core/board/use-course-sessions.test.tsx`、`core/strings.ts`、新建 `core/chat/turns.ts` 与 `core/chat/turns.test.ts`、`skins/bear/slots.tsx`、`skins/bear/skin.css`。其他一律不动。
- 不 commit、不启动 Electron、不读写 `~/.xuegen`、不加依赖、不加 `eslint-disable` / `@ts-ignore`。
- 做不下去就停下，报告哪一步、原文、报错。唯一允许：不改行为的类型标注小修，逐处列出。

工作目录 `/Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/`。

---

## 第 1 步：`core/board/use-course-sessions.ts` 改计划和建课不带风格

1a. 找到：

```ts
  const startSession = useCallback(
    (slug: string, text: string, card: CourseIntro | null, startedOn: string | null) => {
      if (card) setIntro({ card, beforeIndex: controller.messages.length });
      if (activeCourse === slug) {
        controller.send(text);
```

替换为：

```ts
  const startSession = useCallback(
    (slug: string, text: string, card: CourseIntro | null, startedOn: string | null, command = false) => {
      // A course-management request (改计划) is an instruction, not a lesson:
      // it goes out without the session style prefix.
      const deliver = (message: string): void => (command ? controller.sendCommand(message) : controller.send(message));
      if (card) setIntro({ card, beforeIndex: controller.messages.length });
      if (activeCourse === slug) {
        deliver(text);
```

1b. 在同一个 `startSession` 里，找到 `.then((opened) => {` 回调**末尾**的这一行：

```ts
        controller.send(text);
      });
    },
```

替换为：

```ts
        deliver(text);
      });
    },
```

1c. 找到：

```ts
        controller.send(newCoursePrompt(request));
```

替换为：

```ts
        controller.sendCommand(newCoursePrompt(request));
```

1d. 找到：

```ts
      startSession(course.slug, editPlanPrompt(course.title, change), null, null);
```

替换为：

```ts
      startSession(course.slug, editPlanPrompt(course.title, change), null, null, true);
```

## 第 2 步：`core/board/use-course-sessions.test.tsx` 跟着改

2a. 在 `function fakeController(` 里，找到：

```ts
    send: vi.fn(),
    openSession: vi.fn().mockResolvedValue(sessionFile),
```

替换为：

```ts
    send: vi.fn(),
    sendCommand: vi.fn(),
    openSession: vi.fn().mockResolvedValue(sessionFile),
```

并把紧接着的类型断言：

```ts
  } as unknown as ChatController & {
    send: ReturnType<typeof vi.fn>;
    openSession: ReturnType<typeof vi.fn>;
  };
```

替换为：

```ts
  } as unknown as ChatController & {
    send: ReturnType<typeof vi.fn>;
    sendCommand: ReturnType<typeof vi.fn>;
    openSession: ReturnType<typeof vi.fn>;
  };
```

2b. 在建课的用例里（调用 `actions?.handleNewCourse({ title: "代数", …` 的那个），把紧随其后的：

```ts
    expect(controller.send).toHaveBeenCalledTimes(1);
```

替换为：

```ts
    expect(controller.sendCommand).toHaveBeenCalledTimes(1);
    expect(controller.send).not.toHaveBeenCalled();
```

（只改这一处；文件里其他 `controller.send` 断言不动。）

2c. 在调用 `actions?.handleEditPlan(studyCourse, "少一点");` 的用例里，找到它后面的：

```ts
    expect(actions?.intro).toBeNull();
  });
```

替换为：

```ts
    expect(actions?.intro).toBeNull();
    expect(controller.send).not.toHaveBeenCalled();
    expect(controller.sendCommand).toHaveBeenCalledWith(expect.stringContaining("少一点"));
  });
```

（如果这个用例里 `controller` 不在作用域内或名字不同，停下报告。）

## 第 3 步：`core/strings.ts` 加文案

在 `chat: {` 分组里找到 `backToLatest:` 那一行，在它**下面**插入：

```ts
    /** One line standing for all of an answer's tool steps (click to show them). */
    toolSteps: (n: number): string => `学根做了 ${n} 步操作`,
```

（如果 `chat` 分组里没有 `backToLatest:`，停下报告。）

## 第 4 步：新建 `core/chat/turns.ts`

```ts
/**
 * Assistant turns: the run of assistant messages between two user messages.
 *
 * One answer arrives as several assistant messages (one per tool step). Skins
 * fold a turn's tool rows into a single line and show one copy button per turn,
 * so they need to know, for each message, which turn it belongs to and whether
 * it opens or closes that turn. Pure, so it is tested.
 */

import type { ChatMessage } from "@shared/protocol.js";

export interface TurnInfo {
  /** Stable key for the turn: the id of its first assistant message. */
  key: string;
  /** True for the turn's first assistant message. */
  first: boolean;
  /** True for the turn's last assistant message. */
  last: boolean;
  /** Tool calls across the whole turn. */
  toolCount: number;
}

/** For each message, its turn (assistant messages) or null (user messages). */
export function assistantTurns(messages: readonly ChatMessage[]): (TurnInfo | null)[] {
  const result: (TurnInfo | null)[] = messages.map(() => null);
  let index = 0;
  while (index < messages.length) {
    if (messages[index]?.role !== "assistant") {
      index += 1;
      continue;
    }
    let end = index;
    while (messages[end + 1]?.role === "assistant") end += 1;
    const key = messages[index]?.id ?? String(index);
    let toolCount = 0;
    for (let i = index; i <= end; i += 1) toolCount += messages[i]?.toolCalls.length ?? 0;
    for (let i = index; i <= end; i += 1) {
      result[i] = { key, first: i === index, last: i === end, toolCount };
    }
    index = end + 1;
  }
  return result;
}
```

## 第 5 步：新建 `core/chat/turns.test.ts`

用 vitest。写一个造消息的小函数：`msg(id, role, tools)` 返回 `{ id, role, markdown: "", streaming: false, toolCalls: Array.from({ length: tools }, (_, i) => ({ toolCallId: `${id}-${i}`, toolName: "bash", argsSummary: "", status: "success" })) }`，必要时用 `as ChatMessage` / `as ToolCallView`（类型从 `@shared/protocol.js` import）满足类型。用例名称照抄：

1. `"groups consecutive assistant messages into one turn"`：`[u1(user), a1(2 tools), a2(0), a3(1)]` → 下标 0 为 `null`；下标 1/2/3 的 `key` 都是 `"a1"`、`toolCount` 都是 `3`；`first` 只有下标 1 为 true；`last` 只有下标 3 为 true。
2. `"starts a new turn after each user message"`：`[u1, a1(1), u2, a2(0)]` → 下标 1 的 key 为 `"a1"`、下标 3 的 key 为 `"a2"`，两者 `first` 和 `last` 都是 true，`toolCount` 分别是 1 和 0。
3. `"handles an empty transcript"`：`assistantTurns([])` 等于 `[]`。

## 第 6 步：`skins/bear/slots.tsx` 在 Thread 里折叠工具步骤

6a. 把这一行：

```tsx
import { Fragment, useRef } from "react";
```

改为：

```tsx
import { Fragment, useRef, useState } from "react";
```

并在 `import { thinkingFor } from "../../core/chat/thinking.js";` 这一行**下面**插入：

```tsx
import { assistantTurns } from "../../core/chat/turns.js";
```

6b. 在 `export function Thread(` 里，找到：

```tsx
  const notes = (index: number) =>
```

在它**上面**插入：

```tsx
  // One answer = one turn; its tool rows fold into a single line (open per turn).
  const turns = assistantTurns(messages);
  const [openTurns, setOpenTurns] = useState<ReadonlySet<string>>(() => new Set());
  const toggleTurn = (key: string): void =>
    setOpenTurns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
```

6c. 找到：

```tsx
          messages.map((message, index) => (
            <Fragment key={message.id}>
              {notes(index)}
              {cardIndex === index && card}
              <div
                ref={index === lastAssistantIndex ? answerRef : undefined}
                data-message-id={message.id}
              >
                {renderMessage(message, thinkingFor(messages, index, thinking))}
              </div>
            </Fragment>
          ))
```

整段替换为：

```tsx
          messages.map((message, index) => {
            const turn = turns[index] ?? null;
            const open = turn !== null && openTurns.has(turn.key);
            const hasText = message.markdown.trim() !== "" || !!message.errorMessage;
            return (
              <Fragment key={message.id}>
                {notes(index)}
                {cardIndex === index && card}
                {turn?.first && turn.toolCount > 0 && (
                  <button
                    type="button"
                    className="bear-turn-tools"
                    aria-expanded={open}
                    onClick={() => toggleTurn(turn.key)}
                  >
                    <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                    {strings.chat.toolSteps(turn.toolCount)}
                  </button>
                )}
                <div
                  ref={index === lastAssistantIndex ? answerRef : undefined}
                  data-message-id={message.id}
                  className="bear-turn-part"
                  data-turn={turn ? "" : undefined}
                  data-tools-open={open ? "" : undefined}
                  data-turn-last={turn?.last ? "" : undefined}
                  data-has-text={hasText ? "" : undefined}
                >
                  {renderMessage(message, thinkingFor(messages, index, thinking))}
                </div>
              </Fragment>
            );
          })
```

## 第 7 步：`skins/bear/skin.css` 末尾追加（原样粘贴）

```css
/* ── 工具步骤折叠 (BE-7) ─────────────────────────────────────────────────
   One line per answer stands for all its tool steps; the rows show only
   when that line is opened. Tool-only steps in the middle of an answer
   vanish while folded, and only the answer's last part keeps 复制 Markdown. */

[data-skin="bear"] .bear-turn-tools {
  display: inline-flex;
  gap: 0.4em;
  margin: 0.2em 0 0.6em;
  font-size: 13px;
  color: var(--soft);
}
[data-skin="bear"] .bear-turn-tools:hover {
  color: var(--ink);
}
[data-skin="bear"] .bear-turn-part[data-turn]:not([data-tools-open]) .bear-tool {
  display: none;
}
[data-skin="bear"] .bear-turn-part[data-turn]:not([data-tools-open]):not([data-has-text]):not([data-turn-last]) {
  display: none;
}
[data-skin="bear"] .bear-turn-part[data-turn]:not([data-turn-last]) .bear-answer-foot {
  display: none;
}
```

## 第 8 步：验收（必须自己跑，贴最后几行）

`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。

## 结束报告
第 1–7 步各自是否照做；任何偏离列原文与改后；所有命令结果。

## 执行记录（2026-11-05）
Devin 照清单执行，零偏离。真实验证：测试副本一次带工具的回答折叠为「▸ 学根做了 1 步操作」，工具行隐藏，回答只留一个复制。
另：核对时发现既有 bug——页面重载时 agent 回传的是启动时缓存的历史（只追加了用户消息，没有追加流式回答），导致重载后学根的回答不见。Claude 在 agent/index.ts 的 init 分支先 refreshHistory() 再广播（1 行），重启后与重载后均显示完整（user, assistant, user）。
