# 桌面版工程规范

适用于 `apps/desktop/` 下的全部代码。设计边界见 `docs/desktop/ARCHITECTURE.md`；本文件规定代码怎么写。违反规范的代码视为未完成。

## 1. 分层与依赖方向

```text
renderer ──▶ preload API ──▶ main ──▶ agent ──▶ Pi SDK
     └────────────┴──────────┴────────┴──▶ shared（纯类型与纯函数）
```

- 依赖只能沿箭头方向。`shared/` 不依赖任何其他目录，也不依赖 Node / Electron / React。
- **Pi SDK 只允许在 `src/agent/` 中 import**。其他目录看到的只有 `shared/` 定义的消息类型（端口/适配器：agent 是 Pi 的适配器）。
- **Electron 只允许在 `src/main/` 与 `src/preload/` 中 import**。渲染进程不使用 Node、Electron 模块或 `window.require`。
- 组件不直接调用 `window.xuegen`（preload API），统一经 `renderer/` 下的一个客户端模块，便于替换与测试。

## 2. 函数式核心，命令式外壳

- 把决策逻辑写成**纯函数**放在可测试的位置：Pi 事件 → 协议消息的映射、对话状态 reducer、渲染器注册表查找、（第 2 批）课程文件解析。
- 副作用（IPC、文件、进程、定时器）只出现在外壳：`main/` 的入口与守护、`agent/` 的会话驱动、React 的 effect。
- 纯函数不读环境变量、不读时间、不访问全局状态；需要时作为参数传入。

## 3. 消息协议（`shared/`）

- 进程间消息全部在 `shared/` 用 TypeScript **可辨识联合**（`type` 字段）定义，三端共用同一份。
- 处理联合类型的 `switch` 必须穷尽，默认分支用 `assertNever(x: never)`。
- 新增消息的顺序：先改 `shared/` 类型 → 再改发送端 → 再改接收端。
- IPC 通道名集中定义为常量，不在各处手写字符串。
- 跨进程边界的入参在接收端做运行时校验（手写类型守卫即可，不为此引入大型校验库）。

## 4. TypeScript

- `strict: true`，并开启 `noUncheckedIndexedAccess`、`noImplicitOverride`、`exactOptionalPropertyTypes`。
- 禁止 `any`（用 `unknown` + 类型守卫）；禁止 `@ts-ignore`；`!` 非空断言仅在有注释说明时使用。
- 只用具名导出，不用 `export default`。
- 公共函数显式写返回类型。

## 5. 命名与文件

| 对象           | 规则                          | 例                         |
| -------------- | ----------------------------- | -------------------------- |
| React 组件文件 | PascalCase，每文件一个组件    | `MessageList.tsx`          |
| 其他模块文件   | kebab-case                    | `event-mapper.ts`          |
| 类型、组件     | PascalCase                    | `AgentEvent`               |
| 函数、变量     | camelCase，动词开头表示动作   | `mapPiEvent`、`sendPrompt` |
| 常量           | UPPER_SNAKE_CASE              | `IPC_CHANNELS`             |
| 测试           | 与被测文件同目录，`*.test.ts` | `event-mapper.test.ts`     |

- 单文件不超过 300 行，单函数不超过 50 行；超过就拆分。
- 每个目录保留 `README.md`，职责变化时同步更新。
- 不建 `utils/`、`helpers/`、`common/` 这类杂物目录；函数放在使用它的模块旁边，被多处使用再上移到 `shared/`。
- 皮肤目录内的第三方资源（字体、图标、CSS）保留其原始文件名。

## 6. 可读性

- 名字说清意图，不用缩写（`message` 而非 `msg`，循环变量除外）。
- 注释用英文，解释**为什么**，不复述代码做了什么。非显然的约束（例如「环境变量必须在 import Pi 之前设置」）必须注释。
- 早返回，避免三层以上嵌套。
- 不留注释掉的代码、`console.log` 调试输出、无主 TODO（TODO 必须写明批次，如 `TODO(batch-2): ...`）。
- 界面文案集中在 `renderer/strings.ts`，组件内不写散落的中文字符串。

## 7. 错误处理

- 不静默吞错：每个 `catch` 要么转换成协议里的错误消息上报界面，要么带上下文重新抛出。
- 错误消息给用户看得懂的中文说明，并保留原始错误信息供排查。
- agent 进程崩溃由 main 捕获、上报、可重启；渲染进程显示状态，不白屏。
- 不在日志、错误消息或 IPC 中输出凭据。

## 8. React

- 函数组件 + hooks。对话状态用 `useReducer`，reducer 是纯函数并有单元测试。
- 第 1 批不引入全局状态库；确有跨面板共享需求时再评估。
- 组件只负责展示与交互；数据转换放到纯函数里。
- 流式渲染注意性能：只更新正在流式输出的那条消息。

## 9. 依赖

- 版本精确锁定（不用 `^`、`~`），提交 lock 文件。
- 优先使用规格中已选定的库；新增任何依赖都要在报告里说明理由。
- 不引入与已有库功能重复的依赖。

## 10. 安全

- `BrowserWindow`：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`。
- preload 只暴露最小、类型化的方法，不暴露 `ipcRenderer` 本身。
- 外部链接用 `shell.openExternal` 打开，并拦截应用内导航。
- 渲染 Markdown 时不执行模型生成的脚本；不使用 `dangerouslySetInnerHTML` 渲染未净化的内容。
- 课程状态文件（`wiki/courses/*.md`）在界面中只读，不提供任何写入路径。

## 11. 测试

- 工具：Vitest。
- 必测：所有纯函数模块（事件映射、reducer、注册表、解析器）。覆盖正常路径、边界与错误输入。
- 不为 Electron 窗口或 React 布局写脆弱的快照测试。
- smoke 脚本验证与 Pi 的集成，但不发送模型请求、不产生费用。

## 12. 界面：可替换皮肤

界面会频繁更换，必须遵守 `docs/desktop/UI-ARCHITECTURE.md`：

- 逻辑、数据、文案、内容解析放 `src/renderer/core/`，**不含任何样式**；每套界面是 `src/renderer/skins/<id>/` 下的一个皮肤，实现 `skins/contract.ts` 的全部插槽。
- 取「今天 / 现在的日期」统一用 `core/today.ts` 的 `now()` / `todayKey()`，不直接 `new Date()`（`new Date().getTimezoneOffset()` 与计时用的 `Date.now()` 除外）；测试窗口可设 `XUEGEN_TODAY=YYYY-MM-DD` 指定日期、`XUEGEN_ANKI_URL`（假 AnkiConnect，仅本机回环地址），不设时与本机日期、默认 AnkiConnect 地址一致。
- `core` 不得 import 皮肤；皮肤之间互不 import；皮肤不得自带文案（只用 `core/strings.ts`）。
- 皮肤样式全部限定在 `[data-skin="<id>"]` 作用域下；不使用全局样式框架（Tailwind、shadcn 已移除）。第三方 CSS 随皮肤懒加载并加作用域前缀。
- 每套皮肤必须命名并登记在 `docs/desktop/skins/README.md`，设计规范写在 `docs/desktop/skins/<id>.md`；实现以该文档为准，视觉改动升皮肤版本号。
- 新增插槽或视图模型字段时，`bare` 参照皮肤必须同步实现，契约测试才能通过。
- 整体风格原则：**极简、专注阅读**。不使用 AI 默认套路（紫蓝渐变、居中大标题、三列卡片、圆角加柔和阴影、全大写小标签）。

## 13. 动效：意图与预设

- 组件只通过 `core/motion` 的 `useMotion(intent, ref, deps)` 声明「发生了什么」（appear、confirm、busy、expand、collapse、progress、alert），**不直接调用动画库**。
- 「怎么动」由皮肤的 `MotionPreset` 决定；各皮肤的具体动效写在其设计文档中。GSAP 只允许在皮肤内部使用，且必须遵守已安装的官方 gsap skills。
- 动效只做细节微交互：不做入场编排、不做滚动驱动的装饰动画、不做视差。
- 减少动效由 core 统一判断：开启时不调用预设，元素直接处于终态，持续性动画不启动。
- 流式输出的文字不做逐字动画。

## 14. 完成定义

每一批交付前，以下命令全部通过并在报告中贴出输出：

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke
```

- ESLint + Prettier 配置随项目提交；lint 零错误、零警告。
- 根目录 `node bin/xuegen.mjs --version` 仍正常。
- `git status` 只出现本批范围内的文件。
