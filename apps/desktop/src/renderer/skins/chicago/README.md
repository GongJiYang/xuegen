# chicago — 第一套设计皮肤（经典 Mac OS 黑白像素）

System 6 风格的黑白像素界面。视觉基准与像素细节见 `docs/desktop/skins/chicago.md` 与用户已确认的设计稿（仓库外）。

## 文件

| 文件 | 职责 |
|---|---|
| `index.ts` | 组装 `SkinModule`（插槽、动效、内容渲染器、懒加载样式表）。 |
| `shell.tsx` | `Shell`：菜单栏 + 抖动桌面 + 对话窗口 +「今天」+ 单个工具窗 + 图标列；⌘1–⌘5 开工具、⌘E 收尾、⌘. 专注。 |
| `slots.tsx` | 其余插槽：对话流、用户消息（风格标签）、回答、思考条、工具行、检验题对话框、输入区（风格单选 + `/` 菜单）、模型选择、提示框。 |
| `menubar.tsx` | 菜单栏与下拉菜单（学 / 文件 / 编辑 / 学习 / 风格 / 显示 / 模型），菜单项闪烁后执行回调。 |
| `tool-dock.tsx` | 最右图标列；32×32 像素图标由 `icons.tsx` 按当前配色生成。 |
| `icons.tsx` | 五个工具的 16×16 像素图（`ICON_ART`）；`toolDescriptors` 与两色 SVG data URL。 |
| `today-panel.tsx` | 「今天」窗口：计数 + 接着上次卡片 +「继续学习」。 |
| `progress-panel.tsx` | 总进度：每门课可展开，本周任务、下次起点、每课风格单选、开始学习。 |
| `reading-panel.tsx` | 阅读：加入阅读（候选来自 `reading.sources`）+ 今天该读 + 下次接着读 / 推迟 / 读完。 |
| `cards-panel.tsx` | 卡片：新卡表单、总数 / 待同步、各牌组同步比例、Anki 状态与重试。 |
| `calendar-panel.tsx` | 日历：月网格（周一起）、●◆▲✎ 标记（`Fusion12Diagram`）、◀▶ 翻月、当天详情。 |
| `skills-panel.tsx` | 技能：启用勾选、`/skill:名`、说明、来源标签、安装表单。 |
| `day-editor.tsx` | 日历写入对话框（标题 / 正文 / 保存路径 / 保存取消）。 |
| `slash-menu.tsx` | `/` 命令菜单：分组、高亮项。 |
| `widgets.tsx` | 面板共用小控件：计数、进度条、输入框、单选、复选、标签。 |
| `panel-shared.tsx` | 面板共用的加载 / 出错 / 提示行与若干标签映射。 |
| `stop-icon.tsx` | 32×32 停止图标（警告框与画廊提示共用）。 |
| `dialog.tsx` | 双线边框对话框（检验题、日历写入复用）。 |
| `content.tsx` | `ContentRenderers`：Markdown、表格、代码双线框、终端字符图、KaTeX、Mermaid、callout。 |
| `palette.ts` | 五套严格两色配色与像素图案（网点、条纹、按钮圆角、图标）SVG data URL 生成。 |
| `body-scale.ts` | 正文字号读取时归一化：任意值映射到可渲染的整数倍 1/2，不回写，保留其他皮肤的原始值。 |
| `motion.ts` | `MotionPreset`：缩放矩形、闪烁、条纹、披露三角、进度、菜单栏反白。 |
| `motion-constants.ts` | 全部动效时长与步数（对照 chicago.md §5 核对）。 |
| `hast-react.ts` | 把 core 的 HAST 结果渲染为 React 元素。 |
| `skin.css` | 移植自设计稿的样式，全部选择器加 `[data-skin="chicago"]` 作用域。 |
| `assets/` | ChicagoFLF 与 Fusion Pixel 12px（比例 / 等宽 / 字符图）字体，附 OFL 许可。 |

## 约定

- 只用两种颜色：颜色一律取自 `--ink` / `--paper`，图案（网点、条纹、按钮圆角）由 `palette.ts` 生成的 SVG data URL 表达，不用渐变、圆角或灰色。
- 动效只在皮肤内部实现，全部为阶梯缓动或瞬时切换；减少动效由 core 统一判断，开启时不调用预设。
- 文案全部来自 `core/strings.ts`，本目录不写散落字符串。
- 字体随皮肤懒加载，离线可用；字符图用 `Fusion12Diagram` 等宽半角字体，行高 16px。
- 主进程窗口底色由 Shell 经 `onWindowBackground` 上报，用于防闪屏。
