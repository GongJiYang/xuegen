# 批次 PL-10：对话左侧钉板——本课要点 + 当前题目

设计稿（用户已批准）：`/Users/gjy/pi-learning/design/animate/src/pin.jsx` + `pin.css`（`http://localhost:5181/?d=pin`）。

学根开课第一条回复以 `> [!abstract] 今日要点 · 离散 D1` 开头（每条 `- **术语**：定义`），检验题用 `> [!question] 检查理解`（一题一个）。这两条格式已写进 `teach` SKILL.md。本批让 Bear 把**最近的要点框**和**最近一轮题目**钉在对话栏左侧空白处；左侧放不下（抽屉打开、窗口窄）时缩成一个小按钮「要点 6 · 题目 3」，点开浮层看。点「跳到原文 ↑ / 跳到原题 ↑」滚回那条消息。

## 硬约束（先看这里）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 按步骤**逐条照做**，代码照抄；不要重新设计。做不通时停下报告。
- 只准改 / 新建：`renderer/core/chat/pin-board.ts`（新）、`renderer/core/chat/pin-board.test.ts`（新）、`renderer/core/strings.ts`、`renderer/skins/contract.ts`、`renderer/App.tsx`、`renderer/skins/bear/pin-rail.tsx`（新）、`renderer/skins/bear/slots.tsx`、`renderer/skins/bear/skin.css`、`renderer/gallery/Gallery.tsx`，以及类型报错需要补 `pin` 的测试文件。bare / chicago 渲染代码不动。
- 皮肤里不写中文文案。不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 commit / push，不加依赖，不加 `eslint-disable` / `@ts-ignore`。`App.tsx` ≤ 450 行。

以下路径都相对 `apps/desktop/src/`。

## 第 1 步：新文件 `renderer/core/chat/pin-board.ts`

```ts
/**
 * What the chat pins beside the transcript during a lesson: the latest
 * 「今日要点」 box (`> [!abstract] …` with `- **术语**：定义` lines) and the
 * latest round of 检查理解 questions (`> [!question]` callouts, one per
 * question). Pure: derived from the messages on every render.
 */

import type { ChatMessage } from "@shared/protocol.js";
import { parseContent } from "../content/parse-content.js";

export interface PinDefinition {
  /** The bold term, or "" for a plain line. */
  term: string;
  /** The definition (inline Markdown). */
  body: string;
}

export interface PinBoard {
  /** The latest 今日要点 box and the message it came from, or null. */
  defs: { title: string; items: PinDefinition[]; messageId: string } | null;
  /** The latest round of questions (inline Markdown, one per callout) and its message, or null. */
  questions: { items: string[]; messageId: string } | null;
}

const ABSTRACT_OPENER = /^>\s*\[!abstract\][+-]?\s*(.*)$/i;
const TERM_LINE = /^[-*]\s+\*\*(.+?)\*\*\s*[:：]\s*(.+)$/;
const PLAIN_LINE = /^[-*]\s+(.+)$/;

/** The last `> [!abstract]` box in one message, or null when it has none or no list lines. */
export function abstractBox(markdown: string): { title: string; items: PinDefinition[] } | null {
  const lines = markdown.split("\n");
  let found: { title: string; items: PinDefinition[] } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const opener = ABSTRACT_OPENER.exec(lines[index] ?? "");
    if (!opener) continue;
    const items: PinDefinition[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next] ?? "";
      if (!line.startsWith(">")) break;
      const body = line.replace(/^>\s?/, "").trim();
      const term = TERM_LINE.exec(body);
      if (term) {
        items.push({ term: (term[1] ?? "").trim(), body: (term[2] ?? "").trim() });
        continue;
      }
      const plain = PLAIN_LINE.exec(body);
      if (plain) items.push({ term: "", body: (plain[1] ?? "").trim() });
    }
    if (items.length > 0) found = { title: (opener[1] ?? "").trim(), items };
  }
  return found;
}

/** A question callout's body as one line of inline Markdown. */
function questionText(body: string): string {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");
}

/** The pin board for a transcript, or null when there is nothing to pin. */
export function pinBoard(messages: ChatMessage[]): PinBoard | null {
  let defs: PinBoard["defs"] = null;
  let questions: PinBoard["questions"] = null;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const box = abstractBox(message.markdown);
    if (box) defs = { ...box, messageId: message.id };
    const items = parseContent(message.markdown).flatMap((node) =>
      node.kind === "callout" && node.calloutType === "question" ? [questionText(node.body)] : [],
    );
    if (items.length > 0) questions = { items, messageId: message.id };
  }
  return defs || questions ? { defs, questions } : null;
}
```

（若 `parseContent` 的 callout 节点正文字段不叫 `body`，照 `core/content/nodes.ts` 里 `CalloutNode` 的实际字段名改，在报告里写明。）

## 第 2 步：新文件 `renderer/core/chat/pin-board.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/protocol.js";
import { abstractBox, pinBoard } from "./pin-board.js";

function assistant(id: string, markdown: string): ChatMessage {
  return { id, role: "assistant", markdown, streaming: false, toolCalls: [] } as unknown as ChatMessage;
}
function user(id: string, markdown: string): ChatMessage {
  return { id, role: "user", markdown, streaming: false, toolCalls: [] } as unknown as ChatMessage;
}

const DEFS = [
  "> [!abstract] 今日要点 · 离散 D1",
  "> - **∈ 与 ⊆**：∈ 看整体是不是成员；⊆ 剥一层逐个找。",
  "> - **量词顺序**：写在前面的先定。",
  "> - 普通一行",
  "",
  "已存入概念页。",
].join("\n");

const QUESTIONS = [
  "讲解……",
  "",
  "> [!question] 检查理解",
  "> 把 `n|2` 修好后，k 取什么范围？",
  "",
  "> [!question] 检查理解",
  "> 判真假：$\\{3\\} \\subseteq \\{\\{2\\},\\{3\\}\\}$",
].join("\n");

describe("abstractBox", () => {
  it("reads the title and the term lines, keeping plain list lines", () => {
    expect(abstractBox(DEFS)).toEqual({
      title: "今日要点 · 离散 D1",
      items: [
        { term: "∈ 与 ⊆", body: "∈ 看整体是不是成员；⊆ 剥一层逐个找。" },
        { term: "量词顺序", body: "写在前面的先定。" },
        { term: "", body: "普通一行" },
      ],
    });
  });
  it("is null without a box or with an empty box", () => {
    expect(abstractBox("没有框")).toBeNull();
    expect(abstractBox("> [!abstract] 空\n\n正文")).toBeNull();
  });
});

describe("pinBoard", () => {
  it("pins the latest definitions box and the latest round of questions", () => {
    const board = pinBoard([user("u1", "开始"), assistant("a1", DEFS), user("u2", "答"), assistant("a2", QUESTIONS)]);
    expect(board?.defs?.messageId).toBe("a1");
    expect(board?.defs?.items).toHaveLength(3);
    expect(board?.questions).toEqual({
      messageId: "a2",
      items: ["把 `n|2` 修好后，k 取什么范围？", "判真假：$\\{3\\} \\subseteq \\{\\{2\\},\\{3\\}\\}$"],
    });
  });
  it("a later round replaces the earlier questions; user messages are ignored", () => {
    const later = "> [!question] 检查理解\n> 新的一题";
    const board = pinBoard([assistant("a1", QUESTIONS), user("u1", DEFS), assistant("a2", later)]);
    expect(board?.questions).toEqual({ messageId: "a2", items: ["新的一题"] });
    expect(board?.defs).toBeNull();
  });
  it("is null when there is nothing to pin", () => {
    expect(pinBoard([user("u1", "你好"), assistant("a1", "普通回答")])).toBeNull();
  });
});
```

## 第 3 步：`renderer/core/strings.ts`

在 `chat: {` 块里（`activityWriting` 那一项后面）加：

```ts
    pinDefs: "本课要点",
    pinQuestions: "当前题目",
    pinJumpDefs: "跳到原文 ↑",
    pinJumpQuestions: "跳到原题 ↑",
    pinChip: (defs: number, questions: number): string =>
      [defs > 0 ? `要点 ${defs}` : "", questions > 0 ? `题目 ${questions}` : ""].filter(Boolean).join(" · "),
```

## 第 4 步：契约与组装

1. `renderer/skins/contract.ts`：import `PinBoard`（`import type { PinBoard } from "../core/chat/pin-board.js";`，放在 `Activity` 那行旁边）；`ThreadProps` 里 `activity: Activity | null;` 下面加：

```ts
  /** The lesson's pinned 今日要点 box and latest questions (core's `pinBoard`), or null. Skins may ignore it. */
  pin: PinBoard | null;
```

2. `renderer/App.tsx`：加 `import { pinBoard } from "./core/chat/pin-board.js";`；`<Thread` 的 `activity={…}` 下面加 `pin={pinBoard(controller.messages)}`。
3. `renderer/gallery/Gallery.tsx`：每个 `<slots.Thread` 加 `pin={null}`。
4. 跑 typecheck，测试里手写 `ThreadProps` 缺 `pin` 的补 `pin: null`。

## 第 5 步：新文件 `renderer/skins/bear/pin-rail.tsx`

```tsx
/**
 * Bear pin rail (design `?d=pin`): the lesson's 今日要点 and the latest round of
 * questions, pinned in the blank margin left of the column. When the margin is
 * too narrow (drawer open, small window) it folds into a chip that opens the
 * same content as a popover. Jump links scroll the transcript back to the
 * source message.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PinBoard } from "../../core/chat/pin-board.js";
import { strings } from "../../core/strings.js";
import { Rich } from "./rich.js";

/** Rail width plus a gap, in px: the left margin must be at least this wide. */
const NEEDED = 300;

function jumpTo(pane: RefObject<HTMLElement | null>, messageId: string): void {
  const target = pane.current?.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
  target?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function Sections({ pin, pane, onJump }: { pin: PinBoard; pane: RefObject<HTMLElement | null>; onJump?: () => void }) {
  const [openDefs, setOpenDefs] = useState(true);
  const [openQuestions, setOpenQuestions] = useState(true);
  const jump = (id: string): void => {
    jumpTo(pane, id);
    onJump?.();
  };
  return (
    <>
      {pin.defs && (
        <section className="bear-pin-section">
          <button type="button" className="bear-pin-head" aria-expanded={openDefs} onClick={() => setOpenDefs((v) => !v)}>
            <span>{pin.defs.title || strings.chat.pinDefs}</span>
            <span className="bear-pin-toggle">{openDefs ? "▾" : "▸"}</span>
          </button>
          {openDefs && (
            <>
              <ol className="bear-pin-defs">
                {pin.defs.items.map((item, index) => (
                  <li key={index}>
                    {item.term && <b>{item.term}</b>}
                    <span>
                      <Rich text={item.body} />
                    </span>
                  </li>
                ))}
              </ol>
              <button type="button" className="bear-pin-jump" onClick={() => jump(pin.defs!.messageId)}>
                {strings.chat.pinJumpDefs}
              </button>
            </>
          )}
        </section>
      )}
      {pin.questions && (
        <section className="bear-pin-section">
          <button
            type="button"
            className="bear-pin-head"
            aria-expanded={openQuestions}
            onClick={() => setOpenQuestions((v) => !v)}
          >
            <span>{strings.chat.pinQuestions}</span>
            <span className="bear-pin-toggle">{openQuestions ? "▾" : "▸"}</span>
          </button>
          {openQuestions && (
            <>
              <ol className="bear-pin-qs">
                {pin.questions.items.map((text, index) => (
                  <li key={index}>
                    <span className="bear-pin-n">{index + 1}</span>
                    <span>
                      <Rich text={text} />
                    </span>
                  </li>
                ))}
              </ol>
              <button type="button" className="bear-pin-jump" onClick={() => jump(pin.questions!.messageId)}>
                {strings.chat.pinJumpQuestions}
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}

/** Whether the margin left of `anchor` (inside its `.bear-col`) fits the rail; follows window and drawer changes. */
function useWideMargin(anchor: RefObject<HTMLElement | null>): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const element = anchor.current;
    const column = element?.closest(".bear-col");
    if (!element || !column) return;
    const measure = (): void => {
      const left = element.getBoundingClientRect().left - column.getBoundingClientRect().left;
      setWide(left >= NEEDED);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [anchor]);
  return wide;
}

export function PinRail({ pin, pane }: { pin: PinBoard; pane: RefObject<HTMLElement | null> }) {
  const anchor = useRef<HTMLDivElement | null>(null);
  const wide = useWideMargin(anchor);
  const [open, setOpen] = useState(false);
  const chip = strings.chat.pinChip(pin.defs?.items.length ?? 0, pin.questions?.items.length ?? 0);
  return (
    <div ref={anchor} className="bear-pin-anchor">
      {wide ? (
        <aside className="bear-pin-rail" aria-label={strings.chat.pinDefs}>
          <Sections pin={pin} pane={pane} />
        </aside>
      ) : (
        <div className="bear-pin-chipwrap">
          <button type="button" className="bear-pin-chip" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {chip}
          </button>
          {open && (
            <div className="bear-pin-pop">
              <Sections pin={pin} pane={pane} onJump={() => setOpen(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

（jsdom 里没有 `ResizeObserver` 时测试会报错：在 `useWideMargin` 的 effect 里，`new ResizeObserver` 之前加 `if (typeof ResizeObserver === "undefined") { measure(); return; }`。若 lint 不允许 `!`，改成先取出 `const defs = pin.defs` / `const questions = pin.questions` 再用。）

## 第 6 步：`renderer/skins/bear/slots.tsx`

1. import 加 `import { PinRail } from "./pin-rail.js";`。
2. `Thread` 解构参数加 `pin,`。
3. `<div className="bear-thread-wrap">` 的**第一个子元素**位置（`<div className="bear-pane bear-body" …>` 之前）插入：

```tsx
      {pin && <PinRail pin={pin} pane={paneRef} />}
```

## 第 7 步：`renderer/skins/bear/skin.css` 末尾追加

```css
/* Pin rail (design ?d=pin): 今日要点 + 当前题目 in the margin left of the column. */
[data-skin="bear"] .bear-pin-anchor {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 100%;
  z-index: 3;
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.55;
}
[data-skin="bear"] .bear-pin-rail {
  position: absolute;
  top: 1.2em;
  right: 24px;
  width: 270px;
  max-height: calc(100% - 2.4em);
  overflow-y: auto;
  scrollbar-width: none;
}
[data-skin="bear"] .bear-pin-section {
  margin-bottom: 20px;
}
[data-skin="bear"] .bear-pin-head {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--rule);
  font-size: 12px;
  letter-spacing: 0.03em;
  color: var(--soft);
  text-align: left;
}
[data-skin="bear"] .bear-pin-toggle {
  color: var(--faint);
}
[data-skin="bear"] .bear-pin-defs,
[data-skin="bear"] .bear-pin-qs {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
[data-skin="bear"] .bear-pin-defs li {
  display: flex;
  flex-direction: column;
  padding: 6px 0;
  border-bottom: 1px solid var(--hairline);
  font-size: 12.5px;
  color: #4a4f55;
}
[data-skin="bear"] .bear-pin-defs b {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}
[data-skin="bear"] .bear-pin-qs li {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  font-size: 12.5px;
}
[data-skin="bear"] .bear-pin-n {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--paper);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
[data-skin="bear"] .bear-pin-jump {
  margin-top: 4px;
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-pin-jump:hover {
  color: var(--ink);
}
[data-skin="bear"] .bear-pin-chipwrap {
  position: absolute;
  top: 0.4em;
  left: 0;
}
[data-skin="bear"] .bear-pin-chip {
  padding: 2px 10px;
  border: 1px solid var(--rule);
  border-radius: 12px;
  background: #fff;
  font-size: 12px;
  color: #4a4f55;
  white-space: nowrap;
}
[data-skin="bear"] .bear-pin-pop {
  margin-top: 6px;
  width: 320px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 12px 14px;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgb(0 0 0 / 0.12);
}
```

## 第 8 步：Bear 组件测试（加到 `renderer/skins/bear/shell.test.tsx` 或新建 `renderer/skins/bear/pin-rail.test.tsx`，选后者）

新建 `renderer/skins/bear/pin-rail.test.tsx`：

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { PinRail } from "./pin-rail.js";
import { strings } from "../../core/strings.js";
import type { PinBoard } from "../../core/chat/pin-board.js";

afterEach(cleanup);

const PIN: PinBoard = {
  defs: { title: "今日要点 · 离散 D1", items: [{ term: "量词顺序", body: "写在前面的先定。" }], messageId: "a1" },
  questions: { items: ["第一题", "第二题"], messageId: "a2" },
};

describe("Bear pin rail", () => {
  it("folds into a chip when there is no margin, and opens the pinned content", async () => {
    render(
      <div data-skin="bear" className="bear-col">
        <div className="bear-thread-wrap">
          <PinRail pin={PIN} pane={createRef()} />
        </div>
      </div>,
    );
    const chip = screen.getByRole("button", { name: strings.chat.pinChip(1, 2) });
    await userEvent.click(chip);
    expect(screen.getByText("今日要点 · 离散 D1")).toBeTruthy();
    expect(screen.getByText("量词顺序")).toBeTruthy();
    expect(screen.getByText("第二题")).toBeTruthy();
    expect(screen.getByRole("button", { name: strings.chat.pinJumpQuestions })).toBeTruthy();
  });
});
```

（jsdom 里布局宽度都是 0，所以测的是缩成按钮的状态。）

## 验收命令（全部贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
wc -l src/renderer/App.tsx
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：全绿；`App.tsx` ≤ 450；新增改动只在允许的文件里。

## 结束报告

改了哪些文件；每一步是否照做；偏离之处与原因；补字段的测试文件；未完成项。
