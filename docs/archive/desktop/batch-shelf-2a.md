# batch-shelf-2a（Devin 写基础代码）：书房脚本第二批 + 主进程接口

设计稿：`design/animate/?d=shelf2`（用户 2026-11-09 批准）。本批只做脚本与主进程，**不做界面**（2b）、**不写测试**（DeepSeek 补）、**不改日期公式**（DeepSeek 修）、**不改任何 SKILL.md**（Claude 改）、**不改库**。

## 硬约束（压缩后也要记得）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/skills/AUTHORING.md`、`docs/desktop/batch-shelf-1.md`（书页格式），再读 `skills/reading/bookshelf.mjs` 全文。
- 脚本零依赖（只用 `node:` 内置）；照 `bookshelf.mjs` 现有写法（`fail`、`parseArgs`、`loadBook`、`setField`、`renderPage`、`writeAtomic`、`output`、`--today`、`--json`）。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`/`@ts-ignore`。
- 只改这些文件：`skills/reading/bookshelf.mjs`、`skills/course/course-state.mjs`、`apps/desktop/src/shared/data-protocol.ts`、`apps/desktop/src/main/data/handler.ts`、`apps/desktop/src/main/data/README.md`。

## 书页新增的两节（脚本读写的约定）

都插在 `## 读书记录` 之前（没有 `## 读书记录` 就加在文末），顺序：`## 核心页已读`、`## 摘录`、`## 读书记录`。

```markdown
## 核心页已读
- pp.1–5、7–12、17–21 · discrete-math-epp · §1.1–1.4 核心页 · 2026-11-10

## 摘录
- p.5: 逆否命题与原命题逻辑等价：两者的真值表完全相同。 #卡/2026-11-09
- p.11: 条件命题 p → q 只在 p 真而 q 假时为假。 #待做卡
```

- 核心页行：`- pp.<页码列表> · <课程 slug> · <标签> · <YYYY-MM-DD>`。页码列表用 `、` 分隔，每项是 `a` 或 `a–b`（读时也接受 `-` 与 `,`）。
- 摘录行：`- p.<页码>: <原句> <标记>`，标记是 `#待做卡` 或 `#卡/<YYYY-MM-DD>`，永远在行尾。

## 1. `skills/reading/bookshelf.mjs`

### 1.1 通用插入
1. 新增 `function appendToSection(body, heading, line)`：照现有 `appendRecord` 的逻辑，但节名用参数；节不存在时，**在 `## 读书记录` 那一行之前**插入 `heading`、空行、`line`、空行（没有 `## 读书记录` 时加在文末，前面补空行）。
2. 把 `appendRecord(body, date, message)` 改成 `return appendToSection(body, "## 读书记录", \`- ${date}: ${message}\`)`。`## 读书记录` 不存在时仍按原来的行为（加在文末）——在 `appendToSection` 里对 `heading === "## 读书记录"` 特判即可。

### 1.2 纯函数（都 `export`，供测试）
1. `export function parsePageList(text)`：`"1–5、7–12、31"` → `[1,2,3,4,5,7,8,9,10,11,12,31]`。按 `/[、,，]/` 切，每项去空格，匹配 `/^(\d+)(?:\s*[–-]\s*(\d+))?$/`，`a > b` 或不匹配的项忽略；结果去重、升序。
2. `export function formatPageList(pages)`：升序数组 → 连续段合并，`[12,13,14,15,17]` → `"12–15、17"`；空数组 → `""`。
3. `export function parseCoreRead(body)`：读 `## 核心页已读` 节，每行匹配 `/^-\s+pp\.(.+?)\s+·\s+([a-z0-9-]+)\s+·\s+(.+?)\s+·\s+(\d{4}-\d{2}-\d{2})\s*$/` → `{ pages: <第1组原文>, course, label, date }`；不匹配的行忽略；没有该节返回 `[]`。
4. `export function parseExtracts(body)`：读 `## 摘录` 节，每行匹配 `/^-\s+p\.(\d+):\s+(.*?)\s+(#待做卡|#卡\/(\d{4}-\d{2}-\d{2}))\s*$/` → `{ index, page: Number, text, carded: <日期或 null> }`；`index` 是**匹配成功的行**从 1 起的序号；没有该节返回 `[]`。
5. `bookView(page, today)` 的返回值加一个字段 `coreOverlap`：`chunk` 为 null 时 `null`；否则取 `parseCoreRead(page.body)` 里所有 `pages` 经 `parsePageList` 合并去重，与 `[chunk.from … chunk.to]` 求交集，交集非空时为 `"pp." + formatPageList(交集)`，否则 `null`。**其它字段和日期公式一字不改。**

### 1.3 新命令
在 `main()` 的分发里加三支（写法同 `done`），`usage()` 补三行。

**`lecture <vault> <slug> --label <标签> --course <课程slug> [--pages <页码列表>] [--today D] [--json]`**——讲后读读完，记进书页：
1. `loadBook`（任何 `status` 都可以）。
2. 校验：`label` 非空、不含换行、≤ 200 字；`course` 匹配 `/^[a-z0-9-]+$/`；`--pages` 若给了，必须 `parsePageList` 后非空，否则 `fail("页码列表非法：…")`。
3. `page.body = appendRecord(page.body, today, \`讲后读 ${label} 已读（${course}，用户自报）\`)`。
4. 给了 `--pages`：`page.body = appendToSection(page.body, "## 核心页已读", \`- pp.${formatPageList(parsePageList(pages))} · ${course} · ${label} · ${today}\`)`。
5. **不改 `position`、`status`**。写回（`writeAtomic`）。
6. 输出 `{ slug, label, course, pages: <格式化后的页码列表或 null> }`。

**`extract <vault> <slug> --page <n> --text <原句> [--today D] [--json]`**——存一句摘录：
1. `loadBook`（任何 `status`）。
2. `page` 必须是 1–99999 的整数；`text` 先 `.replace(/\s*\r?\n\s*/g, " ").trim()`，非空、≤ 500 字，否则 `fail`。
3. `page.body = appendToSection(page.body, "## 摘录", \`- p.${n}: ${text} #待做卡\`)`；写回。
4. 输出 `{ slug, index: <新行在 parseExtracts 里的 index>, page: n, text }`。

**`card <vault> <slug> --index <逗号分隔的序号> [--today D] [--json]`**——把摘录标成已做卡：
1. `loadBook`；`--index` 按 `,` 切，每项必须是正整数且 ≤ 摘录条数，否则 `fail`。
2. 对每个序号对应的行（用 `parseExtracts` 同样的匹配找到它在 `body` 里的行号）：标记是 `#待做卡` 时换成 `#卡/<today>`；已经是 `#卡/…` 的跳过。
3. 写回；输出 `{ slug, marked: [<这次真正改了的序号>], skipped: [<已做过的序号>] }`。

### 1.4 `list` 输出
`commandList` 每本书的对象加两个字段：`extracts: parseExtracts(page.body)`、`coreRead: parseCoreRead(page.body)`。

## 2. `skills/course/course-state.mjs`（`afterRead`）

在最后输出 JSON 之前加三项，输出改为 `{ file, label, reading, book, course, pages }`：
1. `book`：`/\[\[书房\/([^\]|]+)/.exec(text)?.[1] ?? null`。
2. `course`：`basename(target, ".md")`（顶部 `import { basename } from "node:path"`，若已有就复用）。
3. `pages`：在**打勾前**的那一行 `lines[hit]` 里匹配 `/核心页已定：\s*pp\.\s*([0-9–\-、,，\s]+)/`，取第 1 组 `.trim()` 并去掉末尾的 `、`/`,`；匹配不到为 `null`。
   例：`- [ ] 讲后读 §1.1–1.4 核心页 · 2026-11-10 读（核心页已定：pp.1–5、7–12、17–21、24–27、31，跳过…）` → `"1–5、7–12、17–21、24–27、31"`。
4. 文件头注释与 JSDoc 里描述输出的那行同步改。

## 3. `apps/desktop/src/shared/data-protocol.ts`

1. 新类型（放在 `ShelfListItem` 前）：
   ```ts
   /** One `## 摘录` line of a book page; `carded` is the date it became a card, or null. */
   export interface ShelfExtract { index: number; page: number; text: string; carded: string | null }
   /** One `## 核心页已读` line: core pages read after a lesson. */
   export interface ShelfCoreRead { pages: string; course: string; label: string; date: string }
   ```
2. `ShelfBook` 加 `coreOverlap: string | null;`（JSDoc 补一句：今天这段里讲后读读过的页，如 `"pp.12–15"`）。
3. `ShelfListItem` 加 `extracts: ShelfExtract[]; coreRead: ShelfCoreRead[];`。
4. `DataRequest` 加：
   `| { kind: "shelf.extract"; slug: string; page: number; text: string; today: string }`
   `| { kind: "shelf.card"; slug: string; indexes: number[]; today: string }`
5. `DataResponseMap`：`"course.afterRead"` 改为 `{ label: string; reading: string | null; book: string | null }`；加
   `"shelf.extract": { slug: string; index: number; page: number; text: string };`
   `"shelf.card": { slug: string; marked: number[]; skipped: number[] };`
6. `isDataRequest`：
   - `shelf.extract`：`slug` 匹配 `/^[a-z0-9-]+$/`；`page` 是整数且 1–99999；`text` 是字符串、`trim()` 后非空、长度 ≤ 500；`today` 过 `isIsoDate`。
   - `shelf.card`：`slug` 同上；`indexes` 是非空数组、≤ 200 项、每项是正整数；`today` 过 `isIsoDate`。

## 4. `apps/desktop/src/main/data/handler.ts`

1. `course.afterRead`：`marked.data` 里再取 `book`、`course`、`pages`（都按 `typeof === "string"` 收窄，否则 null）。
   - `book !== null`：跑 `reading/bookshelf.mjs lecture <vault> <book> --label <request.label> --course <course ?? request.slug> [--pages <pages>] --today <request.date> --json`（`pages` 为 null 时不传 `--pages`）；失败直接返回它的失败响应。**这时不再跑 `reading-queue.mjs note`。**
   - `book === null && reading !== null`：保持原来的 `reading-queue.mjs note`（迁库前的课程页还链着 `reading/`）。
   - 之后两步重建看板不变；返回 `{ ok: true, data: { label: request.label, reading, book } }`。
   - 更新这一支上面的注释。
2. `shelf.extract`：`runScript("reading/bookshelf.mjs", ["extract", vault.vault, request.slug, "--page", String(request.page), "--text", request.text, "--today", request.today, "--json"])`。
3. `shelf.card`：`runScript("reading/bookshelf.mjs", ["card", vault.vault, request.slug, "--index", request.indexes.join(","), "--today", request.today, "--json"])`。

## 5. `apps/desktop/src/main/data/README.md`

数据请求表补 `shelf.extract`、`shelf.card` 两行；`course.afterRead` 那行改成「有 `[[书房/<书>]]` 链接时记进书房书页（`bookshelf.mjs lecture`），否则照旧记阅读页」。

## 完成标准（可观察）

在临时库里按下面的「手动试」跑，必须看到：
- `lecture` 后书页出现 `## 核心页已读` 一行和 `## 读书记录` 一行，`position` 不变；
- `today` 的 `planned.coreOverlap` 为 `"pp.1–5、7–9"`；
- `extract` 两次后 `## 摘录` 有两行 `#待做卡`；`card --index 1` 后第 1 行变 `#卡/2026-11-10`，再跑一次进 `skipped`；
- `list` 输出里有 `extracts`（2 条）与 `coreRead`（1 条）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
# 手动试（临时库，不碰真实库）
rm -rf /tmp/shelf2-try && mkdir -p /tmp/shelf2-try/wiki/书房 && printf -- '---\nkind: book\nslot: planned\norder: 1\nstatus: reading\ntitle: "T"\nshort: "T"\nstarted: 2026-11-09\nposition: 0\n---\n\n# T\n\n## 分段\n1. Ch1 pp.1–36\n\n## 读书记录\n' > /tmp/shelf2-try/wiki/书房/t.md
S=skills/reading/bookshelf.mjs; V=/tmp/shelf2-try
node $S lecture $V t --label "§1.1 核心页" --course discrete-math-epp --pages "1–5、7-12" --today 2026-11-10 --json
node $S today $V --today 2026-11-10 --json
node $S extract $V t --page 5 --text "逆否命题与原命题等价。" --today 2026-11-10 --json
node $S extract $V t --page 11 --text "条件命题
只在 p 真 q 假时为假。" --today 2026-11-10 --json
node $S card $V t --index 1 --today 2026-11-10 --json && node $S card $V t --index 1 --today 2026-11-10 --json
node $S list $V --json && cat $V/wiki/书房/t.md
cd /Users/gjy/pi-learning/xuegen && git status --short
```

现有测试若因 `ShelfBook` / `ShelfListItem` / `course.afterRead` 新字段而类型报错或断言失败，只做**最小**修正（补字段），并在报告里列出；不要新写测试。

## 结束报告（中文）

改了哪些文件、每节是否照做、偏离之处及原因、未完成项，附验收输出（含手动试的输出和最后的书页全文）。
