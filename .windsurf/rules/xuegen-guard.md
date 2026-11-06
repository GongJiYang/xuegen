---
trigger: always_on
---

# 学根硬约束（每次都生效；上下文被压缩后先重读本文件和任务单）

1. 先读并遵守 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。规则冲突时以这些文件为准。
2. 只做任务单写的范围；范围外的问题写进结束报告，不顺手改。
3. 不读写 `~/.xuegen/`，不碰 Obsidian 库，不 `git commit` / `push`，不启动 Electron。
4. 依赖方向由 eslint 强制：`core` 不 import 具体皮肤，皮肤之间互不 import，renderer 与 main/agent 互不 import。lint 报错就改代码，**不放宽规则、不加 `eslint-disable` / `@ts-ignore`**。
5. 决策逻辑写成纯函数并配同名测试；副作用只在 hook / main / agent 里。
6. 界面文案只放 `apps/desktop/src/renderer/core/strings.ts`；新插槽 bare 和其他皮肤都要实现。
7. `App.tsx` 不超过 420 行；新状态放进 `core/` 的 hook。
8. 新依赖必须精确锁定版本，并在报告里写用途和替代方案。
9. 遇到「走不通」先写清楚卡在哪、试过什么、证据是什么，不要换一条更省事的路悄悄绕过需求。
10. 完成前必须自己跑完并贴出结果：`apps/desktop` 里 `npm run typecheck`、`npm run lint`、`npm test`、`npm run build`；仓库根 `npm test`、`npm run lint:skills`。
