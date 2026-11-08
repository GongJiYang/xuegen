---
name: calendar
description: 用户要求安排某天/某周（「在周五安排…」「11 月 5 日记一下…」）、查看某天或某月记了什么、做过什么（「11 月 5 日做了什么」「这个月的日历」）、或读写日历笔记时使用。问「今天 / 这周学什么」按学习周期安排的交给 cycle-plan。聚合只读来源（课程学习记录与计划表、阅读页 due、wiki/log.md），手写笔记只写 wiki/calendar/YYYY-MM-DD.md；不修改课程、阅读与日志。普通问答与自由学习不触发。
---

# 日历：把散落的日期聚合到一处

- 分工：问「今天 / 这周学什么」这类学习安排交给 `cycle-plan`（总控简报）；要挪动或加课次（「周五加一节 CTM」）交给 `course`（改计划，必要时 `--extra`），日历只把用户原话记成笔记。本技能不改课程排期。

负责「把库里已有的日期信息按天聚合」与「用户手写日历笔记」。日程的**真相源**在各自的位置：课程计划在学习记录与计划表，阅读到期在阅读页 `due`，活动痕迹在 `wiki/log.md`。本技能只读取它们、不修改；唯一可写的是 `wiki/calendar/`。

排程阅读交给 `reading`，课程进度与计划表交给 `course`，本技能不替它们写状态。

## 输入与脚本

所有命令都通过本技能目录的 `calendar.mjs` 运行，`<vault>` 是 Wiki 库根目录（含 `wiki/`）：

```sh
C="<技能实际目录>/calendar.mjs"; W="<库根目录绝对路径，即 wiki.json 的 root>"
node "$C" month "$W" 2026-10 --json    # 整月聚合
node "$C" get "$W" 2026-10-22 --json   # 某天详情
node "$C" write "$W" 2026-11-05 --text "周五：复习 BA，看 Stachniss 视频"   # 写笔记
node "$C" write "$W" 2026-11-05 --stdin   # 从标准输入写
```

脚本报错就停下如实报告，不改用别的方式写状态文件。

## 聚合来源（只读）

`month` 与 `get` 从以下位置收集，按日期归类：

| 来源 | 位置 | 标记 |
|---|---|---|
| 学习记录 | `wiki/courses/<slug>.md` 的 `## Learning Record` 下 `### YYYY-MM-DD-NN` | ● |
| 计划表 | 课程 `## 计划表` 表格里带 `MM-DD` 的行（如 `\| D2 \| 10-22 \| … \|`），年份取课程上下文 | ◆ |
| 阅读到期 | `wiki/reading/<slug>.md` 的 frontmatter `due` | ▲ |
| 活动日志 | `wiki/log.md` 的 `## [YYYY-MM-DD] …` | log |
| 手写笔记 | `wiki/calendar/YYYY-MM-DD.md` 正文 | ✎ |

- `month` 返回 `{month, days}`，`days` 只含有内容的日期，每项形如
  `{records:[{course,heading}], plans:[{course,label}], readingDue:[{slug,title}], log:[string], note:string|null}`。
- `get` 返回单日同样的结构。
- 日期一律 `YYYY-MM-DD`；月份为 `YYYY-MM`。

## 写日历笔记

- 只有用户明确要求「记一下 / 记在某天 / 安排某天」时才写入，写到 `wiki/calendar/YYYY-MM-DD.md`。
- 文件带 frontmatter `date: YYYY-MM-DD`，正文是用户的话（可整理成条目，不要加解释或计划外内容）。
- **正文为空则删除该文件**（脚本负责），不写「（空）」占位。
- 一个日期一个文件，重复写入覆盖当天旧内容；先读到最新再写。
- 原子写入由脚本完成，不手工创建或编辑日历文件。

## 边界与返回

- 不写入 `wiki/courses/`、`wiki/reading/`、`wiki/log.md`；它们是只读来源。要改阅读排程用 `reading`，要收课用 `course`。
- `raw/`、`Clippings/`、`wiki/prompts/`、凭据目录一律只读。
- 回复简短：本次是「查看」还是「写入」、涉及哪些日期、来源各命中几条；写笔记时给出实际保存路径。
