---
name: reading
description: 用户要求把文章/论文/书摘加入渐进阅读队列、查看今天该读什么、结束一次阅读（继续/搁置/读完）、从正在读的材料中做摘录、从摘录制卡、主项教材的整本通读（低强度日读哪段、读到哪）、记一笔讲后读，或询问阅读队列进度与本周计划时使用。阅读状态是 Wiki 的 wiki/reading/<slug>.md，摘录是 wiki/知识/extracts/<slug>/，排程只经本技能目录的 reading-queue.mjs 修改；制卡沿用 wiki-save 与库内制卡规则。普通自由学习不触发。
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
node "$Q" add "$W" "wiki/知识/sources/<登记页>.md" --slug epp --every 14 --due 2026-11-14   # 教材：固定每 14 天，从指定日期开始
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

## 教材通读（学习周期的主项课）

主项课的教材整本通读走本队列（`course` 的「原书通读」）。课程页不记通读的分段、日期和位置，这些只在阅读页里。

- **建页**：原文用这本书在 `wiki/知识/sources/` 的登记页（PDF 本身在 `raw/books/`，脚本不读 PDF）；`--slug` 用短名（如 `epp`、`ctm`），`--priority high`，`--every 14`，`--due` 取第一个低强度日；两门主项的书错开 7 天。建好后在阅读页正文补：一行本地 PDF 的库内路径与页码换算，和 `## 分段`（按章节顺序列全书各段，如「1. Ch1 §1.1–1.4 pp.1–36」，本周期不讲的标「后续周期」；不写日期）。在登记页加一行「阅读：[[reading/<slug>]]」，课程页 `Key Facts` 加「原书：讲后读（错开）；读到哪见 [[reading/<slug>]]」。
- **读**：从 `position` 往后读下一段；Reading Log 里记过的讲后读核心页跳过。按页读，一次不超过 10 页（`pdftotext -f -l`），不整章导出、不整段打印进对话。结束时照常 `review`：读完一段用 `next --position "<下一段起点>"`，没读用 `postpone`；固定间隔的书两种结果都保持原来的节奏（下一个到期日 = 原到期日加 14 天的整数倍，落在今天之后），不会越拉越长。
- **讲后读**：用户在课上确认读过核心页时，由 `course` 用 `note` 记一行，不改排程。
- 只写读什么，不写时长、不估读完日期；落后不算逾期。

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
