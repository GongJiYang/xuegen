# batch-shelf-1（Devin 写基础代码）：书房脚本 + 主进程数据接口

设计稿：`design/animate/?d=shelf`（用户 2026-11-08 批准）。规则（用户定）：
- 书房 = 自己读的整本书，放在库的 `wiki/书房/`，一本一页，另有 `wiki/书房/index.md`。
- **每天都读**；每天一段：把书页里 `## 分段` 的每一项按页数平均切成若干块，每块 ≤ 10 页。
- 计划内（`slot: planned`）一次只读一本（`status: reading`），读完自动开下一本（`order` 最小的 `queued`）；计划外（`slot: free`）同时最多一本在读。
- 只排每天读哪几页、算预计读完日期，**不估时长**。没读不跳段：第二天还是同一段，读完日期整体顺延。

本批只做：零依赖脚本 `skills/reading/bookshelf.mjs` 与主进程数据接口。**不做界面**（下一批），**不写测试**（审核方 DeepSeek 会补），**不改库**（迁移由 Claude 征得用户同意后做）。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`、`skills/reading/reading-queue.mjs`（照它的写法：`fail`、`localDate`、`isDate`、`addDays`、`parseArgs`、`parsePage`、`renderPage`、`setField`、`writeAtomic`、`wikiDir`，`--json` 输出，`--today` 注入日期）。可以把需要的小函数复制进新脚本，不改 `reading-queue.mjs`。
- 脚本零依赖（只用 `node:` 内置模块）。
- 主进程请求有运行时校验；不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint。

## 1. 书页格式（脚本读写的约定）

`wiki/书房/<slug>.md`：
```markdown
---
kind: book
slot: planned
order: 1
status: reading
title: "Discrete Mathematics with Applications（Epp, 5th ed）"
short: "Epp"
source: "[[sources/2026-11-05-epp-discrete-mathematics]]"
file: "raw/books/epp-discrete-mathematics-5e.pdf"
page_offset: 23
started: 2026-11-09
position: 0
---

# Discrete Mathematics with Applications（Epp, 5th ed）

## 分段
1. Ch1 §1.1–1.4 pp.1–36
2. Ch2 §2.1–2.2 pp.37–65

## 不读
（自由文字）

## 排期
<!-- xuegen:shelf:start -->
（脚本生成，不手改）
<!-- xuegen:shelf:end -->

## 读书记录
- 2026-11-09: 第 1 段 pp.1–9 读完（用户自报）
```
字段：`slot` ∈ planned/free；`status` ∈ queued/reading/done；`order` 整数（free 可省）；`started` 为 YYYY-MM-DD 或空；`position` = 已读完的块数。`## 分段` 每行形如 `N. <标题> pp.<起>–<止>`（连接号可能是 `–` 或 `-`）。

## 2. 切块（纯函数，导出供测试）

```js
export function chunksOf(segments)  // segments: [{title, from, to}] → [{index, title, from, to}]
```
每个分段：`n = to - from + 1`，`k = ceil(n / 10)`，`size = ceil(n / k)`；从 `from` 起每块 `size` 页，最后一块到 `to` 为止。`index` 从 1 连续编号。

```js
export function parseSegments(body) // 解析 `## 分段` 一节 → [{title, from, to}]；格式不对的行忽略
export function bookView(page, today) // → 见第 4 节 today 的单本对象
```

## 3. 命令

```
node bookshelf.mjs list <vault> [--json]
node bookshelf.mjs today <vault> [--today YYYY-MM-DD] [--json]
node bookshelf.mjs done <vault> <slug> [--today YYYY-MM-DD] [--json]
node bookshelf.mjs plan <vault> <slug> [--write] [--json]
node bookshelf.mjs index <vault> [--write]
```
- 书房目录 = `<vault>/wiki/书房`；不存在时 `list`/`today` 返回空结果，不报错。
- `list`：所有书 → `[{slug, title, short, slot, order, status, total, position, started, end}]`。`end` 见第 4 节。
- `today`：`{ planned: <单本或 null>, free: <单本或 null> }`，取 `status: reading` 的 planned 与 free 各一本。
- `done <slug>`：该书 `position + 1`；在 `## 读书记录` 末尾追加 `- <today>: 第 <position> 段 pp.<from>–<to> 读完（用户自报）`（`<position>` 是加 1 后的值，页码取这一块）；若加 1 后 `position === total`：`status: done`，并且（仅 planned）把 `order` 最小的 `queued` 改成 `reading`、`started` 设为 `today` 的下一天、`position: 0`、对它执行 `plan --write`。最后执行 `index --write`。输出 `{ slug, position, total, finished: boolean, next: <slug|null> }`。`status` 不是 reading 时 `fail`。
- `plan <slug>`：按块生成排期表（`| 块 | 日期 | 读什么 |`，日期 = `started + (index - 1)` 天；`started` 为空时用 `today`），`--write` 时替换两个标记之间的内容（没有标记就在 `## 读书记录` 前插入 `## 排期` 与标记）。
- `index`：生成 `wiki/书房/index.md`：标题 `# 书房`，然后「在读」「排队」「读完」三组，每行 `- [[书房/<slug>|<short>]] · <title> · <position>/<total> 段 · 预计 <end> 读完`（读完的写「<最后一条记录日期> 读完」）；`--write` 才写文件，否则打印。

## 4. 单本对象与日期

```js
{ slug, title, short, slot, total, position,
  chunk: { index, title, from, to } | null,   // 下一块（position+1），读完了为 null
  plannedEnd: "YYYY-MM-DD",                    // started + total - 1
  end: "YYYY-MM-DD",                           // 预计读完：today + (total - position) - 1；读完了 = 最后记录日期
  late: number }                               // end 比 plannedEnd 晚几天（不晚为 0）
```

## 5. 主进程接口

1. `src/shared/data-protocol.ts`：
   - 类型 `ShelfChunk { index: number; title: string; from: number; to: number }`，`ShelfBook { slug: string; title: string; short: string; slot: "planned" | "free"; total: number; position: number; chunk: ShelfChunk | null; plannedEnd: string; end: string; late: number }`，`ShelfToday { planned: ShelfBook | null; free: ShelfBook | null }`，`ShelfListItem { slug; title; short; slot; order: number | null; status: "queued" | "reading" | "done"; total; position; started: string; end: string }`。
   - `DataRequest` 加 `| { kind: "shelf.today"; today: string } | { kind: "shelf.list" } | { kind: "shelf.done"; slug: string; today: string }`；`DataResponseMap` 对应加 `ShelfToday`、`ShelfListItem[]`、`{ slug: string; position: number; total: number; finished: boolean; next: string | null }`。
   - `isDataRequest` 校验：`today` 用 `isIsoDate`；`slug` 匹配 `/^[a-z0-9-]+$/`。
2. `src/main/data/handler.ts`：照 `reading.queue` 一类分支的写法，三个请求分别跑 `reading/bookshelf.mjs today|list|done`（带 `--json`，`today`/`done` 带 `--today`）。

## 6. 文档

- `skills/reading/SKILL.md` 不改（文字由 Claude 改）。
- `core/board/README.md` 或主进程数据 README 若列了数据请求，补这三条。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
# 手动试一下（临时库，不碰真实库）：
mkdir -p /tmp/shelf-try/wiki/书房 && printf -- '---\nkind: book\nslot: planned\norder: 1\nstatus: reading\ntitle: "T"\nshort: "T"\nstarted: 2026-11-09\nposition: 0\n---\n\n# T\n\n## 分段\n1. Ch1 pp.1–36\n2. Ch2 pp.37–65\n\n## 读书记录\n' > /tmp/shelf-try/wiki/书房/t.md
node skills/reading/bookshelf.mjs plan /tmp/shelf-try t --write --json && node skills/reading/bookshelf.mjs today /tmp/shelf-try --today 2026-11-10 --json && node skills/reading/bookshelf.mjs done /tmp/shelf-try t --today 2026-11-10 --json
cd /Users/gjy/pi-learning/xuegen && git status --short
```

`lint:skills` 若因新脚本缺同名测试报**警告**可以接受（测试由审核方补），报**错误**要修。

## 结束报告（中文）

改了哪些文件、每节是否照做、偏离之处及原因、未完成项，附验收输出（含手动试的三段 JSON）。
