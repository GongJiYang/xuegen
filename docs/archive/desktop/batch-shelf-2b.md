# batch-shelf-2b（Devin 写基础代码）：今日卡的书房行——读完这段、撤销、摘几句

设计稿：`design/animate/?d=shelf`（11-08 批准）与 `?d=shelf2`（11-09 批准）的**今日卡部分**。阅读面板是下一批（2c），本批不碰。脚本与主进程接口已在 2a 做好（`shelf.today` / `shelf.done` / `shelf.extract`）。

## 硬约束（压缩后也要记得）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`，再读本批要改的每个文件全文。
- **只做 Bear 的视觉**；bare 与 chicago 只补能编译、能用的最小实现（无样式）。
- 决策逻辑放 `core/board/control-card.ts`（纯函数，不读时间）；状态与副作用放 `core/board/use-*.ts`；文案只放 `core/strings.ts`；皮肤里不写中文。
- Bear 样式只用 `skins/bear/skin.css` 里已有的变量（`--gray-*`、`--accent-*`、`--warn-*`、`--done-*`、`--sp-*`、`--r-*`、`--fs-*`/`--lh-*`），不写散值，选择器都以 `[data-skin="bear"]` 开头。
- `App.tsx` 现在 447 行，上限 450：本批**只允许在 App.tsx 加 1 行**（见 §5）。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`/`@ts-ignore`。**不写新测试**（DeepSeek 补），已有测试因类型变化报错时只做最小修正并在报告里列出。

## 1. 脚本：`skills/reading/bookshelf.mjs` 的 `bookView` 加两个字段

`bookView(page, today)` 返回值加：
- `doneToday`：`position > 0 && recordDate(page.body, position) === today`（`recordDate` 是上一批加的函数，直接用）。
- `doneChunk`：`doneToday ? chunks[position - 1] : null`。

其它字段不动。

## 2. `apps/desktop/src/shared/data-protocol.ts`

`ShelfBook` 加：
```ts
  /** True when today's record already holds 「第 position 段」: today's block is read. */
  doneToday: boolean;
  /** The block read today (`chunks[position - 1]`) when `doneToday`, else null. */
  doneChunk: ShelfChunk | null;
```

## 3. 新 hook：`apps/desktop/src/renderer/core/board/use-shelf.ts`

```ts
export interface ShelfResource {
  today: BoardResource<ShelfToday>;
  list: BoardResource<ShelfListItem[]>;
  /** Record today's block of `slug` as read; reloads `today` and `list`. */
  done(slug: string): Promise<boolean>;
  /** Save one extract line; reloads `list`. Resolves the failure message, or null on success. */
  extract(slug: string, page: number, text: string): Promise<string | null>;
  reload(): void;
}
export function useShelf(): ShelfResource
```
- `today` 用 `useBoardResource(() => client.data({ kind: "shelf.today", today: dateKey(new Date()) }), [])`；`list` 用 `shelf.list`。`dateKey` 从 `./use-calendar.js` 引。
- `done`：`client.data({ kind: "shelf.done", slug, today: dateKey(new Date()) })`，`ok` 时 `reload()`，返回 `result.ok`。
- `extract`：`client.data({ kind: "shelf.extract", slug, page, text, today: dateKey(new Date()) })`；`ok` 时 `list.reload()` 并返回 `null`，否则返回 `result.error`。
- 文件头写一段 JSDoc（照 `use-reading.ts` 的风格）。

`core/board/use-reading.ts`：`ReadingResource` 加 `shelf: ShelfResource;`，`useReading()` 里 `const shelf = useShelf();`，返回对象加 `shelf`，`reload()` 里加 `shelf.reload();`。

## 4. 纯函数：`apps/desktop/src/renderer/core/board/control-card.ts`

1. `ControlCardAction` 加三种：
   ```ts
   | { kind: "shelfDone"; slug: string }
   | { kind: "undoShelf" }
   | { kind: "extract"; slug: string; pages: string }
   ```
2. `ControlCardRow` 加可选 `sub?: string | null;`（JSDoc：行尾灰色的补充说明）。已有的行不用改。
3. `controlCard` 的 input 加 `shelf?: ShelfToday | null;`（JSDoc：`shelf.today`，书房在读的书）。
4. 新的内部函数 `shelfRows(shelf: ShelfToday): ControlCardRow[]`，规则（文案都走 `strings.control.card`，见 §7）：
   - 对 `shelf.planned`（前缀 `card.shelfPlanned` = 「读书 · 」）和 `shelf.free`（前缀 `card.shelfFree` = 「自由读 · 」）各调一次 `bookRow(prefix, book)`：
     - `book.doneToday && book.doneChunk`：`mark "done"`，`text = prefix + card.shelfChunk(book.short, book.doneChunk)`，`sub = book.chunk ? card.shelfDoneSub(book.chunk) : card.shelfFinished`，`button = card.extract`，`action = { kind: "extract", slug, pages: \`pp.${doneChunk.from}–${doneChunk.to}\` }`，`hint = card.extractHint`。
     - 否则 `book.chunk` 非 null：`mark = book.late > 0 ? "warn" : "plan"`，`text = prefix + card.shelfChunk(book.short, book.chunk)`，`sub` = 下面几段非空者用 ` · ` 连起来：`card.shelfDay(book.position + 1, book.total)`；`late > 0` 时 `card.shelfLate(book.late, book.end)`；`coreOverlap` 非 null 时 `card.shelfCore(book.coreOverlap)`。`button = card.shelfDone`，`action = { kind: "shelfDone", slug }`，`hint = card.shelfDoneHint`。
     - 否则（读完了）不出行。
   - `shelf.planned !== null && shelf.free === null` 时再加一行：`mark "plan"`，`text = card.shelfFreeEmpty`，`sub = card.shelfFreeEmptySub`，`button null`，`action null`，`hint null`。
5. 插入位置：
   - 普通日：在「讲后读」各行之后、阅读队列各行之前，`rows.push(...shelfRows(input.shelf))`（`input.shelf` 为 null/undefined 时跳过）。
   - **休息日也要读书**（用户定：每天都读）：休息日分支返回 `[淡行, ...shelfRows(...)]`，淡行不变。
6. 新导出 `withPendingShelf(view, pending: { slug: string; left: number } | null): ControlCardView`：照 `withPendingRead` 写；命中 `action.kind === "shelfDone" && action.slug === pending.slug` 的行 → `{ mark: "done", text: row.text, sub: card.shelfPendingSub, button: card.undo(pending.left), action: { kind: "undoShelf" }, hint: null }`。
7. 新导出 `withExtractCount(view, counts: Record<string, number>): ControlCardView`：`action.kind === "extract"` 且 `counts[slug] > 0` 的行，`sub` 末尾加 ` · ` + `card.extracted(counts[slug])`。
8. 新导出纯函数 `parsePageInput(text: string): number | null`：去空格后匹配 `/^(?:p\.?\s*)?(\d{1,5})$/i`，数字 1–99999 返回数字，否则 `null`。

## 5. hook：`core/board/use-control-card.ts`

1. `ControlCardInput` 加 `shelf: ShelfResource;`。
2. `view` 的 `controlCard({...})` 传 `shelf: input.shelf.today.state.status === "ready" ? input.shelf.today.state.value : null`，依赖数组加 `input.shelf.today.state`。
3. 撤销窗口泛化：`pending` 状态改成
   `{ kind: "afterRead"; slug: string; label: string; deadline: number } | { kind: "shelf"; slug: string; deadline: number } | null`。
   - `write(entry)` 按 `entry.kind` 分支：`afterRead` 照旧；`shelf` 调 `input.shelf.done(entry.slug)`，失败 `setError(strings.control.card.shelfDoneFailed)`。两支都 `setWriting(true/false)`。
   - `onAction`：`shelfDone` → 与 `afterRead` 相同的逻辑（窗口内再点先提交旧的），`setPending({ kind: "shelf", slug, deadline })`；`undoShelf` → `setPending(null)`。`afterRead` 改成带 `kind: "afterRead"`。
   - 显示：先 `withPendingRead`（只在 `pending.kind === "afterRead"` 时传），再 `withPendingShelf`（只在 `pending.kind === "shelf"` 时传），再 `withExtractCount(…, counts)`。
4. 摘几句：
   - 新状态 `extracting: { slug: string; pages: string } | null`、`extractError: string | null`、`saving: boolean`、`counts: Record<string, number>`（本次打开应用里各书存了几句）。
   - `onAction` 的 `extract` → `setExtracting({ slug, pages })`、`setExtractError(null)`。
   - 返回的 props 加 `extract`（见 §6）：`extracting` 为 null 时 `null`；否则
     `{ slug, pages, saving, error: extractError, onCancel: () => setExtracting(null), onSave(pageText, text) }`。
     `onSave`：`parsePageInput(pageText)` 为 null → `setExtractError(card.extractPageInvalid)`；`text.trim()` 为空 → `setExtractError(card.extractTextEmpty)`；否则 `setSaving(true)`，`input.shelf.extract(slug, page, text)`，返回 null → `setExtracting(null)`、`counts[slug] += 1`；返回字符串 → `setExtractError(card.extractFailed)`；最后 `setSaving(false)`。
5. `busy` 改为 `input.streaming || writing || saving`。
6. 文件头 JSDoc 补一句书房行与摘几句。

`App.tsx`：`useControlCard({ ... })` 里在 `queue: reading.queue,` 下面加一行 `shelf: reading.shelf,`。**App.tsx 只改这一行。**

## 6. 契约：`skins/contract.ts`

```ts
/** The inline 「摘几句」 form under a 书房 row of the 今日卡. */
export interface ControlCardExtract {
  /** The book the form saves into (matches the row's `extract` action). */
  slug: string;
  /** The block just read, e.g. 「pp.1–9」, shown as the page field's placeholder. */
  pages: string;
  saving: boolean;
  /** A one-line error (bad page, empty text, failed write), else null. */
  error: string | null;
  onSave(page: string, text: string): void;
  onCancel(): void;
}
```
`ControlCardProps` 加 `extract: ControlCardExtract | null;`。

## 7. 文案：`core/strings.ts` 的 `control.card`

```ts
foot: "来自周期页、课程页与书房 · 改计划在下面直接跟总控说",   // 改
afterReadHint: "在课程页把这行打勾（记「用户自报」），并记进书房的书页；10 秒内可撤销",   // 改
shelfPlanned: "读书 · ",
shelfFree: "自由读 · ",
shelfChunk: (short: string, chunk: { title: string; from: number; to: number }): string => `${short} ${chunk.title} · pp.${chunk.from}–${chunk.to}`,
shelfDay: (n: number, total: number): string => `第 ${n} / ${total} 天`,
shelfLate: (days: number, end: string): string => `晚了 ${days} 天，读完日期顺延到 ${end.slice(5)}`,
shelfCore: (pages: string): string => `其中 ${pages} 讲后读读过，照读`,
shelfDone: "读完这段",
shelfDoneHint: "记下这段读完了，明天换下一段；10 秒内可撤销",
shelfPendingSub: "已记下",
shelfDoneSub: (next: { from: number; to: number }): string => `已记下，明天 pp.${next.from}–${next.to}`,
shelfFinished: "已记下，这本读完了",
shelfFreeEmpty: "自由读 · 还没有书",
shelfFreeEmptySub: "想读什么，跟总控说一声",
shelfDoneFailed: "没能记进书房，请再点一次「读完这段」。",
extract: "摘几句",
extractHint: "存一句原文和页码进书页，不调模型",
extracted: (n: number): string => `摘了 ${n} 句`,
extractPage: "页码",
extractText: "原句（粘贴或手打，一次一句）",
extractSave: "存进书页",
extractCancel: "取消",
extractNote: "只存原句和页码，不调模型。做卡在「阅读」面板里一次做一批。",
extractPageInvalid: "页码写数字，比如 11。",
extractTextEmpty: "原句不能是空的。",
extractFailed: "没能存进书页，请再试一次。",
```

## 8. 皮肤

### Bear：`skins/bear/control-card.tsx` + `skins/bear/skin.css`
1. 每行：`row.sub` 非空时，在 `.bear-cc-text` 里文字后面加 `<span className="bear-cc-sub"> · {row.sub}</span>`。
2. `extract` 非 null 时，在 `action.kind === "extract" && action.slug === extract.slug` 那一行的 `<li>` **后面**插一个 `<li className="bear-cc-extract">`，内容：
   - `<label className="bear-cc-field">{card.extractPage}<input className="bear-cc-input bear-cc-page" placeholder={extract.pages} …/></label>`
   - `<label className="bear-cc-field bear-cc-grow">{card.extractText}<textarea className="bear-cc-input" rows={2} autoFocus …/></label>`
   - `<div className="bear-cc-extract-btns">` 内 `取消`（`bear-cc-btn`，调 `onCancel`）、`存进书页`（`bear-cc-btn bear-cc-save`，调 `onSave(page, text)`）；两个按钮 `disabled={extract.saving}`。
   - `<p className="bear-cc-note">{card.extractNote}</p>`；`extract.error` 非空时 `<p className="bear-cc-error" role="alert">{extract.error}</p>`。
   - 页码与原句的输入值是组件内 `useState`（表单本地输入，不是决策）。`Escape` = 取消；在原句框里 `⌘Enter` = 存。
3. CSS（加在 `.bear-cc-error` 规则之后）：
   ```css
   [data-skin="bear"] .bear-cc-sub { color: var(--gray-11); font-weight: 400; font-size: var(--fs-2); line-height: var(--lh-2); }
   [data-skin="bear"] .bear-cc-rows li[data-mark="done"] .bear-cc-sub { text-decoration: none; display: inline-block; }
   [data-skin="bear"] .bear-cc-rows li.bear-cc-extract { display: flex; flex-wrap: wrap; gap: var(--sp-2); padding: var(--sp-3); margin: var(--sp-1) 0 var(--sp-2) var(--sp-5); border: 1px solid var(--gray-6); border-radius: var(--r-2); }
   [data-skin="bear"] .bear-cc-field { display: flex; flex-direction: column; gap: var(--sp-1); font-size: var(--fs-1); line-height: var(--lh-1); color: var(--gray-11); }
   [data-skin="bear"] .bear-cc-grow { flex: 1; min-width: 0; }
   [data-skin="bear"] .bear-cc-input { font: inherit; font-size: var(--fs-2); line-height: var(--lh-2); color: var(--gray-12); background: var(--gray-1); border: 1px solid var(--gray-8); border-radius: var(--r-1); padding: var(--sp-1) var(--sp-2); resize: vertical; }
   [data-skin="bear"] .bear-cc-input:focus { outline: 2px solid var(--accent-11); outline-offset: 0; }
   [data-skin="bear"] .bear-cc-page { width: 8em; }
   [data-skin="bear"] .bear-cc-extract-btns { display: flex; gap: var(--sp-2); width: 100%; justify-content: flex-end; }
   [data-skin="bear"] .bear-cc-save { color: var(--accent-11); font-weight: 500; }
   [data-skin="bear"] .bear-cc-note { width: 100%; margin: 0; font-size: var(--fs-1); line-height: var(--lh-1); color: var(--gray-11); }
   [data-skin="bear"] .bear-cc-btn:disabled { color: var(--gray-11); background: none; cursor: not-allowed; }
   ```
   （`li[data-mark="done"] .bear-cc-text` 有删除线，`.bear-cc-sub` 放在 text 里时用 `display: inline-block` 断开删除线——这样「已记下」不被划掉。）

### bare 与 chicago：`skins/<id>/control-card.tsx`
- `row.sub` 非空时在文字后面加 ` · {row.sub}`。
- `extract` 非 null 时，在 `<ul>` 后面渲染一个最简表单（两个输入 + 两个按钮 + 说明 + 错误），文案同上，无样式。

## 9. 画廊

`gallery/panel-samples.ts` 加：
- `SAMPLE_SHELF_TODAY: ShelfToday`：planned = Epp（`short "Epp"`、`total 81`、`position 1`、`chunk {index 2, title "Ch1 §1.1–1.4", from 10, to 18}`、`plannedEnd "2027-01-28"`、`end "2027-01-29"`、`late 1`、`coreOverlap "pp.12–15"`、`doneToday false`、`doneChunk null`），free = null。
- `SAMPLE_CONTROL_CARD_SHELF` = 深度日 + `shelf: SAMPLE_SHELF_TODAY`；`SAMPLE_CONTROL_CARD_SHELF_DONE` = 同上但 planned `doneToday true`、`position 2`、`doneChunk {index 2…10–18}`、`chunk {index 3 … 19–27}`，再 `withExtractCount(…, { epp: 1 })`；`SAMPLE_CONTROL_CARD_SHELF_PENDING` = `withPendingShelf(SAMPLE_CONTROL_CARD_SHELF, { slug: "epp", left: 7 })`。
- `gallery/Gallery.tsx` 的 ControlCard 一节加三张：上面三个样例；`SHELF_DONE` 那张传 `extract={{ slug: "epp", pages: "pp.10–18", saving: false, error: null, onSave: noop, onCancel: noop }}`，其余 `extract={null}`。已有的 `<slots.ControlCard …>` 都补 `extract={null}`。

## 10. 文档

`core/board/README.md`：表里加 `use-shelf.ts` 一行；`use-control-card.ts` 那行补「读完这段（10 秒可撤销）写 `shelf.done`；摘几句写 `shelf.extract`」；`control-card.ts` 那行补书房行。

## 完成标准（可观察）

- `npm run typecheck`、`lint`、`vitest`、`build` 全过；`App.tsx` ≤ 450 行。
- 画廊 Bear 下能看到：Epp 行（琥珀，「晚了 1 天…」「其中 pp.12–15 讲后读读过，照读」「读完这段」）、「自由读 · 还没有书」行、✓「撤销 · 7」行、✓「已记下，明天 pp.19–27 · 摘了 1 句」+ 下面的摘几句表单。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -3
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && wc -l apps/desktop/src/renderer/App.tsx && git status --short
```

## 结束报告（中文）

改了哪些文件、每节是否照做、偏离之处及原因、未完成项，附验收输出。
