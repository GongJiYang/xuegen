# 收课/计划事务（course-close.mjs）

写库不直接改：先在 `<工作区>/.close/<slug>-<YYYYMMDD-HHMMSS>/` 暂存镜像里改，校验通过后一次原子提交。暂存分两种（`manifest.kind`）：`close`（默认，课程会话收课，旧 manifest 没有 kind 一律算它）与 `plan`（总控 `course_plan` 建课/改计划）。两个工具是两道按角色开的门，后面是同一台事务机。

## 命令

```sh
node course-close.mjs stage   <库> <slug> --workspace <工作区> [--kind plan] [--new --subject <科目id>] [--json]
node course-close.mjs add     <暂存目录> <库内相对路径> [--json]
node course-close.mjs check   <暂存目录> [--json]
node course-close.mjs commit  <暂存目录> [--label 收课|存档点] [--json]
node course-close.mjs abort   <暂存目录>
node course-close.mjs schedule <暂存目录> --lessons <课次清单> [--start --end --rest --days --extra --reviews] [--json]
node course-close.mjs shift   <库> <slug> --workspace <工作区> [--today YYYY-MM-DD] [--end YYYY-MM-DD] [--json]
node course-close.mjs undo    <库> <slug> --workspace <工作区> [--json]
node course-close.mjs recover <库> --workspace <工作区> [--json]
node course-close.mjs snapshot <暂存目录> <报告相对路径> <PNG相对路径> [--json]
```

- `stage`：建暂存目录，按库内相对路径写时复制课程页、`wiki/index.md`、`wiki/log.md`、当月 records（存在才复制）；写 `manifest.json` 记基线 sha256。同一门课有未提交暂存时拒绝（slug 前缀相同的别门课不算）。`--kind plan` 开计划暂存：复制范围同上，外加科目页 `wiki/subjects/<科目>.md`（存在才复制）。`--new`（只能和 `--kind plan` 一起用）开新建课程暂存：课程页必须不存在（存在报「这门课已存在」），暂存里不放课程页，只复制 `index.md`、`log.md` 与科目页；`--subject` 必填（小写字母/数字/连字符）。
- `add`：把库里已存在的页（如要补的概念页）复制进暂存并记基线。改已有页之前必须先 add。
- `check`：只校验不写库；`--json` 输出 `{ ok, problems, changes }`，未通过 exit 1。
- `commit`：再校验 → 写提交日志 → 逐文件「临时文件 → fsync → rename」→ 上锁 → `jj commit`（库在 jj 下时，只提交本次写入的文件）。提交前自动重画课程看板（Markdown + 网页）并一起提交；看板失败只报告，不影响收课。存档点用 `--label 存档点`，jj 记「存档点 <slug> <日期>」，`undo` 不会撤它；不填 `--label` 就是「收课」。计划暂存的 commit 一律记「计划 <slug> <日期>」，不接受 `--label`。
- `abort`：删整个暂存目录，库不动；已提交的暂存不能 abort。
- `schedule`：只允许 `kind: plan` 的暂存。在暂存里的课程页副本上跑 `course-schedule.mjs plan … --write`（沙盒外 Node 子进程），`--lessons` 给相对路径时按暂存目录解析。脚本报错（如课次多于上课日，给出建议截止日期）原样返回，暂存不动。排期完照常 `check` / `commit`。
- `undo`：jj 把最近一次「收课 <slug>」提交改过的文件恢复到提交前，再提交「撤销收课」；那次新建的页面（卡片页、概念页）保留不删，在输出里列出，问用户后再删。
- `shift`：开课时的顺延。stage 课程页 → 在暂存副本上跑顺延（算法同 `course-schedule.mjs shift`，`--end` 不给就用排期标记里的 `end=`）→ 校验 → 提交，jj 记「顺延 <slug> <日期>」。没有要顺延的就删掉暂存、什么都不提交。校验不过也删掉暂存再报错。
- `snapshot`：收课第 7 步截图。报告 JSON（`render-snapshot` 的输入）先写进暂存目录，文件名用点开头（如 `.snapshot.json`，点开头文件不进收课清单）；`<PNG相对路径>` 必须是 `wiki/courses/<slug>/snapshots/*.png`。在沙盒外跑 `render-snapshot.mjs`（bash 沙盒里起不了 Chrome），成功输出 `{ snapshot: <PNG相对路径> }`；失败退出非 0、中文报原因，暂存里不留半张图。截图之后照常 `check` / `commit`，PNG 作为新文件随提交进库。
- `recover`：发现残留提交日志就补完；每个命令开头都自动跑一次，可重复跑（已 rename 的跳过）。

## 暂存目录

```
<工作区>/.close/<slug>-<时间戳>/
├── manifest.json            # version、kind（close|plan）、vault、slug、subject、base{路径:sha256}
├── committed                # 提交成功后写入的空标记
└── wiki/…                   # 按库内相对路径的镜像文件（chmod 0644 可改）
```

镜像里出现符号链接一律拒绝（不跟随），报 `kind: "owner"`。

## 校验规则（check 与 commit 都跑）

1. 归属：路径须是 `wiki/courses/<slug>.md`、`wiki/courses/<slug>/**`、`wiki/index.md`、`wiki/log.md`，或本科目概念/卡片目录（新库 `wiki/knowledge/{concepts,flashcards}/<科目>/`，旧库 `wiki/知识/{concepts,flashcards}/`）。计划暂存（`kind: plan`）的归属只有 `wiki/courses/<slug>.md`、`wiki/courses/<slug>/`、`wiki/index.md`、`wiki/log.md`、`wiki/subjects/<科目>.md`——总控不写知识页。带 `..`、绝对路径、大小写变体的写法一律不算本课。
2. 课程页：`course-parse` 能解析且有标记；「完成：」课次都在排期表；≤ 200 行。
3. 只追加：`log.md` 以基线全文开头；`index.md` 不删基线的行。
4. 冲突：基线文件在库里的 sha256 未变；新文件在库里仍不存在。
5. 概念页：新增的 `concepts/` 下 .md 有 frontmatter 且含 `sources:`。

## 上锁范围

课程页与 `wiki/courses/<slug>/**` 下所有文件 0444，`<slug>/` 及子目录 0555；`wiki/courses/` 本身、别的课、概念页、`index.md`、`log.md` 保持 0644。

## 失败与恢复

- 提交中断（写临时文件后、rename 前后崩溃）：`<工作区>/.close/journal.json` 留下日志，下次运行任何 course-close 命令自动补完，并在 stderr 打「已补完上次中断的收课」。
- `jj commit` 失败：文件已原子落盘，不回滚，结果里记 `jj: "failed: …"`。
- `undo` 的安全闸：这次收课之后同一批文件又被改过（提交或工作副本）就拒绝，什么都不动；先处理那次改动再撤销。
- 对结果不满意：`undo` 走 jj 恢复，库不在 jj 下时不可用。
