# shared — 共享消息协议

三个进程共用的唯一类型定义：渲染 ↔ 主进程 ↔ agent 的请求、事件、错误。

规则：消息类型只在这里定义；新增消息先在这里加，再在两端实现。

同时导出：

- `IPC_CHANNEL` / `SETTINGS_CHANNEL` / `DATA_CHANNEL`：Electron IPC 通道名（main 与 preload 共用，不手写字符串）。
- `isHostToAgentMessage()`：渲染进程 → 主进程请求的运行时类型守卫。
- `DesktopSettings` / `DEFAULT_DESKTOP_SETTINGS` / `isDesktopSettings()` / `normalizeDesktopSettings()`：界面设置的类型、默认值与校验（主进程与渲染进程共用），含 `bodyFont`、`disabledSkills`、`courseStyles`、`sessionStyle`、`courseStartedOn`。
- `CommandInfo`：`/` 菜单的技能条目；`TeachingStyle` 与 `TEACHING_STYLE_LABELS`：三种讲解风格。
- `assertNever()`：联合类型穷尽检查。

`data-protocol.ts`：数据通道（`DATA_CHANNEL`）的请求/响应类型与 `isDataRequest()` 守卫。请求按 `kind` 判别（`courses.list`、`reading.*`、`cards.*`、`anki.status`、`calendar.*`、`skills.*`），响应是 `{ok:true,data} | {ok:false,error,code}`。含学习周期的 cycle.day / cycle.month（CycleDay、CycleMonth）。
