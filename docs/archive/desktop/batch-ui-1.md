# UI-1：Chicago 皮肤

前置：UI-0 已验收。先读 `apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、**`docs/desktop/skins/chicago.md` 与用户已确认的设计稿 `/Users/gjy/pi-learning/design/chicago/index.html`（二者是本批唯一的视觉依据；像素细节以设计稿为准，直接移植其 CSS 与交互逻辑，不自行发挥）**，以及 `~/.commandcode/skills/` 下 `frontend-design`、`gsap-core`、`gsap-timeline`、`gsap-performance`。

## 任务

1. 在 `src/renderer/skins/chicago/` 实现完整皮肤：全部插槽、`ContentRenderers`、`MotionPreset`。在登记表注册，`docs/desktop/skins/README.md` 状态改为「1.0 可用」。
2. 样式从设计稿移植，所有选择器加 `[data-skin="chicago"]` 作用域；**不引入 `@sakun/system.css` 的样式**。字体随皮肤打包、离线可用：ChicagoFLF（设计稿 `assets/ChicagoFLF.woff2`）、Fusion Pixel 12px 比例与等宽简体（设计稿 `assets/fusion-12.woff2`、`assets/fusion-12-mono.woff2`），附 OFL 许可（`/Users/gjy/pi-learning/design/chicago/vendor/fusion/OFL.txt`）。不使用 Monaco。
3. KaTeX、mermaid 用项目已有依赖或新增精确版本；mermaid 配置照设计稿（`graph TD`、`step`、不缩放、crispEdges、关键节点网点）。
4. 抖动图案、按钮像素圆角照设计稿用 SVG data URL 实现，不得用 CSS 渐变或 `border-radius`（会产生灰色抗锯齿）。
5. 微交互逐条实现 chicago.md 第 5 节表格：缩放矩形、菜单闪烁、按钮反白、条纹进度、披露三角两步旋转、逐格进度、菜单栏反白、块光标。只在皮肤内部用 GSAP（如需），时长与步数取自皮肤内的常量文件。
6. 菜单栏菜单按 chicago.md 第 3 节实现，菜单项调用 core 已有的回调；「显示 ▸ 外观」列出全部皮肤；「正文放大」写入设置。
7. 专注模式、侧窗收起按 chicago.md 实现。
8. **配色**（chicago.md 第 8 节）：契约 `ShellProps` 增加 `skinOptions: Record<string, string>` 与 `onSkinOption(key, value)`；`desktop.json` 增加 `skinOptions: { [skinId]: { [key]: value } }`（`shared/` 类型守卫，非法值回退默认）。Chicago 用 `palette` 键。`bare` 忽略该字段但须通过契约测试。
9. **防闪屏**（第 9 节）：主进程按设置决定 `BrowserWindow.backgroundColor` 并在 `ready-to-show` 后显示；渲染进程切换配色时经 IPC 通知主进程更新窗口底色（写入 `desktop.json` 的 `windowBackground`）。
10. **终端字符图**（第 10 节）：`core/content` 新增 `diagram` 节点——语言为空、`text`、`txt`、`ascii`、`diagram`、`plain` 且内容含 U+2500–259F 或 U+2800–28FF 字符的代码块。拷贝设计稿 `tools/make-diagram-font.py` 到 `apps/desktop/scripts/`，生成的 `fusion-12-diagram.woff2` 放入皮肤字体目录。`bare` 用 `<pre>` 渲染 diagram。测试：分类正反例各 ≥3（含流式未闭合围栏）。

## 验收（实际运行并贴输出）

- UI-0 的全部命令仍通过；契约测试自动覆盖 chicago。
- 黑白检查：画廊 `?gallery&skin=chicago` 全页截图，统计像素颜色，1 倍缩放下只允许 `#000`、`#FFF`（非黑白像素须为 0，含 KaTeX 与 mermaid）；贴出统计结果。另截一张与设计稿同状态的对照图自检。
- 录制微交互演示（缩放矩形、菜单闪烁、思考条纹、工具展开、进度、出错）与减少动效下的对照，核对时长与步数，在报告中逐项列出。**录屏与截图只用于自检，不保存进仓库**。
- 「显示 ▸ 外观」切到 `bare` 再切回，对话内容与滚动位置保持。
- 五套配色各截一张全页图：每张只允许该配色的 ink、paper 两色（贴统计）。
- 用设计稿中「用图看一遍」那 5 张字符图作为画廊样例，截图逐行核对竖线连通、中文对齐（放大 4 倍目检）。
- 冷启动 `amber` 配色：录屏首帧起不得出现白色帧。
- 不 git commit；中文逐项报告。
