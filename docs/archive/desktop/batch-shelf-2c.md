# batch-shelf-2c（Devin 写基础代码）：阅读面板的书房一节

设计稿：`design/animate/?d=shelf`（11-08 批准）与 `?d=shelf2`（11-09 批准）的**阅读面板部分**。今日卡（2b）已做完，本批不碰今日卡。

## 硬约束（压缩后也要记得）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`，再读本批要改的每个文件全文。
- **只做 Bear 的视觉**；bare 与 chicago 只补能编译、能用的最小实现（无样式）。
- 决策逻辑放 `core/board/shelf-view.ts`（新，纯函数，`today` 作参数）；文案只放 `core/strings.ts`；皮肤里不写中文。
- Bear 样式只用 `skins/bear/skin.css` 已有变量（`--gray-*`、`--accent-*`、`--warn-*`、`--done-*`、`--sp-*`、`--r-*`、`--fs-*`/`--lh-*`），选择器以 `[data-skin="bear"]` 开头，不写散值。
- **`App.tsx` 一行都不加**（现在 448 行，上限 450），只允许改 §5 说的那一行的内容。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`/`@ts-ignore`。**不写新测试**（DeepSeek 补）；已有测试因类型变化报错时只做最小修正并列出。

## 1. 脚本：`skills/reading/bookshelf.mjs` 的 `list` 加 `upcoming`

`commandList` 每本书的对象加 `upcoming`：`planRows(page, today).rows.filter((row) => row.index > bookPosition(page)).slice(0, 5)`，每项 `{ index, date, title, from, to }`。`status` 为 `done` 的书给 `[]`。

## 2. 协议：`shared/data-protocol.ts`

```ts
/** One upcoming block of a book's schedule (`bookshelf.mjs list`): when to read which pages. */
export interface ShelfUpcoming { index: number; date: string; title: string; from: number; to: number }
```
`ShelfListItem` 加 `upcoming: ShelfUpcoming[];`。

## 3. 纯函数：`core/board/shelf-view.ts`（新）

```ts
export interface ShelfBookView {
  slug: string; title: string; short: string;
  position: number; total: number;
  /** 0–1 for the progress bar. */
  progress: number;
  end: string;
  /** 「今天：Ch1 §1.1–1.4 · pp.10–18」 or 「下一段 11-10：…」, null when finished. */
  next: string | null;
  /** The rest of `upcoming` as 「11-11 · Ch1 … · pp.19–27」. */
  later: string[];
  coreRead: { pages: string; label: string; date: string }[];
  extracts: { page: number; text: string; carded: string | null }[];
  /** How many extracts are still 「#待做卡」. */
  pending: number;
}
export interface ShelfQueued { slug: string; title: string; total: number; after: string | null; end: string }
export interface ShelfPanelView { planned: ShelfBookView | null; queue: ShelfQueued[]; free: ShelfBookView | null }

export function shelfPanel(list: ShelfListItem[], today: string): ShelfPanelView
```
规则：
1. `planned` = `slot === "planned" && status === "reading"` 的第一本；`free` = `slot === "free" && status === "reading"` 的第一本；都经 `bookView(item, today)` 转换。
2. `bookView`：`progress = total > 0 ? position / total : 0`；`next`：`upcoming[0]` 为空 → `null`；`date === today` → `strings.reading.shelfToday(chunkText)`；否则 `strings.reading.shelfNextOn(date.slice(5), chunkText)`；`chunkText = \`${title} · pp.${from}–${to}\``。`later = upcoming.slice(1).map((row) => \`${row.date.slice(5)} · ${row.title} · pp.${row.from}–${row.to}\`)`。`coreRead` 去掉 `course` 字段原样带过来（按 `date` 倒序）；`extracts` 去掉 `index`；`pending = extracts.filter((e) => e.carded === null).length`。
3. `queue` = `slot === "planned" && status === "queued"`，按 `order` 升序（null 排最后）。逐本串起来算预计读完：第一本 `start = planned ? addDays(planned.end, 1) : today`，`end = addDays(start, total - 1)`；下一本 `start = addDays(上一本 end, 1)`……`after` = 前一本的 `short`（第一本是 `planned?.short ?? null`）。`addDays` 写成本文件内的小函数（UTC 计算，照 `skills/reading/bookshelf.mjs` 的 `addDays`）。
4. 文件头写一段 JSDoc 说明来源与纯函数约定。

## 4. 契约：`skins/contract.ts`

`ReadingPanelProps` 加：
```ts
  /** The 书房 section above the queue (`shelf.list` through `shelfPanel`). */
  shelf: AsyncState<ShelfPanelView>;
  /** 「把 N 句做成卡 →」: ask 学根 to draft cards from one book's pending extracts. */
  onShelfCards(slug: string): void;
```
（`ShelfPanelView` 从 `../core/board/shelf-view.js` 引类型，照 contract 里引 `ControlCardView` 的写法。）

## 5. 组装

1. `core/board/shell-panels.ts`：
   - `ShellPanelsInput.onDraftCards` 改成 `onDraftCards(prompt?: string): void;`（JSDoc：不给 prompt 时用卡片面板的默认 prompt）。
   - `reading` 面板加：
     `shelf`：`reading.shelf.list.state` 是 ready 时 `{ status: "ready", value: shelfPanel(value, input.today) }`，否则原样传 loading/error（照文件里别的 `AsyncState` 转换写法）；
     `onShelfCards: (slug) => { 找到 list 里这本书；input.onDraftCards(strings.reading.shelfCardsPrompt(book.short, slug, pending)) }`（`pending` 用同样的过滤算）。
2. `App.tsx`：把 `onDraftCards: () => controller.send(strings.cards.draftPrompt),` 这一行改成
   `onDraftCards: (prompt) => controller.send(prompt ?? strings.cards.draftPrompt),`。**不加行。**

## 6. 文案：`core/strings.ts` 的 `reading`

```ts
scopeHint: "文章、论文、网页放这里；整本书在上面的书房，每天一段。",   // 改
shelfPlanned: "书房 · 计划内",
shelfQueue: "排队",
shelfFree: "书房 · 计划外",
shelfFreeEmpty: "还没有。跟总控说「我想读《…》」，学根登记这本书、切好每天一段、算出读完日期。",
shelfArticles: "文章与摘录",
shelfMeta: (position: number, total: number, end: string): string => `已读 ${position} / ${total} 段 · 每天一段（≤ 10 页）· 预计 ${end} 读完`,
shelfToday: (chunk: string): string => `今天：${chunk}`,
shelfNextOn: (date: string, chunk: string): string => `下一段 ${date}：${chunk}`,
shelfLater: "接下来几天",
shelfCore: "核心页已读（讲后读）",
shelfCoreLine: (pages: string, label: string, date: string): string => `pp.${pages} · ${label} · ${date.slice(5)}`,
shelfCoreNote: "只作参考：通读照读不跳，读到这几页时今日卡会提一句。",
shelfExtracts: (count: number, pending: number): string => `摘录 ${count} 句 · ${pending > 0 ? `${pending} 句待做卡` : "都做成卡了"}`,
shelfCarded: (date: string): string => `已做卡 · ${date.slice(5)}`,
shelfPending: "待做卡",
shelfCardsHint: "学根按做卡规则出草稿，你看过再进 Anki",
shelfCardsDone: "下次复习由 Anki 的 FSRS 安排",
shelfCards: (n: number): string => `把 ${n} 句做成卡 →`,
shelfQueued: (total: number, after: string | null, end: string): string =>
  `共 ${total} 段 · ${after ? `${after} 读完后开始，` : ""}预计 ${end} 读完`,
shelfCardsPrompt: (short: string, slug: string, n: number): string =>
  `/skill:reading 书房做卡：把《${short}》（${slug}）里 ${n} 句待做卡的摘录做成卡。先在回复里列出草稿，我说可以再写进 Anki 牌组「书房::${short}」，写完用 bookshelf.mjs card 把这几句标成已做卡。`,
```

## 7. 皮肤

### Bear：`skins/bear/reading-panel.tsx` + `skin.css`
在 `<section className="bear-read">` 里、`scopeHint` 那行**之前**加书房三节，结构：
```
<h3 class="bear-section"><span>{shelfPlanned}</span></h3>
  planned 有 → <BookBlock book=… />；无 → 不出这一节（连标题）
<h3 class="bear-section"><span>{shelfQueue}</span><span class="bear-section-count">{n}</span></h3>   ← queue 为空不出
  每本：<div class="bear-shelf-q"><p class="bear-shelf-title">{title}</p><p class="bear-shelf-meta">{shelfQueued(...)}</p></div>
<h3 class="bear-section"><span>{shelfFree}</span></h3>
  free 有 → <BookBlock/>；无 → <p class="bear-shelf-meta">{shelfFreeEmpty}</p>
<h3 class="bear-section"><span>{shelfArticles}</span></h3>    ← 然后接原来的 scopeHint、加入框、队列，原样不动
```
`shelf` 为 loading 时只出一行 `strings.today.loading`；error 时一行 `role="alert"`；ready 但 planned、free、queue 都空时**整个书房三节都不出**（只留「文章与摘录」以下）。

`BookBlock`（同文件私有组件）：
```
<div class="bear-shelf-book">
  <p class="bear-shelf-title">{title}</p>
  <div class="bear-shelf-bar" role="progressbar" aria-valuenow={position} aria-valuemax={total}><i style={{ width: `${progress*100}%` }} /></div>
  <p class="bear-shelf-meta">{shelfMeta(position,total,end)}</p>
  {next && <p class="bear-shelf-today">{next}</p>}
  {later.length>0 && <details class="bear-shelf-more"><summary>{shelfLater}</summary>{later.map → <p class="bear-shelf-meta">}</details>}
  {coreRead.length>0 && <details class="bear-shelf-more"><summary>{shelfCore}</summary>{coreRead.map → <p class="bear-shelf-meta">{shelfCoreLine}</p>}<p class="bear-shelf-meta">{shelfCoreNote}</p></details>}
  {extracts.length>0 && <>
     <details class="bear-shelf-more" open><summary>{shelfExtracts(extracts.length, pending)}</summary>
       {extracts.map → <p class="bear-shelf-ex"><b>p.{page}</b> {text}<span class={carded? "": "bear-shelf-pend"}> · {carded ? shelfCarded(carded) : shelfPending}</span></p>}
     </details>
     <div class="bear-shelf-row"><span class="bear-shelf-meta">{pending>0 ? shelfCardsHint : shelfCardsDone}</span>
       {pending>0 && <button type="button" class="bear-link bear-link-accent bear-shelf-cards" onClick={() => onShelfCards(slug)}>{shelfCards(pending)}</button>}</div>
  </>}
</div>
```
CSS（加在 `.bear-read` 相关规则之后）：
```css
[data-skin="bear"] .bear-shelf-book, [data-skin="bear"] .bear-shelf-q { margin-bottom: var(--sp-2); }
[data-skin="bear"] .bear-shelf-title { margin: 0; color: var(--gray-12); font-weight: 500; }
[data-skin="bear"] .bear-shelf-bar { height: 3px; margin: var(--sp-2) 0 var(--sp-1); background: var(--gray-4); border-radius: var(--r-1); overflow: hidden; }
[data-skin="bear"] .bear-shelf-bar i { display: block; height: 100%; background: var(--accent-9); border-radius: var(--r-1); }
[data-skin="bear"] .bear-shelf-meta { margin: 0; font-size: var(--fs-1); line-height: var(--lh-1); color: var(--gray-11); }
[data-skin="bear"] .bear-shelf-today { margin: var(--sp-2) 0 0; color: var(--gray-12); }
[data-skin="bear"] .bear-shelf-more { margin-top: var(--sp-2); }
[data-skin="bear"] .bear-shelf-more summary { cursor: pointer; font-size: var(--fs-1); line-height: var(--lh-1); color: var(--gray-11); }
[data-skin="bear"] .bear-shelf-more summary:hover { color: var(--gray-12); }
[data-skin="bear"] .bear-shelf-ex { margin: var(--sp-1) 0 0; font-size: var(--fs-1); line-height: var(--lh-1); color: var(--gray-11); }
[data-skin="bear"] .bear-shelf-ex b { color: var(--gray-12); font-weight: 500; }
[data-skin="bear"] .bear-shelf-pend { color: var(--warn-11); }
[data-skin="bear"] .bear-shelf-row { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-2); margin-top: var(--sp-2); }
[data-skin="bear"] .bear-shelf-cards { white-space: nowrap; flex: none; }
```
（进度条高 `3px`，与 Bear 现有进度条一致。）

### bare 与 chicago
`ReadingPanel` 顶部加最简书房列表：每本书一行 `title · shelfMeta(...)`，`next` 一行，摘录列表，`pending > 0` 时一个按钮调 `onShelfCards`；无样式。

## 8. 画廊

`gallery/panel-samples.ts` 加 `SAMPLE_SHELF_LIST: ShelfListItem[]`：Epp（planned reading，`position 1`、`total 81`、`end "2027-01-28"`、`upcoming` 5 条从 `2026-11-11` 起、`coreRead` 2 条、`extracts` 3 条其中第 1 条 `carded "2026-11-09"`）、CTM（planned queued、`order 2`、`total 79`）。画廊的阅读面板样例传 `shelf={{ status: "ready", value: shelfPanel(SAMPLE_SHELF_LIST, "2026-11-11") }}`、`onShelfCards={noop}`；再加一张「书房全空」（`shelfPanel([], …)`）。其它用到 `ReadingPanel` 的地方补这两个 props。

## 9. 文档

`core/board/README.md` 加 `shelf-view.ts` 一行；`shell-panels.ts` 那行补「阅读面板的书房一节」。

## 完成标准（可观察）

- typecheck / lint / vitest / build 全过；`App.tsx` 仍 448 行。
- 画廊 Bear 阅读面板：书房 · 计划内（Epp、进度条、「已读 1 / 81 段…」、「今天：…」、接下来几天、核心页已读、摘录 3 句 · 2 句待做卡、「把 2 句做成卡 →」）→ 排队（CTM，「Epp 读完后开始，预计 … 读完」）→ 书房 · 计划外（空提示）→ 文章与摘录（原队列）。全空样例只剩「文章与摘录」以下。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && wc -l apps/desktop/src/renderer/App.tsx && git status --short
```

## 结束报告（中文）

改了哪些文件、每节是否照做、偏离之处及原因、未完成项，附验收输出。
