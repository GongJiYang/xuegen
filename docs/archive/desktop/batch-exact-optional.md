# 任务单：按 AGENTS.md 打开 exactOptionalPropertyTypes（DeepSeek，约 15 分钟）

背景：`apps/desktop/AGENTS.md` 第 33 行要求开启 `exactOptionalPropertyTypes`，但 `tsconfig.node.json` 里写着 `false`，`tsconfig.web.json` 没写（默认关）。实测打开后 node 侧 0 个错误、web 侧 13 个（全是「可选属性收到了 `undefined`」）。

只改：`apps/desktop/tsconfig.node.json`、`apps/desktop/tsconfig.web.json`，以及下面报错涉及的类型声明。**不改任何运行时行为和界面**（这是纯类型批次；界面相关工作暂停中，不许借机改样式或文案）。不碰 `~/.xuegen`、不启动 Electron、不提交。

## 步骤
1. `tsconfig.node.json`：`"exactOptionalPropertyTypes": false` → `true`。
2. `tsconfig.web.json`：在 `"noFallthroughCasesInSwitch": true,` 后面加 `"exactOptionalPropertyTypes": true,`。
3. `cd apps/desktop && npm run typecheck`，逐个修错误。**修法只用一种**：在被赋值的那个可选属性的**声明处**把类型改成 `prop?: T | undefined`（例：`sessionId?: string` → `sessionId?: string | undefined`；组件 props 里的 `onPlan?: (title: string) => void` → `onPlan?: ((title: string) => void) | undefined`；`warn?: string` → `warn?: string | undefined`）。不改调用处的逻辑，不用 `as`、`!`、`@ts-expect-error`。
   - 已知 13 处：`core/board/shell-panels.ts:102`、`core/chat/useChat.ts:122/135/143/148/190`（声明在 `shared/` 的 `HostToAgentMessage`，改那里的 `sessionId`）、`skins/bear/plan-progress.tsx:266`、`skins/bear/progress-groups.tsx:106/150/211`、`skins/bear/progress-panel.tsx:439`、`skins/bear/retry-line.test.tsx:65`、`skins/chicago/calendar-panel.tsx:87`。
   - 改 `shared/` 里的协议类型时，运行时校验函数（`isHostToAgentMessage` 等）若对 `undefined` 的处理与新类型不符，在报告里说明，不要改校验逻辑。
4. 全部通过后跑验收。

## 验收
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
```
贴出最后几行。报告：每处改了哪个声明。
