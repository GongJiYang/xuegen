# UI-0：皮肤架构重构

先读：根目录 `AGENTS.md`、`apps/desktop/AGENTS.md`（第 12、13 节已改）、`docs/desktop/UI-ARCHITECTURE.md`（本批的设计依据，逐条实现）、`docs/desktop/skins/README.md`。

本批**只做架构**，不做任何视觉设计：交付 core 层、皮肤契约、登记表、`bare` 参照皮肤、切换与持久化、画廊、契约测试。Chicago 皮肤在 UI-1 实现。

## 1. 移除

- Tailwind、`@tailwindcss/vite`、shadcn（`components.json`、`src/renderer/components/ui/`、`lib/utils.ts`）、`class-variance-authority`、`clsx`、`tailwind-merge`、`lucide-react`、`tw-animate-css`、未使用的 `postcss`/`autoprefixer`。
- 旧动效：`motion/tokens.ts`、`hooks/use*Animation.ts`、`components/motion/`、`components/chat/motion-demo.ts`、`send-flight.ts`、`staggered-appear.ts`、`useStaggeredAppear.ts`、`render-sample.ts` 及开发模式演示按钮。暂时从依赖中移除 `gsap`、`@gsap/react`（UI-1 若需要由皮肤重新引入）。
- 相关测试一并删除或迁移；不得留下无引用文件。

## 2. 新建（按 UI-ARCHITECTURE.md 第 1 节的目录）

- `core/chat/`：迁移 `useChat`、`chat-reducer`（含测试），对外只暴露视图模型与回调。
- `core/content/`：Markdown 解析管线。把「内容是什么」在这里决定：GFM 表格、行内/块公式、代码块（按语言）、mermaid、Obsidian callout（`> [!question] 标题` → 检验题，`> [!note]`/`[!warning]` → 提示）。输出给皮肤的是带类型的节点，皮肤通过 `ContentRenderers` 渲染。保留 streamdown 做流式容错可以，但最终渲染出口必须走皮肤的 `ContentRenderers`。
- `core/motion/`：`MotionIntent`、`MotionPreset` 类型，`useMotion(intent, ref, deps)`，统一的减少动效判断；不依赖任何动画库。
- `core/settings/`：读写 `~/.xuegen/desktop.json`（`skin`、`bodyScale`），经主进程与 preload（在 `shared/` 增加对应 IPC 消息与类型守卫，主进程原子写入）。
- `core/strings.ts`：从现有 `strings.ts` 迁移，补齐所有插槽所需文案。
- `skins/contract.ts`、`skins/registry.ts`（懒加载）、`skins/bare/`（语义 HTML，无样式，实现全部插槽，包含「外观」切换入口）。
- `gallery/`：开发模式 `?gallery&skin=<id>`，用固定样例渲染全部插槽与内容样例（表格、公式、代码、mermaid、检验题、工具运行中/成功/失败、思考中、错误、未登录、空对话）。
- 快捷键：开发模式 `⌘⇧K` 循环切换皮肤。
- `App.tsx`：读取设置 → 设置 `<html data-skin>` → 加载皮肤 → 把 core 的视图模型交给 Shell。未知 id 或加载失败回退 `bare` 并显示 Notice。

## 3. 测试

- 契约测试：遍历登记表每个皮肤，渲染所有插槽样例，断言不抛错且按钮、输入框、对话框等角色存在（引入 `@testing-library/react` 与 `jsdom`，精确版本）。
- `core/content` 管线：每种内容类型至少 2 例，含不完整的流式 Markdown。
- `core/motion`：减少动效开启时不调用预设。
- `core/settings`：读写、非法文件回退默认值、未知皮肤 id 回退。
- 切换皮肤时 `useChat` 状态保持（测试层面验证控制器不随皮肤重建）。

## 4. 验收（实际运行并贴输出）

```sh
cd apps/desktop
npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run smoke
grep -rn "tailwind\|shadcn\|lucide\|gsap" src package.json   # 应无结果（注释除外）
node ../../bin/xuegen.mjs --version
```

- `npm run dev` 下打开 `?gallery&skin=bare`，用 `/Users/gjy/pi-learning/tools/record-page.mjs` 或 CDP 截一张全页图，**截图只用于你自检，不要保存进仓库**。
- 报告逐项说明；不 git commit。
