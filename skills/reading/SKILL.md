---
name: reading
description: 用户要求把文章/论文/书摘加入渐进阅读队列、查看今天该读什么、结束一次阅读（继续/搁置/读完）、从正在读的材料中做摘录、从摘录制卡，或询问阅读队列进度与本周计划时使用。阅读状态是 Wiki 的 wiki/reading/<slug>.md，摘录是 wiki/extracts/<slug>/，排程只经本技能目录的 reading-queue.mjs 修改；制卡沿用 wiki-save 与库内制卡规则。普通自由学习不触发。
---

# 渐进阅读

负责「导入 → 排程 → 阅读 → 摘录 → 制卡」中的排程、摘录与制卡衔接。讲解材料交给 `teach`，制卡格式与同步交给 `wiki-save` 和库内规则，课程进度交给 `course`。不自动把阅读计入课程，也不因为读过就宣称理解。

## 入口与配置

1. 阅读 `../wiki-save/SKILL.md` 的「入口与配置」，复用 `wiki.json` 定位库路径，并读取库根目录 `AGENTS.md` 中 Reading Page、Extract Page 与 Incremental Reading Workflow 三段。规则以库内为准；本文件与库规则冲突时，说明冲突并询问。
2. 原文在 `raw/` 或 `Clippings/`，**只读**。阅读进度、位置和摘录只写在 `wiki/reading/` 与 `wiki/extracts/`。
3. 导入由 Obsidian 插件完成（简悦/Web Clipper、微信读书、Zotero + ZotLit），或用户粘贴到 `raw/notes/YYYY-MM-DD-标题.md`。本技能不安装、不配置 Obsidian 插件，不修改 `.obsidian/`。

## 排程只走脚本

`wiki/reading/*.md` 的 frontmatter 是排程状态，**只能**通过本技能目录的 `reading-queue.mjs` 修改，不手工改日期或间隔。正文中的「Extracts」链接可以用编辑工具补充。

```sh
Q="<技能实际目录>/reading-queue.mjs"; W="<库根目录绝对路径，即 wiki.json 的 root>"
node "$Q" add "$W" "<raw 或 Clippings 下的原文相对路径>" --priority medium   # 加入队列
node "$Q" today "$W" --limit 3                                               # 今天该读什么
node "$Q" review "$W" <slug> --outcome next --position "第 3 节"            # 读完一段，继续
node "$Q" review "$W" <slug> --outcome postpone                               # 今天不读，顺延
node "$Q" review "$W" <slug> --outcome done                                   # 读完
node "$Q" pause|resume "$W" <slug>                                            # 暂停 / 恢复
node "$Q" stats "$W" [--json]                                                 # 队列统计
node "$Q" verify "$W"                                                         # 校验状态与链接
```

所有命令支持 `--json` 供解析。脚本报错就停下如实报告，不改用别的方式写状态文件。

## 加入队列与建议优先级

- 用户给出材料时，先确认它已存在于 `raw/` 或 `Clippings/`；不存在就请用户先导入，不代为下载或复制到 raw。
- 用户没指定优先级时，根据其当前目标、已选课程和材料内容**建议**一个优先级并说明理由，用户确认后再 `add`。
- 一次加入多篇时逐篇确认；队列已有该材料时脚本会拒绝，告知用户现有状态。

## 每日阅读

1. `today` 列出到期材料（默认 3 篇），按优先级与逾期程度排序。展示标题、优先级、上次位置。
2. 用户选一篇开始读。可以配合 `teach` 讲解难点，但不强制测验。
3. 结束时询问结果：继续（next，附读到的位置）、搁置（postpone）或读完（done），再调用 `review`。不在用户没表态时替用户决定。
4. 用户说「今天到这里」时，对本次读过但未 `review` 的材料逐一确认结果。

## 摘录

- 用户选中或指出一段有价值的内容时，创建摘录页 `wiki/extracts/<slug>/YYYY-MM-DD-<标题>.md`，严格按库内 Extract Page 结构：
  - 标题不超过 15 个字，概括这段讲了什么；
  - 3-5 个标签，优先复用库内已有标签；
  - 引文**逐字**来自原文，用引用块；用户自己的理解另放「My Understanding」，不混写；
  - `source` 指向原文，`reading` 指向阅读页，`cards: pending`。
- 在阅读页「Extracts」段追加摘录链接。
- 同名文件已存在时加序号，不覆盖。不确定原文出处或位置时如实标注。

## 制卡

- 只在用户要求时制卡。读取 `../wiki-save/SKILL.md` 的「制作闪卡」，并遵守库内 `wiki/prompts/wiki/flashcard-rules.md`，其中「渐进阅读摘录制卡（补充）」适用于从摘录制卡：单次最多 10 张，不凑数。
- 卡片写入 `wiki/flashcards/<topic>/`，来源链接写在卡片块外，指向摘录页；完成后把摘录的 `cards` 改为 `done` 并在摘录页链接卡片页。
- 写入卡片文件不等于同步到 Anki；没有同步证据时只报告「已生成」。

## 节奏与计划

- 用户要「本周计划」时，用 `stats --json` 与 `today --limit 20 --json` 的结果，按每天 1-3 篇给出安排；只是建议，不写文件。
- 每周回顾：列出新导入但未入队的材料（`raw/`、`Clippings/` 中近 7 天的新文件）供用户选择，列出 `cards: pending` 的摘录。不自动入队、不自动制卡。
- 每月回顾：按标签汇总 `wiki/extracts/`，建议可以抽象成概念页或更高层卡片的主题，交给 `wiki-save` 执行。

## 返回

简短列出：本次排程变化（篇目、结果、下次日期）、新增摘录、卡片数量与同步状态、待确认事项。
