# 批次 CR-1：切回课程不再重发「开始今天」

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。

## 问题（用户实际使用时报告）
学课程 A → 切到课程 B → 想回到 A，只能再点 A 的「开始学习」，而它总会再发一遍「开始今天的 A…」。
原因：`core/board/use-course-sessions.ts` 的开课逻辑不区分「回到这门课」和「开始今天」，只要点了就发送开课消息；如果点的正是当前课程，也会再发一遍。

## 要的行为
| 情况 | 点按钮后 |
|---|---|
| 这门课**今天已经开过课**（今天发送过开课消息） | 只切回该课自己的会话，**不发任何消息**；已是当前课程则什么都不发，只把焦点给输入框 |
| 今天还没开过课 | 照现在：打开/新建该课会话，显示开课卡片，发送开课消息 |

- 按钮文字随情况变：今天已开课 →「回到这门课」；否则 →「开始学习」。「今天」窗口的「继续学习」同理（已开课 →「回到这门课」）。
- 「改计划」不受影响（它总是发送改计划消息）。

## 实现
- 设置 `DesktopSettings` 新增 `courseStartedOn: Record<string, string>`（slug → 本地日期 `YYYY-MM-DD`），在 `shared/protocol.ts` 的 normalize 里校验（只收合法日期字符串），写测试。
- 发送开课消息（`handleStudy` / `handleResume`）成功调用 `controller.send` 时写入 `courseStartedOn[slug] = 今天`。
- 纯函数（放 `core/board/`，写测试）：`openingAction(slug, today, courseStartedOn, activeCourse): "send-opening" | "switch-only" | "focus-only"`。
- 「今天」由调用方传入（纯函数不读时间）；本地日期用已有的工具（如 `todayIso` 或 core 里同类函数，不要重复造）。
- 「switch-only」：`controller.openSession(该课已记的会话)`；该课没有记录的会话时退化为 send-opening。不显示开课卡片（卡片只属于开课那一刻）。
- 皮肤：`ProgressPanelProps` / 今天窗口的 props 增加能决定按钮文字的数据（例如 `startedToday: Record<slug, boolean>` 或在视图模型里给出按钮标签，按现有组织方式最小改动）；bare 与 chicago 都实现；画廊样例补「回到这门课」状态。文案进 `core/strings.ts`。

## 验收（你必须自己跑，全部通过才算完成）
`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。`wc -l apps/desktop/src/renderer/App.tsx` ≤ 450。

## 禁止
不读写 `~/.xuegen/`，不碰 Obsidian 库，不启动 Electron，不 git commit/push，不加依赖，不放宽 eslint、不加 `eslint-disable`。不改前两批（开课卡片、正文排版）的行为。

## 结束时
输出：改了哪些文件、偏离规格之处及原因、六条命令结果（贴最后几行）、App.tsx 行数。
