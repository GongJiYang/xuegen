# 界面架构：可替换的皮肤（Skin）

目标：界面会频繁更换。换一套 UI 只新增一个皮肤目录，不改动对话逻辑、协议、状态与数据；运行时可在菜单中切换，切换时对话状态不丢失。

## 1. 分层

```text
src/renderer/
├── core/                    皮肤无关：逻辑、数据、文案、内容解析（不得包含任何样式）
│   ├── chat/                useChat、chat-reducer（纯函数）、事件 → 视图模型
│   ├── board/               课程 / 阅读 / 卡片的视图模型（第 2 批起）
│   ├── content/             Markdown 解析管线（remark/rehype 插件、callout 识别、代码块语言 → 内容类型）
│   ├── motion/              动效意图 API（见第 4 节），减少动效判断
│   ├── settings/            界面设置（当前皮肤、正文字体与字号），经 preload 读写
│   └── strings.ts           全部界面文案（皮肤共享，皮肤不得自带文案）
├── skins/
│   ├── contract.ts          皮肤契约：类型定义（唯一真相源）
│   ├── registry.ts          皮肤登记表：id → 懒加载函数
│   ├── bare/                参照皮肤：无样式的语义 HTML，用于契约测试与兜底
│   └── chicago/             第一套设计皮肤（经典 Mac OS 黑白像素）
├── gallery/                 皮肤画廊：用固定样例渲染每个插槽，供视觉审查与截图
└── App.tsx                  只做：读取设置 → 加载皮肤 → 把 core 的数据交给皮肤
```

依赖方向：`skins/* → core`，`core` 不得 import 任何皮肤；皮肤之间互不 import。

## 2. 皮肤契约（`skins/contract.ts`）

```ts
export interface SkinDefinition {
  id: string;            // kebab-case，永不复用，例如 "chicago"
  name: string;          // 展示名，例如 "Chicago"
  version: string;       // 皮肤自身版本，改视觉就升版本
  description: string;   // 一句话风格说明
  load(): Promise<SkinModule>;   // 懒加载：样式与组件只在选中时加载
}

export interface SkinModule {
  stylesheet?: () => Promise<unknown>;   // import("./skin.css")，作用域见第 3 节
  slots: SkinSlots;
  motion: MotionPreset;                   // 见第 4 节
  content: ContentRenderers;              // 表格、代码块、公式、mermaid、callout 的呈现
}

export interface SkinSlots {
  Shell: ComponentType<ShellProps>;             // 整体布局与菜单（必须提供「外观」切换入口）
  Thread: ComponentType<ThreadProps>;           // 对话流容器
  UserMessage: ComponentType<UserMessageProps>;
  AssistantMessage: ComponentType<AssistantMessageProps>;
  ToolActivity: ComponentType<ToolActivityProps>;
  Thinking: ComponentType<ThinkingProps>;
  Exercise: ComponentType<ExerciseProps>;       // > [!question] 检验题
  Composer: ComponentType<ComposerProps>;
  ModelPicker: ComponentType<ModelPickerProps>;
  Notice: ComponentType<NoticeProps>;           // 错误 / 提示（含未登录、未同步）
  BoardPanel: ComponentType<BoardPanelProps>;   // 第 2 批前可为占位
  NotesPanel: ComponentType<NotesPanelProps>;   // 第 3 批前可为占位
}
```

规则：

- 所有 `*Props` 只包含 core 提供的视图模型与回调，不含任何样式参数。新增插槽或字段时，`bare` 皮肤必须同步实现，否则契约测试失败。
- 皮肤内部可以自由拆分组件，但只通过 `SkinModule` 对外暴露。
- 文案一律来自 `core/strings.ts`；皮肤只决定怎么呈现。
- 内容管线（是否为表格、公式、检验题）在 core 解析一次，皮肤只渲染结果，保证换皮后内容语义不变。

## 3. 样式隔离

- core 不使用任何样式框架。全局只有极小的 reset。**移除 Tailwind 与 shadcn**（它们的全局 preflight 会和皮肤样式冲突）。
- 每个皮肤的样式限定在根节点作用域下：`<html data-skin="chicago">`，皮肤 CSS 的所有选择器都以 `[data-skin="chicago"]` 开头（用 PostCSS 自动加前缀或手写，二选一并在皮肤文档中注明）。
- 皮肤自带的字体、图标、第三方 CSS（如 system.css）放在皮肤目录内，随皮肤懒加载。第三方 CSS 若有全局选择器，必须在导入时加作用域前缀。
- 切换皮肤 = 改 `data-skin` + 加载新皮肤模块；旧样式因作用域不再生效。

## 4. 动效：意图与预设分离

core 只声明「发生了什么」，皮肤决定「怎么动」：

```ts
export type MotionIntent =
  | "appear"     // 新元素出现（消息、窗口、对话框）
  | "confirm"    // 操作确认（按钮按下、选择菜单项）
  | "busy"       // 进行中（思考、工具运行）
  | "expand" | "collapse"
  | "progress"   // 数值变化（进度、计数）
  | "alert";     // 出错

export interface MotionPreset {
  run(intent: MotionIntent, target: Element, detail?: MotionDetail): MotionHandle; // 可取消
}
```

- 组件统一通过 `useMotion(intent, ref, deps)` 触发，不直接调用 GSAP 或写 CSS 动画。
- 减少动效（`prefers-reduced-motion`）在 core 统一判断：开启时 core 不调用预设的 `run`，直接让元素处于终态；`busy` 改为静态指示。
- 动效库只在皮肤内部使用（GSAP 可选），core 不依赖 GSAP。
- 原则：**整体极简、专注阅读**；动效只用于细节的微交互，不做入场编排、不做滚动驱动的装饰动画。

## 5. 切换与持久化

- 设置保存在 `~/.xuegen/desktop.json`（`{ "skin": "chicago", "bodyFont": "pixel", "bodyScale": 2 }`），由主进程读写，经 preload 暴露 `getSettings/setSettings`；渲染进程不直接访问文件。
- 入口：每个皮肤的 Shell 必须提供「外观」菜单或等价入口，列出登记表中的全部皮肤。开发模式另有快捷键 `⌘⇧K` 循环切换。
- 切换不重建 core 状态：`useChat` 等控制器位于皮肤之上，切换只替换呈现层。
- 未知或加载失败的皮肤 id：回退到 `bare` 并显示提示，不白屏。

## 6. 质量保障

- **契约测试**：遍历登记表中每个皮肤，用固定样例渲染所有插槽（jsdom + React Testing Library），断言不抛错、关键可访问性角色存在（按钮、输入框、对话框等）。
- **画廊**：开发模式 `?gallery&skin=<id>` 渲染全部插槽与内容样例（表格、公式、代码、mermaid、检验题、工具运行中/成功/失败、错误、空状态）。验收截图在这里拍。
- **新皮肤的完成定义**：契约测试通过；画廊中每个插槽都有设计；`docs/desktop/skins/<id>.md` 写明风格、令牌、组件映射与微交互；在 `skins/README.md` 登记。

## 7. 命名

每套界面都有名字，登记在 `docs/desktop/skins/README.md`：id 一经使用不再复用；视觉改动升版本号；退役的皮肤保留登记记录（标注「已退役」）但可删除代码。
