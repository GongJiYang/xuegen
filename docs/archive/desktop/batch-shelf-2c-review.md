# batch-shelf-2c-review（DeepSeek）：审核 + 补测试（阅读面板书房一节）

Devin 按 `docs/desktop/batch-shelf-2c.md` 写完了基础代码（未提交）。你负责 A 审核（问题直接修）与 B 补测试。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`、`docs/desktop/batch-shelf-2c.md`（规格）、`skins/chicago/reading-panel.test.tsx`（测试写法照它）。
- 不读写 `~/.xuegen/`、不碰真实 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`/`@ts-ignore`。`App.tsx` 不许再加行（≤ 450）。
- 只改本批文件：`skills/reading/bookshelf.mjs`（及测试）、`shared/data-protocol.ts`、`renderer/core/board/{shelf-view,shell-panels}.ts` 及测试、`renderer/skins/bear/{reading-panel,reading-row}.tsx` 及测试、`renderer/skins/bear/skin.css`（只限 `.bear-shelf-*`）、`renderer/skins/{bare/panels,chicago/reading-panel}.tsx` 及测试、`renderer/core/strings.ts`（只限 `reading`）、`renderer/gallery/*`、`renderer/core/board/README.md`。**输入框（`composer.tsx`、`useChat.ts`、`contract.ts` 的 `ComposerProps`）另有返修，别碰。**

## A. 审核（逐节对照规格）

1. `list` 的 `upcoming`：只含 `index > position` 的块、最多 5 条、日期来自新的 `planRows`（今天已读完则从明天起）；`done` 的书为 `[]`。
2. `shelfPanel`：planned/free 取 `status: reading`；`next` 的「今天：」与「下一段 MM-DD：」分支；`later` 是 `upcoming.slice(1)`；`coreRead` 按日期倒序；`pending` 计数；排队按 `order`（null 最后）、日期串接（第一本从 planned `end` 次日起，没有 planned 从 today 起）、`after` 是前一本的 short。
3. `onShelfCards`：发出的 prompt 含书的 short、slug、待做卡句数；书不存在或 list 未就绪时什么都不做。`App.tsx` 那行 `onDraftCards: (prompt) => controller.send(prompt ?? strings.cards.draftPrompt)` 不给 prompt 时仍发卡片面板原来的 prompt。
4. Bear：三节出现条件（planned 无则连标题不出、queue 空不出、全空整块不出）；loading/error；「把 N 句做成卡 →」只在 `pending > 0` 时出现；进度条 `role="progressbar"` 带 `aria-valuenow/max`；样式只用变量。
5. `reading-row.tsx` 是原 `ReadingRow` 原样搬出（行为与原来一致，原有测试照样过）。

## B. 补测试

1. `skills/reading/bookshelf.test.mjs`：`list` 的 `upcoming`（≤ 5 条、从 position 之后起、当天 done 后第一条是明天、done 的书 `[]`）。
2. `core/board/shelf-view.test.ts`（新）：§A2 每条一个用例，含 `next` 两个分支、排队三本的日期串接、无 planned 时从 today 起、`order` 为 null 排最后、全空返回 `{ planned: null, queue: [], free: null }`。
3. `core/board/shell-panels` 的测试（没有就新建 `shell-panels.test.ts`）：`onShelfCards` 发出的 prompt；list 未就绪时不发。
4. Bear `reading-panel` 测试（新建或扩充）：完整样例下三节标题、进度条属性、「把 2 句做成卡 →」点击调 `onShelfCards("epp")`；全空时没有书房标题；loading 与 error 各一行。bare/chicago 各一条：有书时显示书名与按钮。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
wc -l /Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/App.tsx && cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文）

1. 审核：每节结论、问题、修改。
2. 新增测试清单（每条一句）。
3. 验收输出。
4. 未完成项 / 需要 Claude 决定的事。
