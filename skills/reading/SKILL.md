---
name: reading
description: 用户要求把文章/论文/书摘加入渐进阅读队列、查看今天该读什么、结束一次阅读（继续/搁置/读完）、从正在读的材料中做摘录、从摘录制卡、书房里整本书的排期与读到哪（「我想读《…》」、今天读哪段、读完这段）、记一笔讲后读，或询问阅读队列进度与本周计划时使用。文章与论文的阅读状态是 Wiki 的 wiki/reading/<slug>.md，整本书在 wiki/书房/（排期经 bookshelf.mjs），摘录是 wiki/知识/extracts/<slug>/，排程只经本技能目录的 reading-queue.mjs 修改；制卡沿用 wiki-save 与库内制卡规则。普通自由学习不触发。
---

# 渐进阅读

负责「导入 → 排程 → 阅读 → 摘录 → 制卡」中的排程、摘录与制卡衔接。讲解材料交给 `teach`，制卡格式与同步交给 `wiki-save` 和库内规则，课程进度交给 `course`。不自动把阅读计入课程，也不因为读过就宣称理解。

## 入口与配置

1. 阅读 `../wiki-save/SKILL.md` 的「入口与配置」，复用 `wiki.json` 定位库路径，并读取库根目录 `AGENTS.md` 中 Reading Page、Extract Page 与 Incremental Reading Workflow 三段。规则以库内为准；本文件与库规则冲突时，说明冲突并询问。
2. 原文在 `raw/` 或 `Clippings/`，**只读**；教材另可用它在 `wiki/知识/sources/` 的登记页作原文（见「教材通读」）。阅读进度、位置和摘录只写在 `wiki/reading/` 与 `wiki/知识/extracts/`。
3. 导入由 Obsidian 插件完成（简悦/Web Clipper、微信读书、Zotero + ZotLit），或用户粘贴到 `raw/notes/YYYY-MM-DD-标题.md`。本技能不安装、不配置 Obsidian 插件，不修改 `.obsidian/`。

## 排程只走脚本

`wiki/reading/*.md` 的 frontmatter 是排程状态，**只能**通过本技能目录的 `reading-queue.mjs` 修改，不手工改日期或间隔。正文中的「Extracts」链接可以用编辑工具补充。

```sh
Q="<技能实际目录>/reading-queue.mjs"; W="<库根目录绝对路径，即 wiki.json 的 root>"
node "$Q" add "$W" "<raw 或 Clippings 下的原文相对路径>" --priority medium   # 加入队列
node "$Q" add "$W" "wiki/知识/sources/<登记页>.md" --slug <slug> --every 14 --due <日期>   # 固定间隔的长期材料（整本书改放书房）
node "$Q" today "$W" --limit 3                                               # 今天该读什么
node "$Q" review "$W" <slug> --outcome next --position "第 3 节"            # 读完一段，继续
node "$Q" review "$W" <slug> --outcome postpone                               # 今天不读，顺延
node "$Q" review "$W" <slug> --outcome done                                   # 读完
node "$Q" pause|resume "$W" <slug>                                            # 暂停 / 恢复
node "$Q" note "$W" <slug> --text "讲后读 D1 核心页 pp.1–5 已读（用户自报）"   # 只记 Reading Log，不改排程
node "$Q" stats "$W" [--json]                                                 # 队列统计
node "$Q" verify "$W"                                                         # 校验状态与链接
```

所有命令支持 `--json` 供解析。脚本报错就停下如实报告，不改用别的方式写状态文件。

## 加入队列与建议优先级

- 用户给出库内材料时，先确认它已存在于 `raw/` 或 `Clippings/`。
- **剪藏网址**：用户给出 http(s) 网址要加入阅读（桌面版「剪藏」按钮会这样发），可以代为抓取：取正文转成 Markdown，文件头写 `title`、`source`（原网址）、`clipped`（日期），存到 `Clippings/<标题>.md`（与 Obsidian 剪藏插件同一目录与格式；同名已存在就不覆盖、直接用它），然后 `add "<Clippings 下的相对路径>" --priority <优先级> --due today|scheduled`。抓取失败或需要登录时如实说明，请用户用插件剪藏。不往 `raw/` 里写。
- 用户没指定优先级时，根据其当前目标、已选课程和材料内容**建议**一个优先级并说明理由，用户确认后再 `add`。
- 一次加入多篇时逐篇确认；队列已有该材料时脚本会拒绝，告知用户现有状态。

## 书房：整本书（用户 2026-11-08 定）

自己读的整本书——主项教材（计划内）和用户想读的书（计划外）——都在 `wiki/书房/`，一本一页，排期只经本技能目录的 `bookshelf.mjs`。阅读队列（`wiki/reading/`）只管文章、论文、网页摘录。

- **规则**：每天都读，每天一段（按节切，一段 ≤ 10 页）；计划内（`slot: planned`）一次只读一本，读完自动开下一本（按 `order`）；计划外（`slot: free`）同时最多一本。只排每天读哪几页、算预计读完日期，**不估每天要花多久**。没读不跳段，第二天接着读同一段，读完日期整体顺延。讲后读读过的页照读，不跳过。
- **加书**（用户说「我想读《…》」「把 X 加进书房」）：先找原文——库里的 `raw/books/` 或用户给的路径，在 `wiki/知识/sources/` 登记（没有登记页就按 `wiki-save` 建一个）；再建 `wiki/书房/<slug>.md`：frontmatter 照下面的样子，正文写 `## 分段`（按目录的章、节顺序列，每行「N. <章节> pp.<起>–<止>」，用书内页码，页码换算写在一行说明里）和 `## 不读`（本来就不打算读的部分）。计划外已经有一本在读时，先问用户是换掉还是排队。最后：
  ```bash
  B="<本技能目录>/bookshelf.mjs"
  node "$B" plan "<库根>" <slug> --write     # 生成排期表（不手改）
  node "$B" index "<库根>" --write           # 更新 wiki/书房/index.md
  ```
  frontmatter：`kind: book`、`slot: planned|free`、`order`（计划内排第几本）、`status: queued|reading`（计划内只有第一本是 reading）、`title`、`short`（两三个字的短名，如 Epp）、`source`（登记页链接）、`file`（PDF 库内路径）、`page_offset`、`started`（reading 的写开始日期）、`position: 0`。
- **读**：今天读哪段看 `node "$B" today "<库根>" --json`；读的时候按页读（`pdftotext -f -l`），不整章导出、不整段打印进对话。读完一段由用户在界面点「读完这段」，或在对话里说读完了——这时运行 `node "$B" done "<库根>" <slug>`，不手改 `position` 和读书记录。
- **日期**：排期表里读过的段记实际读完的日子，没读的段从「下一段该读的那天」（今天已读完就是明天，不早于开始日）逐日往后排；预计读完日期也这样算。`plan --write` 时开始日为空会写回当天。
- **讲后读**：勾选仍由 `course` 在课程页 `Today` 做；课程页链着 `[[书房/<书>]]` 时，界面的「读完了」会同时记进书房书页——「## 读书记录」加一行，「核心页已定」的页码进「## 核心页已读」，不算读完一段。在对话里补记时运行 `node "$B" lecture "<库根>" <书> --label "<标签>" --course <课程slug> --pages "<页码列表>"`。核心页照读不跳，今日卡会在读到这几页时提一句。
- **摘几句**：读完一段，用户可以在今日卡点「摘几句」存一句原文和页码，写进书页「## 摘录」（`- p.<页>: <原句> #待做卡`）。在对话里摘时运行 `node "$B" extract "<库根>" <书> --page <页> --text "<原句>"`。只存原句，不改写、不调模型做总结。
- **书房做卡**（用户在阅读面板点「把 N 句做成卡」，或说「把 Epp 的摘录做成卡」）：
  1. `node "$B" list "<库根>" --json`，取这本书 `extracts` 里 `carded` 为 null 的几句（记下各自的 `index`）。
  2. 按库内制卡规则与 `wiki-save` 起草：一句原文可出 0–2 张卡，问答或挖空，每张背面写「<short> p.<页>」；只在回复里列出草稿，**用户说可以之前不写入**。
  3. 用户确认后逐张 `node "<wiki-save 目录>/flashcards.mjs" add "<库根>" --deck "书房::<short>" --front … --back …`；全部写完再 `node "$B" card "<库根>" <书> --index <用过的序号，逗号分隔>`。用户删掉的句子也一并标记，并告诉用户。
  4. 牌组「书房::<short>」第一次出现时，提醒用户在 Anki 里把它设成预设「书房」（子牌组不会自动继承）。
- 告诉用户读书进度时，说「Epp 读了 12 / 81 段，预计 1 月 28 日读完（晚 2 天）」这样的话，不说脚本名和字段名。

## 每日阅读

1. `today` 列出到期材料（默认 3 篇），按优先级与逾期程度排序。展示标题、优先级、上次位置。
2. 用户选一篇开始读。可以配合 `teach` 讲解难点，但不强制测验。
3. 结束时询问结果：继续（next，附读到的位置）、搁置（postpone）或读完（done），再调用 `review`。不在用户没表态时替用户决定。
4. 用户说「今天到这里」时，对本次读过但未 `review` 的材料逐一确认结果。

## 摘录

- 用户选中或指出一段有价值的内容时，创建摘录页 `wiki/知识/extracts/<slug>/YYYY-MM-DD-<标题>.md`，严格按库内 Extract Page 结构：
  - 标题不超过 15 个字，概括这段讲了什么；
  - 3-5 个标签，优先复用库内已有标签；
  - 引文**逐字**来自原文，用引用块；用户自己的理解另放「My Understanding」，不混写；
  - `source` 指向原文，`reading` 指向阅读页，`cards: pending`。
- 在阅读页「Extracts」段追加摘录链接。
- 同名文件已存在时加序号，不覆盖。不确定原文出处或位置时如实标注。

## 制卡

- 只在用户要求时制卡。读取 `../wiki-save/SKILL.md` 的「制作闪卡」，并遵守库内 `wiki/prompts/wiki/flashcard-rules.md`，其中「渐进阅读摘录制卡（补充）」适用于从摘录制卡：单次最多 10 张，不凑数。
- 卡片写入 `wiki/知识/flashcards/<topic>/`，来源链接写在卡片块外，指向摘录页；完成后把摘录的 `cards` 改为 `done` 并在摘录页链接卡片页。
- 写入卡片文件不等于同步到 Anki；没有同步证据时只报告「已生成」。

## 节奏与计划

- 用户要「本周计划」时，用 `stats --json` 与 `today --limit 20 --json` 的结果，按每天 1-3 篇给出安排；只是建议，不写文件。
- 每周回顾：列出新导入但未入队的材料（`raw/`、`Clippings/` 中近 7 天的新文件）供用户选择，列出 `cards: pending` 的摘录。不自动入队、不自动制卡。
- 每月回顾：按标签汇总 `wiki/知识/extracts/`，建议可以抽象成概念页或更高层卡片的主题，交给 `wiki-save` 执行。

## 返回

简短列出：本次排程变化（篇目、结果、下次日期）、新增摘录、卡片数量与同步状态、待确认事项。
