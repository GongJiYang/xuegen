# 批次 CX-1：看得到上下文用量与压缩；阅读窗口说明用途

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`；Pi 文档 `apps/desktop/node_modules/@earendil-works/pi-coding-agent/docs/compaction.md`、`docs/sdk.md`。

## 问题（用户实际使用时报告）
1. 「我想看到上下文」：界面看不到上下文用了多少，也不知道什么时候被压缩。Pi 在接近上限时会自动把旧消息总结成摘要（保留最近约 2 万 token），但桌面版没有接 `session.getContextUsage()` 和 `compaction_start` / `compaction_end` 事件。
2. 用户不清楚「阅读」窗口是干什么的、要不要把正在学的书放进去。

## A. 上下文用量与压缩
- `shared/protocol.ts`（先改类型）：
  - agent → renderer 新消息 `context-usage { tokens: number | null; contextWindow: number; percent: number | null }`。
  - agent → renderer 新消息 `compaction { phase: "start" | "end"; reason: "manual" | "threshold" | "overflow"; aborted?: boolean; errorMessage?: string }`。
  - 接收端运行时校验（类型守卫 + 测试）。
- `agent/`：每轮结束（agent 结束一次回答后）、会话打开/切换后、压缩结束后，调用 `session.getContextUsage()` 发送 `context-usage`；把 Pi 的 `compaction_start` / `compaction_end` 映射成 `compaction`（映射写在 `event-mapper.ts`，纯函数并测试）。
- 历史回放：确认 `agent/history.ts` 对含 `CompactionEntry` 的会话能正常回放（被压缩的旧消息仍然显示原文还是只显示摘要，按 Pi 的会话文件实际内容决定；在报告里说明），并在回放结果里于压缩发生的位置插入一条本地提示（见下）。写测试（构造带 compaction 条目的会话）。
- renderer（core）：`useChat` 持有 `contextUsage` 与压缩状态；视图模型给出：
  - 标题栏文字：`上下文 {percent}%`（percent 为 null 时显示 `上下文 —`）；≥ 80% 时附 `· 即将压缩`。
  - 压缩进行中：标题栏显示 `正在压缩较早的对话…`。
  - 压缩完成：在对话里该位置显示一行本地提示 `较早的对话已压缩为摘要（课程进度保存在课程文件里，不受影响）`；失败时显示错误提示（沿用现有 notice）。
  - 本地提示不写进会话文件，不发给模型。
- 皮肤：`ShellProps` 增加上下文用量文字；`ThreadProps` 能渲染压缩提示（可复用开课卡片的「插在第 N 条消息前」机制，或新增 `systemNotes: { beforeIndex; text }[]`，按最小改动选）。bare 与 chicago 都实现，画廊补样例。Chicago 放在对话窗口标题栏右侧，两色、12px 像素字。文案进 `core/strings.ts`。
- 「上下文」可点击：点开显示一个小面板，列出 `已用 {tokens} / {contextWindow} token`，以及一个「立即压缩」按钮（发送 Pi 的 `/compact`，经现有命令通道；若现有协议无此能力，新增 `compact` host 消息调用 `session.compact()`）。

## B. 阅读窗口说明用途
- 阅读窗口顶部加一行说明（文案进 `core/strings.ts`）：`课程以外的文章、论文、书摘放这里，按间隔提醒你重读；正在学的课本已在课程里，不用放。`
- bare 与 chicago 都显示。

## 注意：App.tsx 已经 450 行（上限）
本批新增的状态与组装不得放进 `App.tsx`；先把 `App.tsx` 里给皮肤拼 props 的部分（例如 Shell / Thread / 各面板 props 的组装）抽成 `core/` 下的 hook 或纯函数，使本批结束时 `App.tsx` ≤ 420 行。行为不变。

## 验收（你必须自己跑，全部通过才算完成）
`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。`wc -l apps/desktop/src/renderer/App.tsx` ≤ 420。

## 禁止
不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 git commit/push，不加依赖，不放宽 eslint、不加 `eslint-disable`。不改前面几批（开课卡片、正文排版、切回课程）的行为。Pi SDK 只在 `src/agent/` 中 import。

## 结束时
输出：改了哪些文件、偏离规格之处及原因、压缩后历史回放的实际表现、六条命令结果（贴最后几行）、App.tsx 行数。

## 执行记录（2026-11-04）
opencode 完成协议、agent、chat-reducer、useChat、context-usage 视图模型后因 DeepSeek 余额不足中断；其余（皮肤渲染上下文用量与压缩提示、阅读说明、App 组装与拆分 `shell-panels.ts`、切换会话后刷新用量、测试）由 Claude 完成。
