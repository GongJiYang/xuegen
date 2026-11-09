# core — 皮肤无关的逻辑层

core 决定「是什么」：对话状态、设置、文案、内容解析、动效意图、看板视图模型。它不含任何样式，也不 import 任何皮肤。

- `chat/`
  - `chat-reducer.ts`：纯函数 reducer（`ChatState` 单一真相）+ `isThinking`；`commands` 事件在此保存，供 `/` 菜单。
  - `thinking.ts`：`thinkingFor(messages, index, thinking)` —— 每个索引是否显示「正在思考」：只有最后一条 assistant 且仍为 `thinking` 时为 `true`，两条皮肤都用它逐条判定。
  - `use-follow-bottom.ts`：`useFollowBottom(paneRef, { answer, answerStreaming })` —— 新回答开始流式输出时把该回答的开头对到视口顶部后停止自动下滚；无固定回答时，用户停在底部附近（≤48px）仍跟随内容增长。暴露 `atBottom` 与 `scrollToBottom` 供皮肤画「回到最新」。
  - `last-assistant.ts`：找出最后一条 assistant 消息，供两个皮肤锚定新回答的起点。
  - `has-answer.ts`：`hasAnswer(messages)` —— 学根是否已经在会话里答过内容（失败或未作答的开课不算）。
  - `view-models.ts`：`ChatState` → 提示列表（NoticeItem）与可用性判断的纯函数。
  - `model-error.ts`：把上游原始错误翻成中文摘要 + 可展开的原文；`isNetwork` 认 `terminated` 等断线原文。
  - `retry-state.ts`：`retryDisplayOf(message)` —— 失败回答的自动重试状态（重试中／已恢复／照常报错），三个皮肤共用这一份判断。
  - `useChat.ts`：命令式外壳，订阅 preload 事件并 `useReducer`；控制器位于皮肤之上，切换皮肤不重建。
  - `message-renderer.tsx`：唯一知道「一条消息如何映射到插槽」的地方；内容分类一次后交给皮肤的 `ContentRenderers`，`question` callout 路由到 `Exercise` 插槽；用户消息把 `[风格：X]` 前缀拆成 `styleTag` + `body`。
  - `style-prefix.ts`：`withStylePrefix`、`splitStyleTag`、`styleLabel` 纯函数。
  - `style.ts`：`resolveStyle` 等 —— 当天内存里的风格选择（按课程 / 自由对话），未选即「默认」，不保存。
- `board/`：课程 / 阅读 / 卡片 / 日历 / 技能的视图模型与控制器，`AsyncState` 三态建模（见该目录 README）。
- `commands/`：`/` 菜单的命令表、过滤、分组与选择（见该目录 README）。
- `today.ts`：`resumePoint`（接着上次）、`resumePrompt`、`studyPrompt` 纯函数。
- `content/`：`nodes.ts` 定义内容节点类型；`parse-content.ts` 是纯分类管线（代码块、Mermaid、公式、表格、callout），流式不完整 Markdown 不抛错。
- `motion/`：`MotionIntent`、`MotionPreset`、`MotionHandle`、`useMotion`、减少动效判断；不依赖动画库。
- `settings/`：`use-settings.ts` 经 `client.ts` 读写设置；`apply` 用数据通道返回的设置对象同步本地状态；`body-font.ts` 定义像素/平滑字体的字号档位与吸附；`step-body-scale.ts` 是 ⌘+ / ⌘- / ⌘0 的纯函数档位步进（按皮肤 + 字体）；`use-body-scale-shortcuts.ts` 安装键盘监听。
- `client.ts`：`window.xuegen` 的唯一入口，组件不直接访问。
- `strings.ts`：全部界面文案，皮肤共享。
