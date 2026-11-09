# batch-stage1-anki-dataroot（Devin 写基础代码）：卡片直连 AnkiConnect + 数据根设置脚本

路线 `docs/platform/ROUTE-1109.md` 阶段 1 剩下的两项。**不做任何界面**（用户 11-09：界面暂停，另行讨论）——不改 `renderer/skins/**`，不加界面文案。

## 硬约束（压缩后也要记得）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`、`docs/platform/PRINCIPLES.md`，再读 `skills/wiki-save/flashcards.mjs` 与 `skills/wiki-save/SKILL.md` 全文。
- 脚本零依赖（只用 `node:` 内置，AnkiConnect 用全局 `fetch`）；照 `flashcards.mjs` 的写法（`fail`、`parseArgs`、`--json`）。
- 写文件一律原子：写临时文件 → `rename`。
- 不读写真实 `~/.xuegen/`、不碰真实库（`~/学根/库`）、不连真实 Anki（测试用假的 AnkiConnect：在测试里起一个 `node:http` 服务模拟）、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint。**不写新测试**（DeepSeek 补），只保证现有测试通过。

## 一、`skills/wiki-save/anki-sync.mjs`（新）

把库里的卡片块直接写进 Anki，取代 Obsidian_to_Anki 插件（格式保持兼容：插件以后再扫也会因为已有 ID 而跳过）。

### 卡片页格式（现有，照读）
`<库>/wiki/知识/flashcards/**/*.md`：
```
TARGET DECK
Mathematics::DiscreteMath::EppCh1        ← 这一页的牌组（没有就用 Default）

FILE TAGS                                 ← 可选，下一行是空格分隔的标签
discrete epp

START
Basic                                     ← 笔记类型名
正面，可以多行
Back: 背面，可以多行
<!--ID: 1794060104186-->                  ← 已同步的卡才有；在 END 前一行
END
```
- 正面 = `START` 后第二行起到 `Back:` 行之前；背面 = `Back:` 之后（去掉前缀）到 `<!--ID` 行或 `END` 之前；两者都 `trim`。
- 只处理笔记类型 `Basic`（库里 508 张全是 Basic）；遇到别的类型记进 `skipped`，不报错。
- 忽略 `STARTI/ENDI`、`DELETE`、`FROZEN`（库里没有用到）。

### 命令
```
node anki-sync.mjs push <vault> [--dry-run] [--json] [--url http://127.0.0.1:8765]
```
1. 扫描所有卡片页，找出**没有 ID 的块**。
2. 先调 AnkiConnect `version`；连不上 → `fail("连不上 Anki：请打开 Anki 并确认装了 AnkiConnect")`，**不写任何文件**。
3. `modelFieldNames("Basic")` 取字段名，第 1 个字段放正面、第 2 个放背面（用户的 Anki 可能是中文字段名）。
4. 每个用到的牌组 `createDeck`（已存在也安全）。牌组名以 `书房::` 开头时，再把它设成预设「书房」：`getDeckConfig("书房")` 取到预设 id，`setDeckConfigId({ decks: [牌组], configId })`；没有名为「书房」的牌组时跳过并在输出里写 `presetMissing: true`。
5. 正面、背面转 HTML（最小转换）：`$$…$$` → `\[…\]`，`$…$` → `\(…\)`，`**x**` → `<b>x</b>`，换行 → `<br>`；其余原样。
6. 逐块 `addNote({ deckName, modelName: "Basic", fields, tags: ["xuegen", ...文件标签] , options: { allowDuplicate: false } })`。成功 → 在这块的 `END` 前插入一行 `<!--ID: <noteId>-->`；返回 `duplicate` 错误 → 记进 `duplicates`，不插 ID；别的错误 → 记进 `failed`。
7. 每个卡片页处理完**一次性**原子写回（只有插了 ID 的页才写）。
8. `--dry-run`：只扫描并列出要加的卡，不连 Anki、不写文件。
9. 输出 `{ added: n, duplicates: [...], failed: [...], skipped: [...], decks: [...], presetMissing: bool }`；`--json` 时打印 JSON。

纯函数（`export`，供测试）：`parseCardPage(text) → { deck, tags, blocks: [{ start, end, type, front, back, id }] }`、`toAnkiHtml(text)`、`insertIds(text, [{ blockIndex, id }])`。

## 二、主进程数据接口

- `shared/data-protocol.ts`：`DataRequest` 加 `| { kind: "cards.sync"; dryRun: boolean }`；`DataResponseMap` 加 `"cards.sync": { added: number; duplicates: unknown[]; failed: unknown[]; skipped: unknown[]; decks: string[]; presetMissing: boolean }`；`isDataRequest` 校验 `dryRun` 是布尔。
- `main/data/handler.ts`：照 `cards.stats` 的写法跑 `wiki-save/anki-sync.mjs push <vault> --json`（`dryRun` 时加 `--dry-run`）。**不接任何界面**（界面另行讨论）。
- `main/data/README.md` 补一行。

## 三、技能文字（Claude 之后会改，本批只加一句）

`skills/wiki-save/SKILL.md`：在「写入卡片」那一节末尾加一行：「卡写进卡片页后运行 `node <本技能目录>/anki-sync.mjs push "<库根>"` 直接同步到 Anki；Anki 没开就告诉用户打开 Anki 后再同步，不要让用户去 Obsidian 里点同步。」

## 四、数据根设置脚本 `bin/xuegen-data-root.mjs`（新）

新电脑上一条命令接好数据根（现状见 `docs/platform/NEW-MACHINE.md` 第 3 步）：
```
node bin/xuegen-data-root.mjs <数据根> [--home <XUEGEN_HOME>] [--dry-run]
```
1. 检查 `<数据根>/库`、`<数据根>/会话`、`<数据根>/工作区` 存在（不存在就 `fail`，不新建库）。
2. `<home>/sessions`：不存在 → 建链接指向 `<数据根>/会话`；已是指向它的链接 → 跳过；是别的链接或真实目录 → `fail`（不覆盖、不合并）。
3. `~/learning`（可用 `--learning <路径>` 覆盖，测试用）同理指向 `<数据根>/工作区`。
4. `<home>/wiki.json` 写 `{ "root": "<数据根>/库" }`（原子写；已有且相同就跳过）。
5. `--dry-run` 只打印要做什么。每一步打印结果。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
# 手动试（临时目录，不碰真实库和 Anki）：
mkdir -p /tmp/anki-try/wiki/知识/flashcards/t && printf 'TARGET DECK\n书房::Epp\n\nSTART\nBasic\n逆否命题与原命题等价吗？\nBack: 等价，$p \\to q \\equiv \\neg q \\to \\neg p$\nEND\n' > /tmp/anki-try/wiki/知识/flashcards/t/a.md
node skills/wiki-save/anki-sync.mjs push /tmp/anki-try --dry-run --json
node skills/wiki-save/anki-sync.mjs push /tmp/anki-try --url http://127.0.0.1:1 --json; echo "exit=$?"   # 连不上：应失败且不写文件
node bin/xuegen-data-root.mjs /tmp/dr-try --home /tmp/dr-home --learning /tmp/dr-learning --dry-run
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文）

改了哪些文件、每节是否照做、偏离之处及原因、未完成项，附验收输出。

## 注意

另一个返修正在同时修改 `apps/desktop/src/agent/**`、`shared/protocol.ts`、`renderer/core/chat/**` 与三个皮肤里显示报错的地方。不要碰这些文件；验收时若它们的测试或类型暂时失败，等一会儿重跑，不要去修。
