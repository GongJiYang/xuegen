# 皮肤 Bear（iA Writer / Bear 方向）

- id：`bear`　版本：0.1（开发中）
- 用户确认的演示：`/Users/gjy/pi-learning/design/animate/`（仓库外，`npm run dev` 后打开 `http://localhost:5181/?d=ia`）。实现以本文为准，演示是视觉参照。
- 依赖：`@animate-ui/react` 2.4.2（MIT + Commons Clause，只用在本私有应用，不随公开仓库分发）、`motion` 14.9.1、`radix-ui` 1.8.1。只允许在 `src/renderer/skins/bear/` 里 import（eslint 已强制）。

## 1. 一句话

**只有一栏正文。** 界面元素几乎隐形，靠字号、行距、留白撑场面；课程、计划、阅读、卡片、日历、技能都收进右侧抽屉。打开就是在读、在写。

## 2. 视觉 token（写成 CSS 变量，全部限定在 `[data-skin="bear"]` 下）

| 变量 | 值 | 用途 |
|---|---|---|
| `--paper` | `#fbfbfa` | 背景（窗口、抽屉） |
| `--ink` | `#1f2124` | 正文、标题 |
| `--soft` | `#8b9096` | 次要文字、界面按钮、用户消息 |
| `--rule` | `#e3e5e8` | 细线（分隔、用户消息左线、输入区上线） |
| `--code-bg` | `#f1f2f3` | 代码块底色 |
| `--accent` | `#1aa3ff` | **唯一强调色**：光标、主操作文字、「检查理解」左线和标题、单选圆点、勾选对勾 |
| `--danger` | `#b3261e` | 只用于错误提示文字 |
| `--warn` | `#c98a12` | 状态记号 `!`（需注意：没学的课次、顺延） |
| `--warn-text` | `#a86b00` | 「需注意」的小字（对比度 ≥ 4:1） |
| `--faint` | `#b8bcc2` | 很淡的内容：日历里的休息日 |
| `--hairline` | `#eceef0` | 面板列表行之间的分隔线 |

- 状态记号（● 现在做 / ! 需注意 / ○ 已排期）只给符号和小字上色，不铺底色；强调色仍只有 --accent。
- 不用阴影、不用渐变；圆角最多 4px（代码块、输入框焦点、弹出层）。弹出层用 1px `--rule` 边框代替阴影。
- 界面字（按钮、标题栏、抽屉）：`-apple-system, "PingFang SC", sans-serif`，13px。

## 3. 正文排版

- 字体跟随设置 `bodyFont`：`hei` → `"PingFang SC", -apple-system, sans-serif`；`kai` → `"Kaiti SC", "STKaiti", serif`；`song` → `"Songti SC", "STSong", serif`；`pixel` 在本皮肤按 `hei` 处理（像素字只属于 Chicago）。
- 字号档位（`bodyScaleSteps`，基准 16px）：`[0.875, 1, 1.125, 1.25, 1.5]` → 14 / 16 / 18 / 20 / 24px；与字体无关。旧设置里不在档位内的值（如 Chicago 的 2）显示时取最近档，不回写。
- 行高 1.75；段间距 0.7em；正文行宽 `max-width: 42em`（扣掉两侧内边距约 40 个汉字），居中。滚动条全部隐藏，滚轮与触控板照常滚动。
- 小标题（h2/h3）与正文同字号、字重 650，前面加淡色 `### `（`::before`，颜色 `--rule`）。
- 加粗字重 650。行内代码 `"SF Mono", Menlo, monospace` 0.86em。
- 代码块：`--code-bg` 底、4px 圆角、13px 等宽。
- **代码与字符图**：`BearDiagramMono`（`skins/bear/assets/bear-diagram-mono.woff2`，Iosevka 子集，SIL OFL 1.1，由 `apps/desktop/scripts/make-bear-diagram-font.py` 生成）——ASCII、制表线、盲文和 diagram 技能允许的箭头/形状一律 0.5em；中文落到苹方 1em，与 diagram 技能「中文 2 列、其余 1 列」的规则一致。字符图字号为正文的 7/8，行高 1.25。
- 表格：细线 `--rule`，无底色；数学公式与 mermaid 沿用 core 的内容解析，mermaid 主题用 ink/paper 两色。

## 4. 布局与各插槽

```
┌──────────────────────────────────────────────────────────┐
│ 课程名（或「自由提问」）           上下文 18%  课程与计划  ⋯ │  ← 标题栏，13px，--soft
│                                                          │
│                ┃ 大白话 开始今天的…（用户消息：灰、左细线）  │
│                ### 小标题                                │
│                正文（42em，居中）……                       │
│                ┃ 检查理解（左线 --accent）  跳过 提示 我来回答│
│                ───────────────────────────────            │
│                ○大白话 ○细讲 ○深度                         │
│                发消息…（无边框，光标 --accent）      发送   │
└──────────────────────────────────────────────────────────┘
                                   右侧抽屉 380px：今天｜总进度｜阅读｜卡片｜日历｜技能
```

| 插槽 | Bear 的做法 |
|---|---|
| `Shell` | 三行网格：标题栏 / 对话 / 输入区。标题栏左边 `sessionTitle ?? 自由提问`，右边依次：上下文（Popover：`contextUsage.detail`、进度条、「立即压缩」），「课程与计划」（打开抽屉），「⋯」菜单。`focusMode` 时标题栏只留「⋯」。`notices` 显示在对话列顶部，一行一条，错误用 `--danger`，可关闭。 |
| 「⋯」菜单 | Animate UI `radix-ui/dropdown-menu`：新会话、继续会话、模型 ▸（`ModelPicker`）、思考强度 ▸、正文字体 ▸、正文字号 ▸、皮肤 ▸、专注模式。文案全部来自 `core/strings.ts`。 |
| 抽屉 + `ToolDock` | Animate UI `radix-ui/dialog`（`from="right"`）做右侧抽屉，遮罩 `rgb(250 250 249 / .6)`。抽屉顶部是 `ToolDock`：一排文字标签（今天、总进度、阅读、卡片、日历、技能），用 Animate UI `radix-ui/tabs`，选中项下面一条 1px `--ink` 线滑动。**启动时抽屉关着**（应用默认的 `activeTool` 不算请求）；之后 `activeTool` 变化（⌘1–5、`/` 命令、学习菜单）就打开抽屉并定位到该标签；`onOpenTool` 由标签切换调用；关闭抽屉不清空 `activeTool` 以外的状态。 |
| `Thread` | 42em 居中一栏；开课卡片 `intro` 与 `systemNotes` 按 `beforeIndex` 插入（同 Chicago）；「回到最新」是右下角一个文字按钮。必须用 core 的 `useFollowBottom` / `useScrollMemory` / `thinkingFor`。 |
| `UserMessage` | `--soft` 文字、2px `--rule` 左线；风格标签 13px 放在最前。 |
| `AssistantMessage` | 正文排版见第 3 节；「复制 Markdown」是段末一个 `--soft` 文字按钮，悬停变 `--ink`。 |
| `Thinking` | Animate UI `texts/shimmering`：「正在思考…」，`--soft`。 |
| `ToolActivity` | 一行 `--soft` 小字「▸ 工具名 摘要」，点开用 Animate UI `radix-ui/accordion` 展开详情。 |
| `Exercise` | 左 2px `--accent` 线；标题「检查理解」`--accent` 14px；三个按钮都是文字按钮，「我来回答」用 `--accent`。 |
| `CourseIntroCard` | 左 2px `--rule` 线，课程名 `--ink`，三行 `--soft`（上次 / 这次 / 本周）。 |
| `Composer` | 上方 1px `--rule`；风格单选（Animate UI `radix-ui/radio-group`，13px）；输入框无边框、透明、正文同字号、`caret-color: var(--accent)`；「发送 / 停止」是 `--accent` 文字按钮。 |
| `SlashMenu` | 输入区上方弹出的列表（Animate UI `radix-ui/popover` 或同等定位），条目悬停用 Animate UI `effects/highlight` 的底色块（`--code-bg`）。 |
| `ModelPicker` | 「⋯」菜单里的子菜单。 |
| `Notice` | 见 Shell。 |
| 面板（Today/Progress/Reading/Cards/Calendar/Skills） | 在抽屉里，14px；列表行之间 1px `#eceef0` 分隔；进度条 2px 高、`--ink` 填充；勾选框 14px 方框 3px 圆角，对勾 `--accent`（Animate UI checkbox，对勾为自绘 SVG 路径）；数字用 Animate UI `texts/sliding-number`；「今天 / 明天」用 tabs。新课程表单、改计划输入、阅读加入框沿用各面板的 props，样式为无边框输入加底部细线。 |
| `DayEditor` | 居中对话框（Animate UI dialog），1px `--rule` 边框，无阴影。 |
| `BoardPanel` / `NotesPanel` | 空状态一行 `--soft` 文字。 |

- 小机器人（grokbot-web，打包在 skins/bear/vendor/，见 SOURCE.txt）：回答进行中那一行前面 24px，表情与文字随学根在做的事变（思考 / 查资料 / 动手 / 写）；总控会话标题前 22px，显示待命 / 提醒 / 休息 / 思考 / 动手。

## 5. 动效（`MotionPreset` + Animate UI 原语）

只做微交互；禁止入场编排、滚动驱动、视差、逐字打字（流式文字不做动画）。减少动效由 core 判断，Animate UI 自身也遵守系统设置。

| 意图 | Bear |
|---|---|
| `appear` | 透明度 0→1，120ms ease-out（新消息、通知） |
| `confirm` | 文字颜色闪到 `--accent` 再回原色，200ms |
| `busy` | 透明度 1↔0.55 循环，900ms |
| `expand` / `collapse` | 交给 Animate UI accordion / dialog 自带的弹簧 |
| `progress` | 进度条宽度过渡 240ms |
| `alert` | 透明度闪一次，150ms，不抖动位移 |

`MotionPreset.run` 用 `motion` 的 `animate()` 实现，返回可取消的 handle。

## 6. 不做（这一版）

- 暗色主题、自定义配色（以后加；Chicago 的 5 套配色不搬过来）。
- 像素字体。
- 任何非用户触发的动画。
