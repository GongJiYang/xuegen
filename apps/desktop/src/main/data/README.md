# main/data — 知识库数据通道

负责：把渲染进程的数据请求（`shared/data-protocol.ts` 的 `DataRequest`）转成对 skill 脚本、AnkiConnect 与技能目录的调用，返回 `DataResponse`。这里是唯一产生知识库副作用的地方。

- `handler.ts`：按请求种类路由到白名单脚本子命令；`skills.*` 与 `anki.status` 单独处理。
- `scripts.ts`：以 `ELECTRON_RUN_AS_NODE=1` 调用 `skills/<name>/*.mjs`，15 秒超时，把超时/非零退出/非法 JSON 统一转成 `{ok:false}`。
- `vault.ts`：从 `$XUEGEN_HOME/wiki.json` 的 `root` 读取库根（只读）。
- `anki.ts`：只读 AnkiConnect 客户端；动作白名单（`version`/`deckNames`/`getNumCardsReviewedToday`/`findCards`），1.5 秒超时，连不上返回 `{running:false}`；禁止任何写入类 action。
- `skills.ts`：合并内置/个人/待审核技能目录，启用/禁用记在 `desktop.json` 的 `disabledSkills`；`skills.fetch` 只 `git clone` 到 `skills-pending/`（仅 https），不自动启用；启用待审核技能时用 `skills.setEnabled` 把它移动到 `~/.xuegen/skills/`。**新启用/禁用的技能要等下一次会话**（agent 重新加载 resource loader）才对学根生效；`/` 菜单里 `disabledSkills` 的过滤是即时的（每次 `list-commands` 重新计算）。
- `sources.ts`：`reading.sources` —— 列出库内 `raw/`、`Clippings/` 下尚未入队的 `.md`/`.pdf`（按修改时间倒序，最多 50 条），供「加入阅读」输入框的候选。已在阅读页 `source` 里链接的原文会被排除。

不负责：模型调用、界面渲染、课程与阅读状态的解析逻辑（那些在 skill 脚本里）。
