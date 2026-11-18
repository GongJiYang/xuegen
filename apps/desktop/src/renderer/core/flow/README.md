# flow — 开课 / 收课的步骤与工具行人话

- `steps.ts`：开课 / 收课的固定步骤表（`FLOW_STEPS`），标题与 `skills/course/SKILL.md` 一致。
- `strings.ts`：步数行、折叠行与工具行人话的文案，单放以免撑大 `core/strings.ts`。
- `tool-human.ts`：`describeTool(call, names)` 把一次工具调用翻成一句人话，并标出它对应哪一步。
- `flow-progress.ts`：`flowOf`、`progressLine`（进行中的步数行）、`foldLabel`（答完的折叠行）、`groupCalls`（展开后按步骤分组）。

本目录只有纯函数，不含样式，也不接界面。
