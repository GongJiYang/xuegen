# commands — `/` 命令菜单（第 2 批）

输入框打 `/` 弹出的功能菜单。命令表 = 内置命令（风格 / 上课 / 会话 / 打开）+ agent 返回的 `/skill:<name>`（只含启用的技能）。空查询不列出技能项——全部技能在「/技能」窗口里看；输入文字后照常能搜到。

| 文件 | 职责 |
|---|---|
| `commands.ts` | 内置命令表 `BUILTIN_COMMANDS`、`allCommands`（拼上 agent 技能）、`filterCommands`（按命令名 / 说明 / 分组）、`groupCommands`（稳定分组顺序）、`moveSelection`、`opensSlashMenu`、`styleOfCommand`。全部纯函数。 |
| `use-slash.ts` | 输入框 `/` 菜单的瞬时状态：开合、查询、选中项、过滤与分组结果；列表逻辑全部来自 `commands.ts`。 |

命令的执行（改风格、开工具窗、发提示词、`/skill:` 插入输入框）在 `App.tsx`，本目录只负责菜单的数据与选择。
