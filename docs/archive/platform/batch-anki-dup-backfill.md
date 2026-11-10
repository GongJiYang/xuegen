# 任务单：anki-sync 遇到「Anki 里已有同样的卡」时回填 ID（DeepSeek，约 15 分钟，先写测试）

背景（2026-11-10 首次全量同步）：Obsidian_to_Anki 插件当年把 39 张卡送进了 Anki，但没把 `<!--ID:-->` 写回 Markdown。`anki-sync push` 对这种卡 `addNote` 报 duplicate，只记进 `duplicates`，不回填 ID，于是它们**每次都被当成待同步**，永远卡在那里。修法：报 duplicate 时去 Anki 里找到那张已有的笔记，唯一匹配就把它的 ID 回填到块里。

只改 `skills/wiki-save/anki-sync.mjs` 和 `skills/wiki-save/anki-sync.test.mjs`。不连真实 Anki（测试用文件里已有的假 AnkiConnect 写法，或在测试里起一个 `node:http` 假服务）；不碰 `~/.xuegen`、`~/xuegen-data`。不提交。

## 先写测试（`anki-sync.test.mjs`）
1. 假 AnkiConnect 对某张卡的 `addNote` 返回 `cannot create note because it is a duplicate`；`findNotes` 返回 `[111]`；`notesInfo` 返回该笔记，`fields.Front.value` 是同一正面（HTML 形式，例如反引号变 `<code>`、多一个 `<br>`）。→ `push` 后：Markdown 里这块写上 `<!--ID: 111-->`；JSON 结果里新字段 `linked` 含这一项（`{file, block, deck, front, id: 111}`），`duplicates` 里**没有**它；`added` 不计它。
2. 同上但 `findNotes`/`notesInfo` 找到 **两张**正面相同、都没被库里别的块用过的笔记 → 不回填，仍进 `duplicates`。
3. 找到的那张笔记的 ID 已经写在库里别的块上（任何卡片文件）→ 不回填，仍进 `duplicates`。
4. 一次 push 里多张 duplicate 属于同一牌组时，`findNotes` 每个牌组只调用一次（假服务里计数断言）。
5. `--dry-run` 行为不变（不连 Anki、不写文件）。

## 再改脚本
1. 正面比较函数 `normalizeFront(text)`（导出，便于测试）：去 HTML 标签、把 `&nbsp; &lt; &gt; &quot; &amp;` 还原、去掉所有空白；Markdown 一侧先过 `toAnkiHtml` 再同样处理。两边相等即同一正面。
2. 在逐块 `addNote` 的循环里，捕获到 duplicate 时：按 `deckName` 懒加载一次 `findNotes {query: 'deck:"<牌组>"'}` + `notesInfo`，建 `normalizeFront → [noteId]` 表（缓存到本次 push 结束）；候选 = 表里同正面、且不在「库里已用过的 ID 集合」里的 noteId。恰好 1 个 → 当作插入成功那样进 `inserted`（用于 `insertIds` 回填）并进 `result.linked`；否则照旧进 `duplicates`。
3. 「库里已用过的 ID 集合」= push 开始时扫描到的所有块里已有的 `id`，再加上本次刚分配 / 回填的。
4. `renderResult` 首行加 `｜关联 ${result.linked.length}`，并逐条打印 `关联：<file> 第<block>块「<front>」→ <id>`。`linked` 初始化为 `[]`，JSON 输出里始终有这个字段。
5. `usage()` 里补一句：已在 Anki 里、只缺 ID 的卡会被关联并回填 ID。

## 验收
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/wiki-save/anki-sync.test.mjs && npm test && npm run lint:skills
```
贴出最后几行。报告：改了哪些行、新增测试条数。
