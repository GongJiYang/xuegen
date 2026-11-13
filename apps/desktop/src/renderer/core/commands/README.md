# commands — `/` 命令菜单（第 2 批）

输入框打 `/` 弹出的功能菜单。命令表 = 内置命令（风格 / 上课 / 会话 / 打开）+ agent 返回的 `/skill:<name>`（只含启用的技能）。空查询不列出技能项——全部技能在「/技能」窗口里看；输入文字后照常能搜到。

| 文件 | 职责 |
|---|---|
| `commands.ts` | 内置命令表 `BUILTIN_COMMANDS`、`allCommands`（拼上 agent 技能）、`filterCommands`（按命令名 / 说明 / 分组）、`groupCommands`（稳定分组顺序）、`moveSelection`、`opensSlashMenu`、`styleOfCommand`。全部纯函数。 |
| `use-slash.ts` | 输入框 `/` 菜单的瞬时状态：开合、查询、选中项、过滤与分组结果；列表逻辑全部来自 `commands.ts`。 |
| `run-command.ts` | `runCommand` 纯函数：内置命令的动作——改风格、开工具窗、发提示词、`/skill:` 插入输入框；返回「发给 agent 的文本 + 是否本地已处理」。 |
| `use-run-command.ts` | `useRunCommand`：`App` 拆出的命令执行 hook——接住 useSlash 的选中等状态，把 `runCommand` 接到会话动作上。 |

命令菜单的数据与选择在本目录；执行经 `useRunCommand`（包 `runCommand`）落到会话动作。
