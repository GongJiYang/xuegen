# 批次 BE-5：Bear 输入区重做 + 字符图换平滑等宽字体（逐步执行清单）

用户已确认：输入区设计稿 `/Users/gjy/pi-learning/design/animate/src/composer.jsx` + `composer.css`（`http://localhost:5181/?d=composer`）。
字符图问题（用户报告：图里字体变了、两列对不齐）的根因与方案已由 Claude 验证：旧的 `Fusion12Diagram` 只含制表符号，英文落到 SF Mono（0.6em）导致错列；新字体 `BearDiagramMono`（由 `apps/desktop/scripts/make-bear-diagram-font.py` 从 Iosevka 生成，所有字符严格 0.5em），中文落到苹方（1em），实测对齐。

## 规则（上下文被压缩后先重读本文件）
- **只照下面的步骤做，逐字使用给出的代码。** 不要自己设计、不要改写、不要补充。
- 只动这些文件：`apps/desktop/src/renderer/skins/contract.ts`、`core/strings.ts`、`App.tsx`、`skins/bear/composer.tsx`、`skins/bear/skin.css`、`skins/bear/content.tsx`（只改注释）、`skins/bear/README.md`、`skins/bear/assets/` 下的字体与许可文件、`skins/bear/composer.test.tsx`（仅第 9 步允许的情况）。
- 不 commit、不启动 Electron、不读写 `~/.xuegen`、不加依赖、不加 `eslint-disable` / `@ts-ignore`。
- 做不下去就停下，报告哪一步、原文、报错。唯一允许：不改行为的类型标注小修，逐处列出。

工作目录 `/Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/`，下文路径相对它（命令里写绝对路径）。

---

## 第 1 步：字体文件

在终端执行（逐条）：

```sh
cp /tmp/iosevka/bear-diagram-mono.woff2 /Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/skins/bear/assets/bear-diagram-mono.woff2
cp /tmp/iosevka/package/LICENSE /Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/skins/bear/assets/OFL-Iosevka.txt
rm /Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/skins/bear/assets/fusion-12-diagram.woff2
rm /Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/skins/bear/assets/OFL.txt
```

（如果 `/tmp/iosevka/bear-diagram-mono.woff2` 不存在，停下报告。）

## 第 2 步：`skins/bear/skin.css` 换字体

2a. 找到：

```css
/* The diagram font is bundled with the skin and loads only when it is selected. */
@font-face {
  font-family: "Fusion12Diagram";
  src: url("./assets/fusion-12-diagram.woff2") format("woff2");
  font-display: block;
}
```

整段替换为：

```css
/* Code and character diagrams: every non-CJK glyph is exactly half an em
   (Iosevka subset, see scripts/make-bear-diagram-font.py); Chinese falls back
   to PingFang SC at a full em, so diagram columns line up. */
@font-face {
  font-family: "BearDiagramMono";
  src: url("./assets/bear-diagram-mono.woff2") format("woff2");
  font-display: block;
}
```

2b. 找到这一行：

```css
  --font-mono: "SF Mono", Menlo, monospace;
```

改为：

```css
  --font-mono: "BearDiagramMono", "PingFang SC", monospace;
```

2c. 删除这三行**声明**（只删行本身，不删它们所在的规则）：`  --bear-diagram-size: 12px;`（一处）和 `  --bear-diagram-size: 24px;`（两处）。注意 `.bear-diagram` 规则里的 `font-size: var(--bear-diagram-size);` **不在这一步删**，它由 2d 整条替换。

2d. 找到整条规则：

```css
[data-skin="bear"] .bear-diagram {
  font-family: "Fusion12Diagram", var(--font-mono);
  font-size: var(--bear-diagram-size);
  line-height: 1.35;
  overflow-x: auto;
  margin: 0.7em 0;
  -webkit-font-smoothing: none;
}
```

整条替换为：

```css
[data-skin="bear"] .bear-diagram {
  font-family: var(--font-mono);
  font-size: calc(var(--bear-body-size) * 0.875);
  line-height: 1.25;
  overflow-x: auto;
  margin: 0.7em 0;
  white-space: pre;
}
```

## 第 3 步：`skins/bear/content.tsx` 只改两处注释

把文件顶部注释里的这两行：

```
 * `--code-bg`, a `Fusion12Diagram` character diagram (12px, or 24px when the
 * body text is ≥ 20px — the CSS keys that off `data-bear-scale`), a KaTeX
```

替换为：

```
 * `--code-bg`, a character diagram in the half-width `BearDiagramMono` face
 * (7/8 of the body size; Chinese falls back to PingFang SC), a KaTeX
```

把这一行：

```tsx
/** A terminal character diagram in the half-width Fusion12Diagram face. */
```

替换为：

```tsx
/** A terminal character diagram in the half-width BearDiagramMono face. */
```

不改任何代码。

## 第 4 步：`skins/bear/README.md`

把这一行：

```
- `assets/`：`Fusion12Diagram` 字符图字体（从 chicago 复制，不跨皮肤 import）。
```

替换为：

```
- `assets/`：`bear-diagram-mono.woff2`（代码与字符图的半宽等宽字体，Iosevka 子集，SIL OFL 1.1，许可见 `OFL-Iosevka.txt`；由 `apps/desktop/scripts/make-bear-diagram-font.py` 生成）。
```

## 第 5 步：`skins/contract.ts` 给输入区加一个可选回调

在 `export interface ComposerProps {` 里找到 `answering: number | null;` 这一行，在它（以及紧跟它的注释，如果注释在它上方则不管）**下面**插入：

```ts
  /** Leave 「检查理解」 answering mode without sending (optional). */
  onCancelAnswer?(): void;
```

## 第 6 步：`App.tsx` 接上这个回调

找到这一行：

```tsx
          answering={answering}
```

在它**下面**插入：

```tsx
          onCancelAnswer={() => setAnswering(null)}
```

## 第 7 步：`core/strings.ts` 加文案

在 `input: {` 分组里找到：

```ts
    slashEmpty: "没有匹配的功能",
```

在它**下面**插入：

```ts
    placeholderShort: "问学根，或输入 / 查看功能",
    answerPlaceholder: "写下你的答案…",
    enterHint: "Enter 发送，Shift+Enter 换行",
    queueHint: "学根正在回答，可以继续输入，发出后排在这条回答之后。",
    cancelAnswer: "取消",
```

## 第 8 步：`skins/bear/composer.tsx` 整个文件替换为

```tsx
/**
 * Bear composer.
 *
 * One white card with a hairline border: an auto-growing field (1–8 lines) in
 * the body font, and a foot row with the session style as underlined text
 * options, the Enter hint, and a round send button (↑) that turns into ■ stop
 * while 学根 answers with nothing typed. Answering a 「检查理解」 question shows a
 * strip at the top of the card. Behaviour matches Chicago's: Enter sends,
 * Shift+Enter wraps, Escape stops an empty-field stream, the `/` menu takes
 * over arrows/Enter/Escape while open, a `/skill:` command inserts into the
 * field, and an unknown `/xxx` is never sent to the model.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { RadioGroup } from "radix-ui";
import { TEACHING_STYLE_LABELS } from "@shared/protocol.js";
import type { ComposerProps } from "../contract.js";
import { strings } from "../../core/strings.js";
import { isUnknownCommand } from "../../core/commands/commands.js";
import { SlashMenu } from "./slash-menu.js";

/** Ignore a second send click this soon after the first (double-click guard). */
const SEND_DEBOUNCE_MS = 600;
/** The field grows with its content up to this many lines, then scrolls. */
const MAX_LINES = 8;

function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M8 13V3M3.5 7.5 8 3l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function Composer({
  streaming,
  disabled,
  onSend,
  onStop,
  style,
  onStyle,
  commandsOpen,
  commandGroups,
  commands,
  selectedCommand,
  onSelectCommand,
  onRunCommand,
  onCloseCommands,
  onInput,
  answering,
  onCancelAnswer,
  focusRequest,
}: ComposerProps) {
  const [value, setValue] = useState("");
  // Set when the user submits a `/xxx` the menu does not know: nothing is sent,
  // and the card shows 「没有这个命令」.
  const [unknownCommand, setUnknownCommand] = useState(false);
  // Timestamp of the last send; a click within the debounce window is ignored.
  const lastSendAt = useRef(0);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus the field whenever core asks (「我来回答」 on an 「检查理解」 box). The
  // counter changes on every request, so a repeat request still focuses.
  useEffect(() => {
    if (focusRequest > 0) fieldRef.current?.focus();
  }, [focusRequest]);

  // Grow with the content, up to MAX_LINES; beyond that the field scrolls.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    const line = parseFloat(getComputedStyle(field).lineHeight) || 24;
    field.style.height = `${Math.min(field.scrollHeight, line * MAX_LINES)}px`;
  }, [value]);

  const hasText = value.trim().length > 0;

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text) return;
    // An unknown slash command is never sent to the model as ordinary prose.
    if (isUnknownCommand(text, commands)) {
      setUnknownCommand(true);
      return;
    }
    setUnknownCommand(false);
    const now = Date.now();
    if (now - lastSendAt.current < SEND_DEBOUNCE_MS) return;
    lastSendAt.current = now;
    onSend(text);
    setValue("");
    onInput("");
  }, [onSend, value, onInput, commands]);

  function runCommand(command: (typeof commands)[number]): void {
    if (command.command.startsWith("/skill:")) {
      setValue(`${command.command} `);
      onInput(`${command.command} `);
      return;
    }
    setValue("");
    onInput("");
    onRunCommand(command);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (commandsOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onSelectCommand(commands.length ? (selectedCommand + 1) % commands.length : 0);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        onSelectCommand(commands.length ? (selectedCommand - 1 + commands.length) % commands.length : 0);
        return;
      }
      if (event.key === "Enter" && commands[selectedCommand]) {
        event.preventDefault();
        runCommand(commands[selectedCommand]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseCommands();
        return;
      }
    }
    // Escape stops generation only when the field is empty and no `/` menu is
    // open, so it never swallows the menu's own Escape.
    if (event.key === "Escape" && streaming && !hasText) {
      event.preventDefault();
      onStop();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // With content, Enter queues a follow-up send — never a stop.
      if (hasText) submit();
    }
  }

  // The button is 停止 only when there is nothing to send; typing turns it back
  // into 发送, which queues the text as a follow-up while the answer streams.
  const showStop = streaming && !hasText;
  const sendDisabled = disabled || !hasText;
  const placeholder = disabled
    ? strings.input.placeholderDisabled
    : answering !== null
      ? strings.input.answerPlaceholder
      : strings.input.placeholderShort;

  return (
    <div className="bear-composer">
      {commandsOpen && (
        <SlashMenu
          groups={commandGroups}
          commands={commands}
          selected={selectedCommand}
          onSelect={onSelectCommand}
          onRun={runCommand}
        />
      )}
      {unknownCommand && (
        <div className="bear-cslash-hint" role="alert">
          {strings.commands.unknown}
        </div>
      )}
      <div className="bear-ccard">
        {answering !== null && (
          <div className="bear-answering" role="status">
            <span>{strings.content.answering(answering)}</span>
            {onCancelAnswer && (
              <button type="button" className="bear-answering-cancel" onClick={onCancelAnswer}>
                {strings.input.cancelAnswer}
              </button>
            )}
          </div>
        )}
        <textarea
          ref={fieldRef}
          className="bear-cinput"
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            setValue(event.target.value);
            setUnknownCommand(false);
            onInput(event.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={strings.input.placeholder}
        />
        <div className="bear-cfoot">
          <RadioGroup.Root
            className="bear-cstyles"
            value={style}
            orientation="horizontal"
            aria-label={strings.input.styleLabel}
            onValueChange={(next) => onStyle(next as typeof style)}
          >
            {TEACHING_STYLE_LABELS.map((entry) => (
              <RadioGroup.Item key={entry.id} value={entry.id} className="bear-cstyle" aria-label={entry.label}>
                {entry.label}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
          <span className="bear-chint">{strings.input.enterHint}</span>
          {showStop ? (
            <button type="button" className="bear-csend is-stop" aria-label={strings.input.stop} onClick={onStop}>
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              className="bear-csend"
              aria-label={strings.input.send}
              disabled={sendDisabled}
              onClick={submit}
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
      {streaming && <p className="bear-cstatus">{strings.input.queueHint}</p>}
    </div>
  );
}
```

## 第 9 步：`skins/bear/skin.css` 换掉旧输入区样式

9a. 删除从这一行开始：

```css
/* ── Composer. ────────────────────────────────────────────────────────────── */
```

到下面这条规则结束（含）的**全部内容**：

```css
[data-skin="bear"] .bear-send,
[data-skin="bear"] .bear-stop {
  font-size: 13px;
  color: var(--accent);
  padding-bottom: 0.2em;
}
```

然后在原位置粘贴：

```css
/* ── Composer (BE-5): one white card, auto-growing field, round send. ──── */

[data-skin="bear"] .bear-composer {
  flex: none;
  position: relative;
  padding: 0.6em 0 1.1em;
}
[data-skin="bear"] .bear-ccard {
  padding: 10px 12px 8px 14px;
  border: 1px solid var(--rule);
  border-radius: 10px;
  background: #fff;
  transition: border-color 120ms ease-out;
}
[data-skin="bear"] .bear-ccard:focus-within {
  border-color: #c4c8cc;
}
[data-skin="bear"] .bear-cinput {
  display: block;
  width: 100%;
  min-height: 1.75em;
  padding: 0;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  font-family: var(--font-body);
  font-size: var(--bear-body-size);
  line-height: 1.75;
  color: var(--ink);
  caret-color: var(--accent);
}
[data-skin="bear"] .bear-cinput:focus-visible {
  outline: none;
}
[data-skin="bear"] .bear-cinput::placeholder {
  color: #b3b8be;
}
[data-skin="bear"] .bear-cfoot {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 4px;
  font-size: 13px;
  line-height: 1;
}
[data-skin="bear"] .bear-cstyles {
  display: flex;
  gap: 12px;
}
[data-skin="bear"] .bear-cstyle {
  padding: 3px 0;
  color: var(--soft);
  box-shadow: inset 0 -1px 0 transparent;
  transition: color 120ms ease-out, box-shadow 120ms ease-out;
}
[data-skin="bear"] .bear-cstyle:hover {
  color: var(--ink);
}
[data-skin="bear"] .bear-cstyle[data-state="checked"] {
  color: var(--ink);
  box-shadow: inset 0 -1px 0 var(--ink);
}
[data-skin="bear"] .bear-chint {
  margin-left: auto;
  font-size: 12px;
  color: #b3b8be;
}
[data-skin="bear"] .bear-csend {
  flex: none;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  transition: background 120ms ease-out;
}
[data-skin="bear"] .bear-csend:disabled {
  background: var(--rule);
  color: #fff;
  opacity: 1;
}
[data-skin="bear"] .bear-csend.is-stop {
  background: var(--ink);
}
[data-skin="bear"] .bear-answering {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: -2px 0 4px;
  padding-left: 10px;
  border-left: 2px solid var(--accent);
  font-size: 13px;
  color: var(--accent);
}
[data-skin="bear"] .bear-answering-cancel {
  font-size: 12px;
  color: var(--soft);
}
[data-skin="bear"] .bear-answering-cancel:hover {
  color: var(--ink);
}
[data-skin="bear"] .bear-cslash-hint {
  margin: 0 0 0.4em;
  font-size: 13px;
  color: var(--danger);
}
[data-skin="bear"] .bear-cstatus {
  margin: 8px 2px 0;
  font-size: 12px;
  color: var(--soft);
}
```

9b. 在 `[data-skin="bear"] .bear-slash {` 这条规则里：把 `background: var(--paper);` 改为 `background: #fff;`，把 `border-radius: 4px;` 改为 `border-radius: 8px;`。这条规则的其他行不动。

## 第 10 步：只在必要时改 `composer.test.tsx`

先跑 `npx vitest run src/renderer/skins/bear`。如果 `composer.test.tsx` 有用例**只因为**以下原因失败，按对应方式改断言，不准做其他修改：
- 查找文字为 `strings.input.styleLabel`（「风格：」）的可见文本失败 → 改为 `getByRole("radiogroup", { name: strings.input.styleLabel })`。
- 断言发送/停止按钮的**文字内容**是「发送」「停止」→ 改为按 `getByRole("button", { name: strings.input.send / strings.input.stop })` 查找（按钮现在是图标 + aria-label）。
- 断言流式时空输入框的发送按钮可点击 → 现在空输入框时显示的是「停止」按钮，改为断言「停止」按钮存在。
其他原因的失败照实报告，不要改。

## 第 11 步：验收（必须自己跑，贴最后几行）

`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。

## 结束报告
第 1–10 步各自是否照做；第 10 步改了哪些断言（原文与改后）；任何偏离；所有命令结果。

## 执行记录（2026-11-05）
Devin 照清单执行，零偏离，第 10 步无需改测试。测试副本截图：输入卡与设计稿一致。用户正式窗口重载后实测用户那张对照图：第二列在第 2–7 行起点完全相同（879px），第 1 行多 1 列是学根原文多打了一个空格。
