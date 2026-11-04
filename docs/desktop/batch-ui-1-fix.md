# UI-1 修复

Claude 在 `?gallery&skin=chicago` 用真实时间截图（CDP，等待 4 秒）复验，发现以下问题。黑白像素统计无法发现它们（坏掉的公式也是黑白的），所以每项都要**看截图**确认。

## 问题与根因

1. **公式全部坏掉**。块公式显示成 `n=1∑∞n21 = 6π2` 平铺；行内公式显示成 `E=mc2E=mc^2E=mc2`（三份重复）。
   - 根因 a：KaTeX 样式表从未加载（运行时检查 `document.styleSheets` 中没有任何 `.katex .vlist` 规则）。Chicago 皮肤懒加载时须一起导入 `katex/dist/katex.min.css`，并保留 `-webkit-font-smoothing: none`。
   - 根因 b：`core/content/markdown-to-hast.ts` 中 `rehype-sanitize` 排在 `rehype-katex` **之后**，把 KaTeX 的 `class`、`style`、MathML 全剥掉了。改为 remark-math → remark-rehype → **rehype-sanitize → rehype-katex**（先清洗用户内容，再排版受信任的 KaTeX 输出）。注意 sanitize 默认会去掉 remark-math 产生的 `math-inline`/`math-display` 类名，需在 schema 中放行这两个类名，否则 rehype-katex 找不到公式。补测试：行内公式输出含 `class="katex"`；`<script>` 等原始 HTML 仍被去掉。
2. **画廊正文贴着窗口左边框**，没有设计稿的左右 24px 内边距。`.chicago-chat > .chicago-pane` 的规则在画廊结构下不命中（画廊中 pane 的父元素没有 `chicago-chat`）。让对话正文区的内边距不依赖父结构；真实对话视图与画廊都要有。
3. **画廊一打开就弹出「会话已中断」模态警告框**，盖住了用户消息样例（用户消息其实在，被挡住了）。画廊中的 Notice 样例必须**原位渲染**（警告框外观，但不是全局模态、不带遮罩）；真实应用中出错时仍按 chicago.md 用模态警告框。
4. **画廊不能滚动**：内容超出 800px 后无法到达（字符图、提示、注意等样例在视口外）。对话窗口内的 pane 要能滚动。
5. **mermaid 箭头方向错**：竖直向下的连线末端画成了朝左的 `◀`，应为朝下的 `▼`（朝右的连线用 `▶`）。按连线最后一段的方向选箭头；保持 crispEdges 与 0 灰。对照设计稿 `/Users/gjy/pi-learning/design/chicago/index.html` 中的「本周主题图」。

## 验收（实际运行并贴输出）

- UI-0/UI-1 全部命令仍通过（typecheck、lint、test、build、smoke）。
- 用 CDP **真实时间**截图（不要用 `--virtual-time-budget`），`?gallery&skin=chicago`，窗口 1280×800 与 1280×4000 各一张，逐项说明 1–5 已修好：
  - 块公式是竖排的求和上下限与分数，行内 `E=mc²` 只出现一次。
  - 正文左边距 24px（用 `getBoundingClientRect` 量出并贴数值）。
  - 无遮罩，用户消息「请解释一下二次函数的图像特征。」可见。
  - pane 的 `scrollHeight > clientHeight`，滚到底后能看到最后一个样例。
  - mermaid 向下连线末端是 `▼`。
- 五套配色像素统计仍然各只有两色。
- 运行开发版时设置 `XUEGEN_HOME=<临时目录>`，不要读写真实 `~/.xuegen`；结束时关掉自己启动的开发服务器与 Electron。
- 截图不入库；只修改 `apps/desktop/`；不 git commit；中文逐项报告。
