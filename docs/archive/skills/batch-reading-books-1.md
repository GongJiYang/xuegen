# batch-reading-books-1：阅读队列支持教材通读 + 知识目录 `wiki/知识/`

## 硬约束（先读，压缩后也照做）

- 只改这 4 个文件：`skills/reading/reading-queue.mjs`、`skills/reading/reading-queue.test.mjs`、`skills/wiki-save/flashcards.mjs`、`skills/wiki-save/flashcards.test.mjs`。其他文件一律不动（SKILL.md 已由 Claude 改好，不要碰）。
- 脚本保持零依赖（只用 `node:` 内置模块），保持现有代码风格（中文注释、`fail()` 报错、`output()` 输出）。
- 所有已有测试必须继续通过；旧阅读页（没有 `every` 字段）的行为完全不变。
- 不读写 `~/.xuegen/`、不碰 Obsidian 库（`/Users/gjy/Documents/Obsdian-gjy`）、不启动 Electron、不 commit/push、不加依赖。
- 先读：`AGENTS.md`、`docs/platform/PRINCIPLES.md`（第 7 条「读原书」、第 1 条四类划分）、`docs/skills/AUTHORING.md`、`skills/reading/SKILL.md`（「教材通读」一节就是本批要支持的用法）。

## 背景（一句话）

主项课的教材通读改走阅读队列：一本书一个阅读页，原文用这本书在 `wiki/知识/sources/` 的登记页，固定每 14 天读一次。另外库里的知识目录（sources、concepts、entities、synthesis、extracts、flashcards）将从 `wiki/` 移到 `wiki/知识/`，两个脚本要两种布局都能用：**`wiki/知识/` 目录存在就用它，否则用 `wiki/`**。

## 第 1 步：`reading-queue.mjs` 加知识目录函数

在 `function readingDir(vault)` 前面加：

```js
// 知识目录：迁移后为 <vault>/wiki/知识，迁移前为 <vault>/wiki（两种布局都支持）。
function knowledgeDir(vault) {
  const migrated = join(wikiDir(vault), "知识");
  return existsSync(migrated) ? migrated : wikiDir(vault);
}
```

然后把下面两处 `join(wikiDir(vault), "extracts")` / `wikiDir(vault)` 换成 `knowledgeDir(vault)`：

- `commandStats` 里 `const extractFiles = await walk(join(wikiDir(vault), "extracts"));` → `join(knowledgeDir(vault), "extracts")`。
- `commandVerify` 里 `const extractBase = wikiDir(vault);` → `const extractBase = knowledgeDir(vault);`，并把上一行注释改成「Extracts 链接相对知识目录解析（如 [[extracts/a/x]] → <知识目录>/extracts/a/x.md）。」

`readingDir` 不变（阅读页仍在 `wiki/reading/`，它属于「进度」，不迁移）。

## 第 2 步：原文可以是 sources 登记页

1. 把 `validateSourceReachability` 改成：

```js
// 原文位置：raw/、Clippings/，或知识目录下 sources/ 的登记页（教材通读用，脚本不读 PDF）。
function validateSourceReachability(relPath) {
  const normalized = relPath.split(sep).join("/");
  const first = normalized.split("/")[0];
  if (first === "raw" || first === "Clippings") return;
  if (/^wiki\/(知识\/)?sources\/[^/]+\.md$/.test(normalized)) return;
  fail(`原文必须位于 raw/、Clippings/ 或 wiki/知识/sources/ 下：${relPath}`);
}
```

2. 把 `normalizeSourceLink` 改成：sources 登记页的链接去掉 `wiki/` 和 `知识/` 前缀（库规则：链接不带这两个前缀，迁移后仍有效）：

```js
function normalizeSourceLink(relPath) {
  let p = relPath.split(sep).join("/");
  p = p.replace(/\.[^./]+$/, "");
  p = p.replace(/^wiki\/(知识\/)?(?=sources\/)/, "");
  return p;
}
```

结果：`wiki/知识/sources/2026-11-05-epp.md` → `[[sources/2026-11-05-epp]]`；`raw/articles/a.md` 仍是 `[[raw/articles/a]]`。

3. `commandVerify` 里 source 的存在性检查改成依次找三处，任一存在即通过：

```js
      const srcRel = `${srcMatch[1]}.md`;
      const candidates = [join(vault, srcRel), join(knowledgeDir(vault), srcRel), join(wikiDir(vault), srcRel)];
      if (!candidates.some((file) => existsSync(file))) problems.push(`${slug}: source 指向的文件不存在 ${srcRel}`);
```

并把上面的注释改成「source 链接依次相对 <vault>、知识目录、wiki/ 解析（如 [[raw/articles/x]]、[[sources/x]]）。」

## 第 3 步：`add` 支持 `--due YYYY-MM-DD` 与 `--every N`

在 `commandAdd` 里：

1. 把 `--due` 的校验与计算改成：

```js
  const dueOption = options.due ?? "scheduled";
  let due;
  if (dueOption === "today") due = today;
  else if (dueOption === "scheduled") due = priority === "high" ? today : addDays(today, 1);
  else if (isDate(String(dueOption))) due = String(dueOption);
  else fail(`--due 非法：${dueOption}（应为 today、scheduled 或 YYYY-MM-DD）`);
```

（删掉原来的 `if (dueOption !== "today" && dueOption !== "scheduled") fail(...)` 和原来那行 `const due = ...`。）

2. 在 `fields` 定义之前加：

```js
  let every = null;
  if (options.every !== undefined) {
    const n = Number(options.every);
    if (!Number.isInteger(n) || n < 1 || n > 365) fail(`--every 非法：${options.every}（应为 1–365 的整数）`);
    every = n;
  }
```

3. `fields` 里 `interval_days` 的值改为 `every === null ? "1" : String(every)`；并在 `fields` 数组定义之后加：

```js
  if (every !== null) fields.splice(fields.findIndex((entry) => entry.key === "interval_days") + 1, 0, { key: "every", value: String(every) });
```

（`every` 不加进 `FIELD_ORDER`：它是可选字段，旧页面没有它也要能通过 verify；`renderPage` 会把它放在固定字段之后，这没关系。）

4. `appendLog` 的消息在有 every 时写 `Added to queue (priority: high, every 14 days).`，没有时保持原样。
5. `result` 里加 `every`（没有时为 `null`）。

## 第 4 步：`review` 对固定间隔的书保持节奏

在文件里（`commandReview` 之前）加纯函数：

```js
// 固定间隔：从原到期日起每 every 天一次，取今天之后的第一个；原到期日无效时从今天算。
function nextFixedDue(due, every, today) {
  if (!isDate(due)) return addDays(today, every);
  let next = addDays(due, every);
  while (next <= today) next = addDays(next, every);
  return next;
}
```

在 `commandReview` 里读出 `const every = Number(field(page, "every")) || 0;`，然后：

- `outcome === "next"` 分支：`every > 0` 时 `interval_days` 保持 `String(every)`，`nextDue = nextFixedDue(field(page, "due"), every, today)`；其余（status、last_read、position）照原样写。`every === 0` 时完全保持原逻辑。
- `outcome === "postpone"` 分支：`every > 0` 时 `nextDue = nextFixedDue(field(page, "due"), every, today)`；否则原逻辑。
- `done` 分支不变。

注意：`nextFixedDue` 要在 `setField(page, "due", …)` 之前用原来的 `due` 值算。

## 第 5 步：新命令 `note`

```js
// 只追加一行 Reading Log，不改任何排程字段（讲后读等课内阅读用）。
async function commandNote(vault, positional, options, today) {
  const slug = positional[0];
  if (!slug) fail("note 需要 slug");
  const text = options.text;
  if (typeof text !== "string" || text.trim() === "") fail("note 需要 --text");
  const { page, file } = await loadPage(vault, slug);
  page.body = appendReadingLog(page.body, today, text.trim());
  await writeAtomic(file, renderPage(page.fields, page.body));
  output(options, { slug, date: today, text: text.trim() }, `note: ${slug} ${today}`);
}
```

在 `main()` 里 `review` 分支之后加：

```js
  } else if (command === "note") {
    const vault = resolve(positional[0] ?? fail("note 需要 vault 路径"));
    requireVault(vault);
    await commandNote(vault, positional.slice(1), options, todayFrom(options));
```

## 第 6 步：文档注释与 usage

- 文件头注释：`add` 那行改为 `[--due today|scheduled|YYYY-MM-DD] [--every N]`（顺便去掉重复的 `[--due today|scheduled]`），加一行 `//   node reading-queue.mjs note <vault> <slug> --text ...`；「路径」那行改为「阅读页 = <vault>/wiki/reading/；摘录 = <知识目录>/extracts/（知识目录 = wiki/知识，不存在时为 wiki）；日志 = <vault>/wiki/log.md」。
- `usage()`：`add` 行加 `[--due today|scheduled|YYYY-MM-DD] [--every N]`，加 `note` 行；「原文位于其 raw/ 或 Clippings/ 下」改为「原文位于 raw/、Clippings/，或 wiki/知识/sources/ 的登记页」。

## 第 7 步：`reading-queue.test.mjs` 新增测试（沿用文件里的 `makeWiki`、`q`、`jsonQ` 写法）

逐个加，测试名照写：

1. `add：sources 登记页可作原文，链接去掉 wiki/ 前缀` —— 在 `wiki/sources/2026-11-05-epp.md` 写 `# Epp 离散数学\n`，`add <vault> wiki/sources/2026-11-05-epp.md --slug epp --today 2026-11-08 --json`：阅读页 `source: "[[sources/2026-11-05-epp]]"`，标题行 `# Epp 离散数学`；随后 `verify` 退出码 0。
2. `add：wiki/知识/sources/ 登记页可作原文` —— 同上，但文件在 `wiki/知识/sources/`，链接同样是 `[[sources/2026-11-05-epp]]`，`verify` 通过。
3. `add：wiki/ 下其他目录拒绝` —— `wiki/courses/x.md` 存在，`add … wiki/courses/x.md` 失败，stderr 含「原文必须位于」。
4. `add：--every 14 --due 日期` —— `add … --priority high --every 14 --due 2026-11-14 --today 2026-11-08`：frontmatter 有 `interval_days: 14`、`every: 14`、`due: 2026-11-14`；JSON 结果 `every` 为 14。
5. `add：--every 与 --due 非法值拒绝` —— `--every 0`、`--every abc`、`--due 2026-13-40` 各自失败。
6. `review：固定间隔保持节奏` —— 用第 4 条的页面：`review epp --outcome next --today 2026-11-14` → `due: 2026-11-28`、`interval_days: 14`；再 `review epp --outcome next --today 2026-11-29`（晚了一天）→ `due: 2026-12-12`；再 `review epp --outcome postpone --today 2026-12-30`（隔了很久）→ `due: 2027-01-09`，`interval_days` 仍是 14。
7. `review：没有 every 的旧页面行为不变` —— 普通 `add`（无 `--every`）后 `review --outcome next`，结果与现有「三种优先级的间隔增长」一致（直接断言 medium：interval 1 → 2，due = today+2）。
8. `note：只追加 Reading Log，不改排程` —— `note epp --text "讲后读 D1 核心页 pp.1–5 已读（用户自报）" --today 2026-11-10`：Reading Log 多一行 `- 2026-11-10: 讲后读 D1 核心页 pp.1–5 已读（用户自报）`；frontmatter 前后逐字相同；不带 `--text` 时失败。
9. `知识目录：wiki/知识/ 存在时 stats 与 verify 用它` —— 建 `wiki/知识/extracts/a/x.md`（含 `cards: pending`），阅读页 Extracts 段链接 `[[extracts/a/x]]`：`verify` 通过，`stats --json` 的 `cardsPending` 为 1。

## 第 8 步：`flashcards.mjs` 用知识目录

1. 在 `function wikiDir(vault)` 后加与第 1 步相同的 `knowledgeDir(vault)` 函数（同样的注释）。
2. 把 `commandStats` 里 `join(wikiDir(vault), "flashcards")`、`join(wikiDir(vault), "extracts")`，以及 `deckInboxPath` 里 `const base = join(wikiDir(vault), "flashcards");` 都改成 `join(knowledgeDir(vault), …)`。
3. 文件头注释与 `usage()` 里的 `wiki/flashcards/` 改写为 `<知识目录>/flashcards/（知识目录 = wiki/知识，不存在时为 wiki）`。
4. `flashcards.test.mjs` 加测试 `知识目录：wiki/知识/ 存在时读写其中的 flashcards`：建 `wiki/知识/flashcards/math/a.md`（含一个已同步的 START…END 卡片块，格式照该测试文件里已有的样例），`stats --json` 计到这张卡；`add` 一张新卡写进 `wiki/知识/flashcards/<牌组>/inbox.md`，而 `wiki/flashcards/` 不被创建。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -8
cd /Users/gjy/pi-learning/xuegen && npm run lint:skills 2>&1 | tail -3
cd /Users/gjy/pi-learning/xuegen && git status --short
```

完成标准：`npm test` 全部通过（数字比现在的 150 多出本批新增的测试数），`lint:skills` 0 错误，`git status` 只出现上面 4 个文件（外加 Claude 已改的 SKILL.md、文档，那些不是你改的，不要动）。

## 结束报告（中文）

改了哪些文件、每一步是否照做、偏离规格之处及原因、未完成项，并附验收命令的实际输出。
