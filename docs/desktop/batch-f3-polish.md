# F3 收尾：三处外观小问题（Claude 复验发现，Chicago 皮肤）

1. 错误消息与警告框里的「详情」前出现两个三角（`▸ ▸ 详情`）：浏览器自带的 `<summary>` 标记没隐藏，与自绘三角重复。只保留自绘的一个（`list-style: none` + `::-webkit-details-marker { display: none }`）。
2. 总进度：展开/收起三角 ▸/▾ 单独占了一行，应与课程名在同一行（三角在课程名左侧，课程名仍单行省略号）。
3. 阅读：到期标签「11月5日」被挤成两行，标签不换行（`white-space: nowrap; flex: none`），标题可换行。

验收：在真实 Electron（库副本 + 临时 XUEGEN_HOME）中量出三处（三角数量、三角与课程名的 `top` 相同、标签高度 = 单行高度），全部命令通过；不 git commit；只改 `apps/desktop/`；中文简要报告。
