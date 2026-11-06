# 批次 BE-11b：总控会话的小机器人头像（Bear 标题栏）

> 给 Devin（SWE-2）的**逐步执行清单**。按步骤原样做，不要自行设计；某一步做不到时停下，在报告里写清卡在哪一步、报错原文。

## 本批硬约束（压缩后也要记得）

1. 只改 / 新建这些文件：
   - 新建目录 `apps/desktop/src/renderer/skins/bear/vendor/grokbot-web/`：`grokbot-web.js`（第 1 步生成）、`grokbot-web.d.ts`、`LICENSE`、`SOURCE.txt`
   - 新建 `apps/desktop/src/renderer/core/board/bot-state.ts`、`bot-state.test.ts`
   - 新建 `apps/desktop/src/renderer/skins/bear/control-bot.tsx`
   - `apps/desktop/eslint.config.mjs`（只在 ignores 里加一项）
   - `apps/desktop/src/renderer/skins/contract.ts`、`App.tsx`、`skins/bear/shell.tsx`、`skins/bear/skin.css`
   - 第 5 步说明的「补字段」：typecheck 报 `ShellProps` 缺 `control` 的文件（只在那些文件里补 `control: null`）
   - `docs/desktop/skins/bear.md`（加一行）
   其他文件一律不动。**不要**改 vendor 里生成的 `grokbot-web.js` 的内容。
2. 不加 npm 依赖（grokbot-web 不在 npm 上，按第 1 步从已下载并审查过的源码打包）。
3. 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 `git commit` / `git push`。
4. 不加 `eslint-disable`、`@ts-ignore`、`any`。`App.tsx` ≤ 450 行（现在 441，本批只加 1 行）。

## 先读

`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/skins/bear.md`；`renderer/core/board/use-control-session.ts`（上一批）、`core/board/cycle-today.ts`、`skins/contract.ts` 的 `ShellProps`、`skins/bear/shell.tsx` 标题那一行（`bear-title`）。

grokbot-web（BSD-3，移植自 nasawz/GrokBot）的源码已下载并由 Claude 审查过（无网络请求、无 eval），位置：
`/tmp/grokbot-dl.BYKY/x/Coiggahou2002-grokbot-web-616c1dd/`（提交 `616c1dd451f105a10a903e01eed8f82370968681`）。它的 TypeScript 过不了本项目的严格检查（`noUncheckedIndexedAccess`），所以**不拷源码**，而是打包成一个 JS 文件，配一份手写的最小类型声明。

## 步骤

### 第 1 步：打包 vendor

在 `apps/desktop` 目录下依次执行：

```sh
mkdir -p src/renderer/skins/bear/vendor/grokbot-web
node_modules/.bin/esbuild /tmp/grokbot-dl.BYKY/x/Coiggahou2002-grokbot-web-616c1dd/src/react.tsx \
  --bundle --format=esm --target=es2022 --jsx=automatic \
  --external:react --external:react/jsx-runtime --legal-comments=inline \
  --outfile=src/renderer/skins/bear/vendor/grokbot-web/grokbot-web.js
cp /tmp/grokbot-dl.BYKY/x/Coiggahou2002-grokbot-web-616c1dd/LICENSE src/renderer/skins/bear/vendor/grokbot-web/LICENSE
grep -c "GrokBotView" src/renderer/skins/bear/vendor/grokbot-web/grokbot-web.js
grep -cE "fetch\(|XMLHttpRequest|eval\(|new Function" src/renderer/skins/bear/vendor/grokbot-web/grokbot-web.js
```

最后两条：第一条应 ≥ 1，第二条应为 0。若第二条不为 0 或 esbuild 报错，停下报告。

### 第 2 步：新建 `vendor/grokbot-web/SOURCE.txt`，原样如下

```
grokbot-web — animated avatar used by the Bear skin's 总控 title (BE-11b).

Upstream: https://github.com/Coiggahou2002/grokbot-web
Commit:   616c1dd451f105a10a903e01eed8f82370968681
License:  BSD-3-Clause (see LICENSE); a port of nasawz/GrokBot.
Not published on npm. The TypeScript sources do not pass this project's strict
checks, so they are bundled instead of copied:

  node_modules/.bin/esbuild <upstream>/src/react.tsx --bundle --format=esm \
    --target=es2022 --jsx=automatic --external:react \
    --external:react/jsx-runtime --legal-comments=inline \
    --outfile=src/renderer/skins/bear/vendor/grokbot-web/grokbot-web.js

grokbot-web.d.ts is hand-written and declares only what Xuegen uses.
Do not edit grokbot-web.js; rebuild it from a reviewed upstream commit.
```

### 第 3 步：新建 `vendor/grokbot-web/grokbot-web.d.ts`，原样如下

```ts
// Hand-written types for the bundled grokbot-web (only what Xuegen uses). See SOURCE.txt.
import type { CSSProperties, ForwardRefExoticComponent, RefAttributes } from "react";

export type GrokBotState = "idle" | "thinking" | "working" | "notifying" | "sleeping";

export type GrokBotShape = "blob";

export interface GrokBotTheme {
  bodyColor: string;
  eyeColor: string;
  guideColor: string;
  centroidColor: string;
  badgeColor: string;
  particleColor: string;
}

export interface GrokBotProps {
  state?: GrokBotState;
  shape?: GrokBotShape;
  size?: number | "auto";
  autoBlink?: boolean;
  autoExpression?: boolean;
  theme?: Partial<GrokBotTheme> | null;
  respectReducedMotion?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export interface GrokBotHandle {
  blink(): Promise<void>;
  reset(): void;
}

export declare const GrokBotView: ForwardRefExoticComponent<GrokBotProps & RefAttributes<GrokBotHandle>>;
```

### 第 4 步：`eslint.config.mjs`

把 `{ ignores: ["out/**", "node_modules/**", "*.tsbuildinfo"] },` 改为：

```js
  // Bundled third-party code (see its SOURCE.txt) is not ours to lint, like node_modules.
  { ignores: ["out/**", "node_modules/**", "*.tsbuildinfo", "src/renderer/skins/bear/vendor/**/*.js"] },
```

（只忽略打包出的 `.js`；手写的 `.d.ts` 仍受检查。）

### 第 5 步：新建 `core/board/bot-state.ts`，原样如下

```ts
/**
 * The 总控 avatar's mood (BE-11b).
 *
 * While the 总控 session is open its avatar shows what 学根 is doing: thinking
 * while it answers, working while a tool runs, notifying when a lesson was
 * missed, sleeping on a rest day, idle otherwise. Pure: everything is an argument.
 */

import type { CycleDay } from "@shared/data-protocol.js";
import type { ChatMessage } from "@shared/protocol.js";
import type { AsyncState } from "./state.js";

export type BotMood = "idle" | "thinking" | "working" | "notifying" | "sleeping";

/** What the shell needs to draw the 总控 avatar. */
export interface ControlView {
  mood: BotMood;
}

/** True while the newest message has a tool call still running. */
export function toolRunning(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  return last !== undefined && last.toolCalls.some((call) => call.status === "running");
}

export function botMood(streaming: boolean, runningTool: boolean, day: CycleDay | null): BotMood {
  if (streaming) return runningTool ? "working" : "thinking";
  if (day && day.overdue.length > 0) return "notifying";
  if (day?.type === "休息") return "sleeping";
  return "idle";
}

/** The avatar view while the 总控 session is open; null in any other session. */
export function controlView(
  isControl: boolean,
  streaming: boolean,
  messages: ChatMessage[],
  today: AsyncState<CycleDay>,
): ControlView | null {
  if (!isControl) return null;
  const day = today.status === "ready" ? today.value : null;
  return { mood: botMood(streaming, toolRunning(messages), day) };
}
```

### 第 6 步：新建 `core/board/bot-state.test.ts`，原样如下

```ts
import { describe, expect, it } from "vitest";
import type { CycleDay } from "@shared/data-protocol.js";
import type { ChatMessage } from "@shared/protocol.js";
import { botMood, controlView, toolRunning } from "./bot-state.js";

function day(overrides: Partial<CycleDay>): CycleDay {
  return {
    date: "2026-11-09",
    weekday: "周一",
    cycle: "C1",
    week: 1,
    type: "深度",
    course: "epp",
    names: {},
    lessons: [],
    overdue: [],
    ...overrides,
  };
}

function message(status: "running" | "success" | null): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    markdown: "",
    streaming: status === "running",
    toolCalls: status ? [{ toolCallId: "t1", toolName: "bash", argsSummary: "", status }] : [],
  };
}

describe("botMood", () => {
  it("thinks while answering and works while a tool runs", () => {
    expect(botMood(true, false, null)).toBe("thinking");
    expect(botMood(true, true, null)).toBe("working");
  });
  it("notifies about missed lessons, sleeps on a rest day, idles otherwise", () => {
    expect(botMood(false, false, day({ overdue: [{ course: "epp", id: "D1", content: "Ch1", date: "2026-11-06" }] }))).toBe("notifying");
    expect(botMood(false, false, day({ type: "休息", course: null }))).toBe("sleeping");
    expect(botMood(false, false, day({}))).toBe("idle");
    expect(botMood(false, false, null)).toBe("idle");
  });
});

describe("toolRunning and controlView", () => {
  it("looks at the newest message's tool calls", () => {
    expect(toolRunning([message("running")])).toBe(true);
    expect(toolRunning([message("running"), message("success")])).toBe(false);
    expect(toolRunning([])).toBe(false);
  });
  it("is null outside the 总控 session", () => {
    expect(controlView(false, true, [], { status: "loading" })).toBeNull();
    expect(controlView(true, false, [], { status: "ready", value: day({ type: "休息", course: null }) })).toEqual({ mood: "sleeping" });
    expect(controlView(true, false, [], { status: "loading" })).toEqual({ mood: "idle" });
  });
});
```

### 第 7 步：契约与 App

1. `skins/contract.ts`：
   - import 区（`import type { ProgressGroups } …` 之后）加 `import type { ControlView } from "../core/board/bot-state.js";`
   - `ShellProps` 里 `sessionTitle` 那一项（连同注释）之后加：
     ```ts
       /** The 总控 avatar while the 总控 session is open; null in any other session. */
       control: ControlView | null;
     ```
2. 跑 `npm run typecheck`：凡是报 `ShellProps` 字面量缺 `control` 的地方（画廊、测试样例等），在其 `sessionTitle` 那一项之后补 `control: null,`。只做这一种补法。
3. `App.tsx`：
   - import 区 `import { useControlSession } …` 之后加 `import { controlView } from "./core/board/bot-state.js";`
   - `shellProps` 里 `sessionTitle: …,`（整个多行表达式）之后加一行：
     ```ts
         control: controlView(control.isControl, controller.streaming, controller.messages, cycle.today.state),
     ```
   - `wc -l App.tsx` ≤ 450。

### 第 8 步：新建 `skins/bear/control-bot.tsx`，原样如下

```tsx
/**
 * The 总控 avatar in the Bear title bar: grokbot-web's blob in ink, 22px, its
 * state following 学根 (see core/board/bot-state). Decorative: the title text
 * next to it already says 「总控 · C1」.
 */

import type { BotMood } from "../../core/board/bot-state.js";
import { GrokBotView } from "./vendor/grokbot-web/grokbot-web.js";

/** Ink body, paper eyes: the avatar must not compete with the one accent colour. */
const INK = { bodyColor: "#1f2124", eyeColor: "#fbfbfa", badgeColor: "#1f2124", particleColor: "#1aa3ff" };

export function ControlBot({ mood }: { mood: BotMood }) {
  return (
    <span className="bear-bot" aria-hidden="true">
      <GrokBotView state={mood} shape="blob" size={22} autoExpression theme={INK} />
    </span>
  );
}
```

### 第 9 步：`skins/bear/shell.tsx` 标题前放头像

1. import 区加 `import { ControlBot } from "./control-bot.js";`
2. 把
   ```tsx
           {!focusMode && <span className="bear-title">{props.sessionTitle ?? strings.chat.freeSession}</span>}
   ```
   改为
   ```tsx
           {!focusMode && (
             <span className="bear-title">
               {props.control && <ControlBot mood={props.control.mood} />}
               {props.sessionTitle ?? strings.chat.freeSession}
             </span>
           )}
   ```

### 第 10 步：`skins/bear/skin.css` 末尾追加

```css
/* 总控 avatar in the title bar (BE-11b). */
[data-skin="bear"] .bear-bot {
  display: inline-flex;
  vertical-align: -6px;
  margin-right: 6px;
}
[data-skin="bear"] .bear-bot canvas {
  display: block;
}
```

### 第 11 步：`docs/desktop/skins/bear.md`

在槽位表（或说明 Shell 标题栏的那一行）之后加一行说明：
`- 总控会话时标题前有 22px 墨色小机器人（grokbot-web，打包在 skins/bear/vendor/，见其 SOURCE.txt）；状态：回答中「思考」、调工具「动手」、有没学的课「提醒」、休息日「休息」、其余「待命」。`

## 完成标准（可观察）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && wc -l apps/desktop/src/renderer/App.tsx && ls apps/desktop/src/renderer/skins/bear/vendor/grokbot-web
cd /Users/gjy/pi-learning/xuegen && git status --short apps/desktop
```

- 贴出每条输出的最后 15 行。`bot-state.test.ts` 的 5 个用例通过，原有测试全部仍通过；`App.tsx` ≤ 450；vendor 目录有 4 个文件。
- 若某个断言与实际行为不符：先不要改测试或代码去迁就，在报告里写出失败的断言、实际值和你判断的原因，停下。

## 结束报告

列出：改了 / 新建了哪些文件（第 7 步补字段的文件单独列出）；第 1 步两条 grep 的输出；每一步是否照做；偏离之处及原因；未完成项；`App.tsx` 行数。
