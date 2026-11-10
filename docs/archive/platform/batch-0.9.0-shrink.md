# 任务单：0.9.0 收缩——删掉库旧名兼容代码（Devin，SWE-2）

## 硬约束（先看这里）
- 不读写 `~/.xuegen/`、`~/xuegen-data/`、`~/学根/`、任何 Obsidian 库；不启动 Electron；不 commit/push；不加依赖。
- 不放宽 eslint 规则，不加 `eslint-disable` / `@ts-ignore`。
- 只做下面列出的修改；没列的文件不动（特别是：`skills/**/SKILL.md`、`skills/**/references/*.md`、`skills/course/PLAN-STANDARD.md` 由 Claude 改，**不要动**；`skills/wiki-save/rename-vault.mjs` 及其测试、`bin/xuegen-data-root.mjs` 不动；`apps/desktop/src/agent/guard/session-role.ts` 的 `LEGACY_COURSE_FILE` 与改名无关，不动；`flashcards.mjs` 里的 `legacy` inbox 变量与改名无关，不动；Anki 牌组名 `书房::`、预设名 `书房`、页面标题 `# 书房` 等中文文案不是路径，不动）。

## 背景
2026-11-10 真实库已改成英文布局（`wiki/knowledge/`、`wiki/shelf/`、`clippings/`、`wiki/_generated/courses.{md,html}`），见 `docs/platform/TIDY-1110.md` §3「收缩」。现在删掉「旧库」那一套：代码只认新布局。旧名一律指：`wiki/知识`（及 `知识/` 子路径）、更早的「知识页直接在 `wiki/` 根」布局、`wiki/书房`、`Clippings`（大写）、`wiki/courses.md` / `wiki/courses.html`（看板在 wiki 根）。

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/platform/TIDY-1110.md` §3、`docs/platform/VAULT-NAMING.md`。

## 一、技能脚本（`skills/`，零依赖 Node）

1. `skills/wiki-save/anki-sync.mjs`、`skills/wiki-save/flashcards.mjs`、`skills/reading/reading-queue.mjs` 三个文件里各有同样一段：
   ```js
   // 知识目录候选：新布局 wiki/knowledge 优先，旧库 wiki/知识，再旧退到 wiki（三种布局都支持）。
   const KNOWLEDGE_DIRS = ["knowledge", "知识"];

   function knowledgeDir(vault) {
     for (const name of KNOWLEDGE_DIRS) { … }
     return wikiDir(vault);
   }
   ```
   整段换成：
   ```js
   // 知识目录：wiki/knowledge。
   function knowledgeDir(vault) {
     return join(wikiDir(vault), "knowledge");
   }
   ```
   同文件里注释和 `usage()` 文字中的「（旧库：wiki/知识，再旧：wiki）」「（旧库：Clippings/）」「（旧库：wiki/知识/sources/）」等括注全部删掉（只删括注，句子其余不变）。如果 `existsSync` 因此在某文件里不再使用，删掉它的 import。
2. `skills/reading/reading-queue.mjs` 另外：
   - 原文位置检查（约第 279–281 行）改为：`if (first === "raw" || first === "clippings") return;`；正则改为 `/^wiki\/knowledge\/sources\/[^/]+\.md$/`；`fail(...)` 文案改为 ``原文必须位于 raw/、clippings/ 或 wiki/knowledge/sources/ 下：${relPath}``。
   - 约第 351 行 `p.replace(/^wiki\/(?:(?:knowledge|知识)\/)?(?=sources\/)/, "")` 改为 `p.replace(/^wiki\/(?:knowledge\/)?(?=sources\/)/, "")`。
3. `skills/reading/bookshelf.mjs`：
   - 删 `const SHELF_DIRS = ["shelf", "书房"];` 及其上一行注释。
   - `shelfDir(vault)` 改为 `return join(wikiDir(vault), "shelf");`（删掉上方「有新的用新的…」注释，改成 `// 书房目录：wiki/shelf。`）。
   - `shelfName(vault)` 改为直接 `return "shelf";`，注释改为 `// index.md 里 [[…]] 链接的前缀。`
   - 第 3、957、961 行等注释与 usage 里的「（旧库：wiki/书房/）」「旧库：wiki/书房/index.md；」删掉。
4. `skills/course/render-board.mjs`：
   - `generatedDir(wikiDir)` 改为 `return join(wikiDir, "_generated");`，注释改为 `// 生成物放在 <wiki>/_generated。`
   - 约第 313 行注释改为 `// 生成物目录：wiki/_generated。`
   - 写 `outFile` 之前（`writeFileSync(outFile, html)` 那段 try 之前）加 `mkdirSync(dirname(outFile), { recursive: true });`（补 import `mkdirSync`、`dirname`，已有的不重复）。
5. `skills/course/course-state.mjs`：`dashboard` 分支里 `await writeFile(outFile, text, "utf8")` 之前加 `await mkdir(dirname(outFile), { recursive: true });`（补 import）。
6. `skills/course/close/board.mjs`：
   - `BOARD_RELS` 只留 `"wiki/_generated/courses.md"`、`"wiki/_generated/courses.html"` 两项；上方注释里「（新旧两种布局）」删掉。
   - `boardPaths(vault)` 改为直接 `return { md: "wiki/_generated/courses.md", html: "wiki/_generated/courses.html" };`，注释改为 `/** 看板的库内相对路径（wiki/_generated/）。 */`；参数不再使用就去掉参数并改调用处；`existsSync` 不再用就删 import。
   - 第 2 行注释「看板在新旧两种布局下的库内路径」改为「看板的库内路径」。
7. `skills/wiki-save/vault-lint.mjs`：
   - `VAULT_TOP_DIRS` 去掉 `"Clippings"`。
   - `checkEntryName` 里 `first !== "Clippings"` 那个条件删掉。
   - 第 4、64、315 行注释 / usage 的「（旧库：Clippings/）」「（旧库 Clippings/）」删掉。
   - 第 32 行注释里的示例 `` `[[知识/concepts/example]]` `` 改成 `` `[[concepts/example]]` ``。
   - **新行为**：`checkEmptyDirs` 跳过 raw/ 第二层以下的目录（与 `checkRawDir` 一致：`raw/<d>`、`raw/<d>/<d>` 照查，更深的不查——那是原料自带的结构，比如下载来的仓库里只有 `.gitkeep` 的目录）。具体：循环开头 `const parts = dir.split("/"); if (parts[0] === "raw" && parts.length > 3) continue;`（按文件里已有的 `segments()` 函数写也可以）。

## 二、桌面端（`apps/desktop/src/`）

8. `agent/guard/vault-paths.ts`：
   - 删 `const KNOWLEDGE = "wiki/知识";`、`const SHELF = "wiki/书房";`；把 `KNOWLEDGE_EN`、`SHELF_EN` 改名为 `KNOWLEDGE`、`SHELF`（值不变：`"wiki/knowledge"`、`"wiki/shelf"`）。
   - 删 `both` 辅助函数；用到它的 7 处改成 `all([...])` 单一路径，例如 `knowledge: all([KNOWLEDGE])`、`extracts: all([`${KNOWLEDGE}/extracts`])`、`shelf: all([SHELF])`。
   - `coursesBoard: all(["wiki/_generated/courses.md"])`，删掉上面两行「both spellings」注释。
   - `clippings: all(["clippings"])`。
   - 文件头注释第 4–8 行（「The vault is being renamed … both names are real directories …」）改为一句：`The vault uses the English layout (docs/platform/VAULT-NAMING.md); each rule has one canonical path.`
   - `RulePaths` 接口的 JSDoc：`wiki/知识` → `wiki/knowledge`，`wiki/书房` → `wiki/shelf`，`（\`Clippings\` / \`clippings\`）` → `` (`clippings`) ``，`课程看板：旧库 …、新库 …` → `` 课程看板 `wiki/_generated/courses.md`。 ``；「aliases included」之类说明改成不再提别名。字段类型保持 `string[]` 不改。
9. `agent/guard/roles.ts`：只改注释——第 15 行 `` (`Clippings`/`clippings`) `` → `` (`clippings`) ``；第 17 行 `` (`wiki/知识`) `` → `` (`wiki/knowledge`) ``；第 24 行 `` `书房` `` → `` `shelf/` ``；第 286 行 `` `wiki/知识` `` → `` `wiki/knowledge` ``。代码与用户可见的拒绝文案不动。
10. `agent/sandbox/config.ts`：第 34–35 行注释删掉「— old and new vault names both come out of `rulePaths` —」；第 68–69 行改为 `` course pages plus the generated board (`wiki/_generated/courses.md`), 周期, 日历. ``。
11. `agent/tools/course-plan-tool.ts` 的 `boardCalls`：删掉 `existsSync` 判断，固定 `md = join(vault, "wiki/_generated/courses.md")`、`html = join(vault, "wiki/_generated/courses.html")`；注释改为 `/** dashboard → render-board; the board lives in \`wiki/_generated/\`. */`；`existsSync` 不再用就删 import。
12. `main/data/vault.ts` 的 `generatedDir`：改为 `return join(vault, "wiki", "_generated");`，JSDoc 改为 `Where generated boards (courses.md / courses.html) live: \`wiki/_generated/\`. Nothing is created here — the caller writes.`；`existsSync` 不再用就删 import。
13. `main/data/sources.ts`：`SOURCE_ROOTS = ["raw", "clippings"] as const;`；第 2、5–6、84 行注释删「（旧库 `Clippings/`）」；第 21–22 行改为 `` `clippings/` holds web clippings. ``；第 94–96 行的大小写比较逻辑保留（大小写不敏感的卷上仍可能叫 `Clippings`），注释改为 `// Match by lowercase: on a case-insensitive volume the directory may be spelled differently on disk.`
14. `main/data/handler.ts` 第 98–99 行注释删「，\n      // 旧库 [[书房/<书>]]」那半句（保持句子通顺）。
15. `renderer/core/board/use-reading.ts` 第 51 行：`clippings/（旧库为 Clippings/）` → `clippings/`。
16. `renderer/core/strings.ts` 第 492 行：`"原文必须位于 raw/ 或 clippings/ 下。"`。
17. `renderer/gallery/panel-samples.ts` 第 100 行：`"Clippings/MapReduce 论文导读.md"` → `"clippings/MapReduce 论文导读.md"`。
18. `shared/data-protocol.ts` 第 397 行注释删「（旧库 `Clippings/`）」。

## 三、测试

规则（逐个测试文件执行）：
- (a) 专门测旧布局或「新旧两种都认」的用例：**删掉**（名字或断言里出现 旧库 / legacy layout / both spellings / `wiki/知识` / `wiki/书房` / `Clippings` / `wiki/courses.md` 的那类）。
- (b) 夹具（临时库）里建的旧目录改成新目录：`wiki/知识`→`wiki/knowledge`、知识页直接在 `wiki/` 根→放进 `wiki/knowledge/`、`wiki/书房`→`wiki/shelf`、`Clippings`→`clippings`、`wiki/courses.md|html`→`wiki/_generated/courses.md|html`；断言随之改。
- (c) 每改一个行为加一条新测试：
  - `anki-sync` / `flashcards` / `reading-queue`：库里只有 `wiki/知识/flashcards/…`（或 extracts）没有 `wiki/knowledge` 时，脚本不再读到旧目录里的卡 / 摘录（统计为 0 或按现有「找不到」的方式报）。
  - `bookshelf`：只有 `wiki/书房/` 时 `today` 不读它（当作书房为空）。
  - `render-board` 与 `course-state dashboard`：`wiki/_generated/` 不存在时，输出到 `wiki/_generated/courses.{html,md}` 并自动建目录。
  - `close/board.mjs`：`BOARD_RELS` 恰为两项。
  - `vault-lint`：`raw/library/x/y/z/` 只含 `.gitkeep` 时不报 empty-dir；`raw/x/` 空目录仍报；顶层 `Clippings/` 目录下的文件按普通「库一级目录」处理（不再当作剪藏目录做命名检查——写一条断言锁住现在的实际行为即可）。
  - `vault-paths`：`rulePaths(...).knowledge` 只有一项且以 `/wiki/knowledge` 结尾；`clippings` 只有一项。
  - `guard`：向 `wiki/知识/concepts/x.md` 写入不再被当成知识页（按现在 `decideWrite` 对普通 wiki 页面的结果断言）。
- 不新增测试文件，加到对应的现有 `*.test.*` 里。

## 验收（贴出每条最后几行）
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen && git grep -n -E "wiki/知识|wiki/书房|知识/|书房/|Clippings|wiki/courses\.(md|html)|旧库|再旧" -- skills apps/desktop/src ':!skills/wiki-save/rename-vault*' ':!skills/**/*.md'
```
最后一条 grep 应只剩：测试里第三节 (c) 新加的「旧目录不再被读」用例所建的夹具路径；以及 `apps/desktop/src/main/data/sources.ts` 里若保留的大小写注释。其余任何命中都要在报告里逐条说明为什么留。

## 结束报告
改了哪些文件（每个文件一句）；删掉 / 新增的测试条数；偏离任务单之处及原因；未完成项。不提交。
