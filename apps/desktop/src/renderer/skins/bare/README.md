# bare — 参照皮肤（无样式）

契约测试与兜底用的皮肤：全部插槽以无样式语义 HTML 实现，不面向日常使用。

- `index.tsx`：全部 `SkinSlots`；「外观」入口是一个列出登记表全部皮肤的 `<select>`。
- `panels.tsx` / `progress-panel.tsx` / `panels-more.tsx`：五个工具窗与「今天」窗（`progress-panel.tsx` 另含「新课程」表单与「改计划」）。
- `content.tsx`：`ContentRenderers`，把每种内容节点渲染为语义 HTML（表格用 `<table>`、公式用 KaTeX、Mermaid 用 SVG，纯 Markdown 以 `<pre>` 原样显示）。
- 无样式表、无动效（`motion.run` 返回 null）。

不修改本皮肤即可新增皮肤；但如果契约新增插槽或字段，本皮肤必须同步实现，契约测试才会通过。
