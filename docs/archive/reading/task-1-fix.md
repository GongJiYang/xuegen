# 渐进阅读 · 任务 1 修复：frontmatter 引号

## 问题

`add` 写入 `source: "[[raw/...]]"`（带引号），但 `review`/`pause`/`resume` 解析后丢掉引号，写回成 `source: [[raw/...]]`。YAML 中未加引号的 `[[...]]` 会被解析为嵌套列表，Obsidian 属性面板显示错误、链接失效。另外 `quoted()` 不转义，`position` 含双引号时会写出非法 YAML。

## 要求

1. 渲染时 `source` 与 `position` 两个字符串字段**始终**加双引号（空值仍为 `""`），并转义值中的 `\` 与 `"`；解析时对应反转义。
2. 其他已知字段（`priority`、`status`、`due`、`interval_days`、`last_read`）保持不加引号；未知键原样保留。
3. 在 `skills/reading/reading-queue.test.mjs` 增加测试：
   - add → review next → pause → resume 后，`source` 行仍匹配 `/^source: "\[\[.*\]\]"$/`；
   - `position` 含双引号和反斜杠时多次往返不变，且文件中该行的引号被正确转义。
4. 运行 `npm test` 并贴出输出。

只改 `skills/reading/reading-queue.mjs` 与其测试文件。不 git commit，不碰 `apps/desktop/`。中文简短报告。
