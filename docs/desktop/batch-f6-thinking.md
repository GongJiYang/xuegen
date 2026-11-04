# F6：「正在思考」重复与聊天不跟随（用户真实使用发现）

1. **每个回答下面都出现「正在思考」**：`skins/chicago/slots.tsx` 与 `skins/bare/messages.tsx` 的 `Thread` 对每条消息都调用 `renderMessage(message, thinking)`，把全局 `thinking` 传给了所有消息。改为由 core 决定：只有**最后一条** assistant 消息、且它仍在生成且内容为空时为 `true`（工具调用多轮时，之前的 assistant 消息一律 `false`）。把这条规则写成 core 的纯函数（如 `thinkingFor(messages, index, thinking)`），两个皮肤都用它；`ThreadProps` 的注释同步。测试：多条 assistant + 工具调用场景下只有最后一条显示。
2. **聊天框不跟随**：现在只在消息条数增加时滚到底，流式输出变长时不滚（用户以前就反馈过「设置了聊天框跟随不起作用」）。改为：用户停在底部附近（距底 ≤ 48px）时，内容增长（含流式增量、工具行展开）都跟随到底；用户主动往上滚后不跟随，并在右下角显示「↓ 回到最新」按钮，点击回到底部并恢复跟随。逻辑放 core 的 hook（如 `useFollowBottom(paneRef)`），两个皮肤都用。测试覆盖跟随/暂停/恢复。

验收：全部命令通过；**不要启动开发版应用**（用户正在使用），不读写真实 `~/.xuegen`；不 git commit；只改 `apps/desktop/`；中文简要报告。
