# batch-panel-a-data（Devin，约 1.5 小时，先写测试）：总控面板的数据（不做界面）

背景：`docs/desktop/PANEL-PLAN.md`（用户 11-12 批准）；设计稿 `/Users/gjy/pi-learning/design/animate/src/dash.jsx`（`http://localhost:5181/?d=dash`，先看一眼「状态格」「书房」两块）。界面由 Claude 另写，**本批不改任何组件、样式、契约（`skins/`）、`App.tsx`**。

约束：不加依赖；不 commit / push；**自己做完，不要调用别的 agent**；取「今天」只用 `renderer/core/today.ts`（`apps/desktop/AGENTS.md` §12）；用户可见文字只进 `renderer/core/strings.ts`（新开 `strings.panel` 一节），`npm test` 末尾 `lint-wording` 0 处。

## 1. 协议补字段（`apps/desktop/src/shared/data-protocol.ts`）
脚本已经输出、协议还没写的字段，照实补上（不改脚本）：
1. `ShelfListItem` 加 `target: string | null; targetLate: number | null;`（`bookshelf.mjs list --json` 已有：目标日期；`end` 比目标晚几天，不晚为 0，没目标为 null）；`status` 联合类型加 `"paused"`（见第 2 节）。
2. `CycleOverview.cycle` 加 `plannedEnd: string; delayDays: number;`（`cycle.mjs overview --json` 已有）。
3. `CardsStats` 加 `broken: number;`（`flashcards.mjs stats --json` 已有：缺 END 的卡片块数）。
4. 改完跑 typecheck，修好所有因此报错的夹具（只补字段，不改断言）。

## 2. 书房暂停 / 恢复（`skills/reading/bookshelf.mjs` + `bookshelf.test.mjs`）
用户 11-12 定：暂停 = 停在当前进度、不再往后排；恢复后从明天接着排。
5. **先写测试**，再实现：
   - `pause <vault> <slug> [--today D] [--json]`：只对 `reading` 的书有效（别的状态报错，非 0 退出，中文说原因）；frontmatter `status: paused`，`## 读书记录` 追加 `- <today>: 暂停`；重写 index（同 `done` 的做法）。
   - `resume <vault> <slug> [--today D] [--json]`：只对 `paused` 有效；`status: reading`，`started` 改成**明天**减去已读段数（让 `planRows` 从明天接着排，已读段 position 不变），`## 读书记录` 追加 `- <today>: 恢复，明天接着读`；重写 `## 排期` 与 index。
   - `STATUSES` 加 `"paused"`；`today` 不给暂停的书出今天的段；`list` 照常列出（status 为 paused，`upcoming` 为 `[]`，`end` 为 null 时协议里 `end` 写空串还是 null——按现有 `done` 书的写法保持一致，写进测试）；**计划内的书暂停时不自动开排队的下一本**（计划内一次一本，暂停仍占位）。
   - `usage()` 补两行说明。
   - 测试：暂停后 today 没有这本；暂停非 reading 报错；恢复后明天那段是原来的下一段；暂停期间排队书不开；index 里显示「暂停」。

## 3. 面板纯函数（新文件 `apps/desktop/src/renderer/core/board/panel.ts` + `panel.test.ts`）
不读时钟（`today` 作参数）、不发请求。复用已有函数，**不要另算一遍同一事实**：今天 / 本周的项来自 `planbook.ts` 的 `buildDay` / `buildWeek` 结果；Anki 张数用 `cycle-today.ts` 的 `ankiDueCount`。
6. `panelTiles(input): PanelTile[]`，`PanelTile = { key: "cycle" | "today" | "week" | "shelf" | "anki" | "cards"; value: string; sub: string; warn: boolean }`。输入 `{ today, overview: CycleOverview | null, day: PlanDay | null, week: PlanWeek | null, shelf: ShelfListItem[] | null, anki: AnkiStatus | null, cards: CardsStats | null }`。文字全部来自 `strings.panel`，照设计稿 `TILES`：
   - cycle：`C1 · 第 1 / 7 周`；sub `预计 12-29 结束 · 比计划晚 5 天`（`delayDays > 0` 时 warn）；不在周期内 `value: "不在周期内"`、sub 空。
   - today：`已完成项 / 总项`（`day.items`，不含 Anki）；sub `主攻日 · 离散 D3 待上`（日子类型用对用户的叫法「主攻日」——见 SKIN-LEDGER 词表；第一个未完成主项课的短名 + 课次 +「待上」；都做完写「今天的都做完了」）。
   - week：`已完成 / 总项`（全周 items）；sub：有 `warn` 项时 `N 项过了日子还没做`（warn），否则空。
   - shelf：`N 本在读`（status reading 的书 + overview 里 role aux 的课）；sub：有 `targetLate > 0` 的书时取最晚那本 `<short> 照现在会比目标晚 N 天`（warn），否则空。
   - anki：`anki.running` 为 false → value `没开`、sub `打开 Anki 后显示今天的张数`；否则 `N 张`、sub `今天要复习 · 已连接`。**不提没刷、不催**（用户 11-11）。
   - cards：`N 张待同步`（unsynced）；sub `共 T 张 · D 个牌组`，`broken > 0` 时 sub 改 `共 T 张 · B 张格式不全`（warn）。
   - 任一输入为 null（还在读取）时，那一格 `value: ""`、`sub: ""`，由界面画加载态。
7. `shelfRows(input): ShelfRow[]`，`ShelfRow = { kind: "book" | "guide"; slug: string; short: string; title: string; mode: "after-self" | "self" | "guide"; done: number; total: number; unit: "段" | "节"; meta: string; warn: boolean; status: "reading" | "paused" | "queued"; target: string | null }`。输入 `{ today, shelf: ShelfListItem[], overview: CycleOverview, week: PlanWeek | null }`：
   - 书：status reading / paused / queued 的（done 的不列）；`mode`：本周 `week` 里有 lane `after` 且 `slug` 是这本书、或 `coreRead` 非空 → `after-self`，否则 `self`；meta 照设计稿：`预计 01-30 读完 · 目标 01-15，会晚 15 天`（没目标就只写预计；paused 写 `已暂停 · 读到第 n 段`；queued 写 `排在 <前一本 short> 后面 · 预计 … 读完`）。
   - 带读：`overview.courses` 里 `role === "aux"` 的课 → kind guide、mode guide、unit 节、meta `周一、周三 · 预计 12-23 读完`（星期来自 `overview.cycle.subjectDays[subject]`，日期 = `end`）。
   - 顺序：在读的书 → 带读 → 暂停 → 排队。
8. `unplannedMaterials(subjects: SubjectsOverview): { subject: string; subjectTitle: string; title: string; type: string; role: string }[]`：所有科目 `materials` 里 `mark === "none"`（◌ 未制定计划）的资料，按科目顺序。
9. 测试（`panel.test.ts`，夹具复用 `consistency-fixture.ts` 的 11-11 / 11-12 数据，**不要改 `consistency.test.ts`**）：
   - 六格各自的正常、warn、null（加载中）三种；Anki 没开；不在周期内；
   - shelfRows：Epp 是 after-self 且 meta 含「会晚 15 天」；两门带读的星期与预计日期；暂停书的 meta；排队书排最后；
   - unplannedMaterials：只取 ◌ 的。
10. **跨处一致**：在 `panel.test.ts` 里加一条：同一份夹具，`panelTiles` 的今天完成数与 `buildDay` 里 done 的项数相同、Anki 张数与今日卡（`control-card.ts` 的同一函数）相同。

## 这个事实 / 这段文字还在哪些地方显示（审核逐处核对）
- 今天完成项：今日卡（`control-card.ts`）、计划本日视图（`planbook.ts`）、侧栏「今天」（`cycle-today.ts`）。
- Anki 张数：今日卡、侧栏卡片、计划本今天 Anki 格。
- 书的预计 / 目标：侧栏阅读面板书房一节（`shelf-view.ts`）。
- 周期晚几天：侧栏总进度（`plan-view.ts`）。
`grep -rn "delayDays\|targetLate\|ankiDueCount" apps/desktop/src/renderer` 的结果附在报告里。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files" && npm run -s build 2>&1 | tail -1
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -3
```

## 结束报告（中文）
每条改了哪些文件；先失败的测试；验收输出；上面 grep 的结果；偏离本单之处与原因。
