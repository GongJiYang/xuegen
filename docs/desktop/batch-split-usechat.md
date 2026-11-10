# batch-split-usechat（Devin）：把 `useChat.ts` 拆到 300 行以内——只搬类型，不改逻辑、不改外观

`apps/desktop/src/renderer/core/chat/useChat.ts` 现在 307 行，超过 AGENTS.md 的 300 行上限。用户已同意拆，条件：**只动结构，不动行为和外观**。做法定死：把 `ChatController` 接口（第 32–99 行左右，`export interface ChatController {` 到它的闭合 `}`）原样搬到新文件，`useChat.ts` 转出这个类型。

## 硬约束
- 只改 `src/renderer/core/chat/useChat.ts`、新建 `src/renderer/core/chat/chat-controller.ts`、改 `src/renderer/core/README.md` 一行。别的文件一律不动（**不改**任何 `import type { ChatController } from "../chat/useChat.js"` 的调用方——靠第 3 步的转出保持兼容）。
- 不改任何函数体、注释措辞、钩子顺序；不新增测试；不 commit/push、不加依赖、不放宽 eslint。另一批正在改 `src/agent/sandbox/**`，别碰。

## 步骤
1. 新建 `chat-controller.ts`：
   - 文件头注释：`/** The controller \`useChat\` returns; split out of useChat.ts to keep it under 300 lines. */`
   - 把 `ChatController` 接口**连同它上方紧贴的 JSDoc（如有）**逐字剪切过来，保持 `export interface ChatController`。
   - 补上它用到的类型 import（`import type { … } from "@shared/protocol.js";`、`import type { NoticeItem, ThreadNote } from "../../skins/contract.js";` 等，按接口里实际出现的类型取，只用 `import type`）。
2. `useChat.ts`：删掉原接口；在 import 区末尾加 `import type { ChatController } from "./chat-controller.js";`，紧接着加 `export type { ChatController } from "./chat-controller.js";`。删掉因此不再使用的类型 import（`tsc`/eslint 会指出是哪几个），**用到的一个都不删**。
3. `src/renderer/core/README.md` 第 14 行后加一行：`  - \`chat-controller.ts\`：\`useChat\` 返回的 \`ChatController\` 接口（从 useChat.ts 拆出，useChat.ts 仍转出它）。`
4. 跑 `npx prettier --write src/renderer/core/chat/useChat.ts src/renderer/core/chat/chat-controller.ts`。

## 验收命令（报告里贴输出）
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && wc -l src/renderer/core/chat/useChat.ts src/renderer/core/chat/chat-controller.ts && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/renderer 2>&1 | tail -4 && npm run build 2>&1 | tail -2 && git diff --stat
```
`useChat.ts` 必须 ≤ 300 行；`git diff --stat` 只能出现上面 3 个文件（新文件显示为未跟踪，另列 `git status --short src/renderer`）。

## 结束报告（中文，必须输出）
两个文件行数、删了哪些 import、验收输出。
