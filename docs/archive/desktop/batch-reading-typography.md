# 批次 RT-1：正文阅读排版（可动态切换字体）+ 讲解分块

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/skins/chicago.md`、`docs/skills/AUTHORING.md`、`skills/teach/SKILL.md`。

## 背景（调研结论，2026-11-04）
- 12px 中文正文可能低于屏幕易读阈值，24px 足够；深字浅底优于浅字深底，小字更明显。
- 字体效果因人而异（Wallace 2022），平滑渲染的字体读长文比锯齿像素快（Slattery & Rayner 2010）→ 正文字体要能**随时切换**，由用户试读决定。
- 中文最佳行长约 32–38 字，行距约 1.5，段间留空。
- 分块 + 小标题 + 关键句加粗 + 每几段一次检验（信号与分段原则，证据强）。
- 不做：仿生阅读、加大字间距、彩色底色疗效宣传。

## 范围
只改「消息正文」的排版与讲解分块。界面（菜单、窗口标题、按钮、面板）仍用 Chicago 像素字；**字符图 / 代码块仍用 `Fusion12Diagram` 等宽像素字**（中文 2 列对齐依赖它，不能换）。不改配色。

## A. 正文字体设置（可动态切换）
- `shared/protocol.ts` 的 `DesktopSettings` 新增 `bodyFont: BodyFont`，`type BodyFont = "pixel" | "hei" | "kai" | "song"`；默认 `"pixel"`。在 normalize 守卫里校验（未知值回落默认），写测试。
- 字体族（放在 core 或皮肤里，按现有组织决定；字体名是数据不是文案）：
  - `pixel`：现有 Fusion Pixel 12（比例）
  - `hei`：`"PingFang SC", "Hiragino Sans GB", "Heiti SC", sans-serif`
  - `kai`：`"Kaiti SC", "STKaiti", "KaiTi", serif`
  - `song`：`"Songti SC", "STSong", "SimSun", serif`
  只用系统字体，**不打包新字体文件、不加依赖**。
- 渲染：`document.documentElement.dataset.bodyFont` 设为当前值（与现有 `data-body-scale` 同处设置，见 `skins/use-appearance.ts`），皮肤 CSS 按 `[data-skin="chicago"][data-body-font="hei"]` 等选择器改**消息正文**（用户与助手消息的段落、列表、表格、引用、检查理解框正文）的 `font-family`，并对非像素字体打开平滑渲染（`-webkit-font-smoothing: antialiased`，像素字体保持现有设置）。
- 字号档位随字体变：
  - `pixel`：只允许 1 / 2（12px / 24px），保持现状（`skins/chicago/body-scale.ts`）。
  - 非像素：允许 `[1.25, 1.5, 1.75, 2]`（15 / 18 / 21 / 24px）。从像素切到平滑字体时，当前 scale 不在档位内就取最近的档；切回像素时按现有 `coerceBodyScale` 取 1 或 2。
  - 实现：`stepBodyScale` 的档位来源改为「皮肤 + 字体」决定。在 `skins/contract.ts` 把 `bodyScaleSteps` 扩展为可选函数 `bodyScaleSteps?: readonly number[] | ((font: BodyFont) => readonly number[])`（或新增字段，按最小改动选），core 的 `use-body-scale-shortcuts` 按当前字体取档位。纯函数写测试。⌘+/⌘-/⌘0 照常工作；⌘0 回到该字体的默认档（像素 2，平滑字体 1.5）。
- 默认值：新用户 `bodyScale` 默认 **2**（24px）。已有设置文件里的值不迁移。
- 菜单（Chicago `menubar.tsx` 的「显示」）：新增「正文字体 ▸ 像素 / 黑体 / 楷体 / 宋体」（单选，带勾），「正文字号 ▸」列出当前字体的档位（如「15px / 18px / 21px / 24px」，带勾）；保留现有的「大字」开关或改为这个子菜单（二选一，避免两个入口打架，在报告里说明）。bare 皮肤在其设置区提供同样两个选择（语义 HTML 的 `<select>` 即可）。
- 文案全部进 `core/strings.ts`。

## B. 正文版式
- 消息正文最大行宽：中文约 36 字 → `max-width: 36em`（em 取正文字号）；行高 `1.6`（像素字体保持现有行高，若现有值已是 12px 整数倍网格就不动，在报告里写明取值）；段间距约 `0.75em`。代码块、字符图、表格可以比正文宽，不受 36em 限制。
- 生成时的滚动：新回答开始流式输出后，视口跟随到「这条回答的开头到达视口顶部」为止，之后不再自动往下滚（用户可手动滚，「回到最新」按钮保留）。实现放在 `core/chat/use-follow-bottom.ts`，写测试；不改为整段一次性显示。

## C. 讲解分块（`skills/teach/SKILL.md`）
在「3. 推导」或合适位置补一节「回答的版式」：
- 每块一个小标题（`###`），每块 2–4 个短段，一段不超过 4 句；
- 每块里最关键的一句加粗，**全块只加粗一处**，不要满屏加粗；
- 讲完 3–5 段后放一个「检查理解」callout（沿用现有格式），不要连续大段讲解不停；
- 新术语第一次出现时加粗并在括号里给英文原名，之后不再标记；
- 不用仿生阅读式加粗、不刻意加空格。
跑根目录 `npm run lint:skills` 0 错误。

## 验收（你必须自己跑，全部通过才算完成）
`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。`wc -l apps/desktop/src/renderer/App.tsx` ≤ 450。

## 禁止
- 不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 git commit/push，不加依赖、不加字体文件。
- 不放宽 eslint 规则、不加 `eslint-disable`。不改配色、不改界面（非正文）字体。
- 不动 `docs/desktop/batch-course-intro.md` 那一批已改的逻辑（开课卡片），只在需要时适配。

## 结束时
输出：改了哪些文件、偏离规格之处及原因、各字体的最终 CSS 取值（字号/行高/行宽）、六条命令结果（贴最后几行）、App.tsx 行数。Chicago 视觉改动按规范升版本号并同步 `docs/desktop/skins/chicago.md`（写清「消息正文可切换平滑字体」这一例外）。
