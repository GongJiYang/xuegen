# 批次 T1-排版：总进度面板在窄窗口里挤成逐字折行

先读：`apps/desktop/AGENTS.md`、`docs/desktop/skins/chicago.md`。只改 Chicago：`apps/desktop/src/renderer/skins/chicago/progress-panel.tsx` 与 `skin.css`（必要时 `widgets.tsx` 里只加可选参数，不改现有行为）。

## 现象（真实 Electron，总进度窗口内容宽约 320px，正文 12px）
1. 每门课展开区最后一行：风格单选「大白话/细讲/深度」与「改计划」「开始学习」挤在一行，文字逐字折行（「大白\n话」「改计\n划」「开始学\n习」）。
2. 顶部说明文字旁的「＋ 新课程」按钮折成两行。
3. 新课程表单：「每天时长」四个选项逐字折行（「30 分\n钟」）；「开始日期 + 讲解风格 + 取消」挤在一行，风格选项逐字折行，「取消」被挤出面板右边界。

## 要求
- 任何按钮、单选项的文字都不折行（`white-space: nowrap`），放不下时整组换到下一行（flex-wrap），而不是把字挤碎。
- 课程展开区：风格单选一行；「改计划」「开始学习」另起一行靠右。
- 新课程表单：每个字段一行——课程名；资料 + 候选；每天时长；开始日期；讲解风格；最后一行靠右放「取消」「建课」（「建课」是默认按钮，沿用 `chicago-def`）。
- 「＋ 新课程」按钮不折行；说明文字可以折行。
- 只用两色、12px 整数倍字号；不改文案、不改逻辑与契约。

## 验收（你必须自己跑）
`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。不要启动 Electron，不要碰 `~/.xuegen/`，不要 git commit。

## 结束时
输出改了哪些文件、怎么改的、四条命令结果。
