# gallery — 皮肤画廊（开发模式）

`?gallery&skin=<id>` 用固定样例渲染全部插槽与内容类型（表格、公式、代码、Mermaid、检验题、工具运行中/成功/失败、思考中、错误、未登录、空对话），供视觉审查与截图。

- `samples.ts`：固定样例数据与覆盖各内容类型的 Markdown。
- `Gallery.tsx`：复用真实的皮肤插槽与 core 的 `MessageRenderer`，所见即应用实际渲染。

生产构建不渲染画廊（`import.meta.env.DEV` 门控）。
