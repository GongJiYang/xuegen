# batch-stage1-review（DeepSeek）：审核 + 补测试（卡片直连 AnkiConnect、数据根脚本）

Devin 按 `docs/platform/batch-stage1-anki-dataroot.md` 写完了（未提交）。你负责 A 审核（问题直接修）、B 修一处超时、C 补测试。不做任何界面。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`、规格 `docs/platform/batch-stage1-anki-dataroot.md`、`skills/wiki-save/flashcards.test.mjs`（测试写法照它）。
- 测试只用临时目录与 `node:http` 假 AnkiConnect；不读写真实 `~/.xuegen/`、不碰真实库 `~/学根/库`、不连真实 Anki、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。
- 只改：`skills/wiki-save/anki-sync.mjs` 及测试、`bin/xuegen-data-root.mjs` 及测试（新建 `bin/xuegen-data-root.test.mjs` 或按仓库测试约定放）、`apps/desktop/src/shared/data-protocol.ts` 及测试、`apps/desktop/src/main/data/handler.ts`、`main/data/run-script*.ts`（超时）及测试。

## A. 审核（逐节对照规格）

1. `parseCardPage`：多行正面 / 背面、`TARGET DECK` 缺省为 `Default`、`FILE TAGS`、ID 在 END 前或紧随 END 后（旧插件格式）都算已同步、非 Basic 进 skipped。
2. 同步失败时不写文件；每页一次性原子写回；`--dry-run` 不连 Anki、不写。
3. ID 插入位置精确（同一页多块、夹着已同步块时不插错块）。
4. `书房::` 牌组设预设；`presetMissing`。
5. `xuegen-data-root.mjs`：三种拒绝情况都 exit 1 且不改任何东西；重复运行幂等。

## B. 超时

`cards.sync` 首次全量同步几百张卡会超过 `runScript` 的 15 秒超时。给 `runScript` 加可选的超时参数，`cards.sync` 用 120 秒，其它请求不变。

## C. 补测试

1. `skills/wiki-save/anki-sync.test.mjs`（新）：纯函数各一组；端到端用假 AnkiConnect（记录收到的请求）：正常添加并写回 ID、中文字段名映射、HTML 最小转换（`$…$`、`$$…$$`、`**`、换行）、duplicate、其它错误、连不上（exit 1 且文件不变）、`书房::` 收到 `setDeckConfigId`、没有「书房」牌组时 `presetMissing`、没有待同步卡时不连 Anki、`--dry-run`。
2. `bin/xuegen-data-root.mjs` 测试：新建两条链接与 `wiki.json`、重复运行跳过、真实目录 / 别的链接 / 缺子目录三种拒绝、`--dry-run` 不改。
3. 协议：`cards.sync` 合法与非法样例；handler：`dryRun` 时带 `--dry-run`、超时用 120 秒。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文）

审核结论与修改、新增测试清单、验收输出、未完成项。
