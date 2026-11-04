# renderer — 界面（React，沙箱）

界面由「可替换皮肤」构成，逻辑与外观分离。设计见 `docs/desktop/UI-ARCHITECTURE.md`。

```text
src/renderer/
├── core/        皮肤无关：逻辑、数据、文案、内容解析（不含任何样式）
│   ├── chat/    useChat、chat-reducer（纯函数）、消息 → 插槽的粘合、视图模型
│   ├── content/ Markdown 解析管线：类型化内容节点 + 分类
│   ├── motion/  动效意图 API（MotionIntent / MotionPreset / useMotion），减少动效判断
│   ├── settings/ 界面设置（皮肤、正文字号），经 preload 读写
│   ├── client.ts preload 桥的唯一入口
│   └── strings.ts 全部界面文案（皮肤共享）
├── skins/       皮肤契约、登记表、bare 参照皮肤
├── gallery/     皮肤画廊（开发模式 ?gallery&skin=<id>）
└── App.tsx      只做：读设置 → 设置 data-skin → 加载皮肤 → 把 core 数据交给 Shell
```

依赖方向：`skins/* → core`，`core` 不 import 任何皮肤，皮肤之间互不 import。

- **样式**：全局只有 `index.css` 的极小 reset；皮肤样式限定在 `[data-skin="<id>"]` 下，懒加载。
- **文案**：全部来自 `core/strings.ts`，皮肤不写死字符串。
- **动效**：组件只声明意图（`useMotion`），「怎么动」由皮肤的 `MotionPreset` 决定；core 不依赖任何动画库。减少动效时 core 不调用预设。
- **内容**：core 解析一次（表格、公式、代码块、Mermaid、Obsidian callout），皮肤只渲染结果。
- **开发模式**：`?gallery&skin=<id>` 渲染画廊；`⌘⇧K` 循环切换皮肤。
