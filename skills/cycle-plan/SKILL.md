---
name: cycle-plan
description: 用户要求制定或调整学习周期（7 周一轮、两门主项一天只主攻一门）、问今天/这周按周期该做什么（「今天学什么」「这周安排」「今天是什么日」）、做周五整合或周期验收、轮换到下一周期、或把新资料登记到科目时使用。周期页是 wiki/cycles/<cN>.md，按日查询只经本技能目录的 cycle.mjs；课程的排期、教学与收课交给 course 与 teach，本技能不写课程文件。普通问答、只看某门课进度或自由学习不触发。
---

# 学习周期：总控

负责「一个周期里每天该做什么」：周期页、周模板、每日简报、周五整合、周期验收与轮换、科目资料登记。它是总控会话的工作流：只安排与汇报，不讲课。

| 事情 | 交给谁 |
|---|---|
| 讲课、检查理解 | `teach` |
| 课程排期（`course-schedule.mjs`）、打勾、收课、提议闪卡 | `course` |
| 只读的课程进度展示 | `course-board` |
| 按天聚合日期、手写日历笔记 | `calendar` |
| 写闪卡、整理知识进 Wiki | `wiki-save` |

库的位置按 `wiki-save`「入口与配置」读取 `wiki.json`；库规则以库根目录 `AGENTS.md` 为准（Learning Skeleton、Subject Page、Cycle Page、Material Registration 各节）。

## 周期页（状态源）

每个周期一页 `wiki/cycles/<cN>.md`（`c1.md`、`c2.md`…）。脚本只读两处，格式必须严格：

```markdown
---
cycle: C1
start: 2026-11-06
end: 2026-12-24
---

## Weekly Template

| 星期 | 类型 | 主项 | 辅助 |
|---|---|---|---|
| 周一 | 深度 | [[subjects/<slug>\|离散]] | [[subjects/<slug>\|C]] |
| …（共 7 行，周一到周日） |
| 周日 | 休息 | — | — |
```

- 深度日只链接科目：`[[subjects/<slug>\|短名]]`，短名（如「离散」「范式」）2–4 个字。这一天学该科目下的哪门课，由各课程自己的排期决定。
- 第 4 列「辅助」（可省略）只能写在深度日：这一天的辅助科目（路线上的下一周期主项）。辅助只做了解：每次 ≤ 45 分钟（上限，不是估时），不考核、不出检查题、不参加周核实和周期验收，收课只记读到哪和问题。辅助课的上课日必须是该科目出现在辅助列的那几天；一个科目不能既是主项又是辅助。辅助科目暂时没有课不算错误。
- 一门课属于哪个科目、短名叫什么，看科目页 `## Materials` 资料行末尾的 `→ [[courses/<slug>|短名]]`（或 `## Courses` 里的链接）。短名就是简报、日历格子和总进度卡片上的课名，给每个课程链接写上别名。
- 本周期的课 = 模板里各科目链接的课中，至少有一节新课落在周期内的那些；学完的旧课自动不算。
- 类型只有四种：**深度**（一个主项主攻块，链接一个科目；可再配一个辅助短块）、**整合**（两科周核实 + 汇总本周问题 + 项目）、**低强度**（Anki 与拓展阅读，不上新课）、**休息**（不排任何任务）。
- 一天只主攻一门课。两门主项科目通常各占两个深度日；第五、六、七天分别是整合、低强度、休息。用户另有安排时照用户的来，但每周至少留一天休息。
- 周从 `start` 那天的星期起算（start 是周五，则每周是周五到下周四）；一个周期 7 周。
- 其余段落（Overview、Acceptance、Pending、Log）是自由文字，但改了周期就要在 `## Log` 追加一行 `- YYYY-MM-DD: …`。
- 同一科目下可以有多门课各自排课（如范式里 CTM 排周二、SICP 排周四，或 CTM 学完接着排 SICP）。每门课的上新课星期（排期标记里的 `days=`）必须都是它科目的深度日，同一科目同一天不能两门课都有新课；`cycle.mjs check` 会检查。一次性的额外上课日（`--extra`）允许。
- 给科目里的某份资料排课：先确认它在科目页上登记了，交给 `course` 建课，`plan … --days <该科目深度日中分给这门课的那几天> --reviews anki`；建好后在科目页资料行补 `→ [[courses/<slug>|短名]]`，再跑 `check`。

## 路线页（两年总计划）

`wiki/cycles/route.md` 列出 C1–C12 与恢复周的起止日期；frontmatter 的 `end` 是最后一个周期的最后一天（总进度顶部显示的「预计结束」），`buffer_weeks` 是另留的缓冲周数。`## Cycles` 表固定六列：`周期 | 开始 | 结束 | 主项 | 辅助（下周期主项） | 状态`，周期写 `C2` 或 `[[cycles/c1\|C1]]` 或 `恢复周`，状态写 进行中 / 未开始 / 完成（恢复周留空）。周期页的 start / end 必须与路线页那一行一致，`check` 会比对。

## 脚本

```sh
Y="<技能实际目录>/cycle.mjs"; W="<库根目录绝对路径，即 wiki.json 的 root>"
node "$Y" day "$W" [--date YYYY-MM-DD] [--json]    # 某天：周期、第几周、星期、类型、当天课次、过期未学的课次
node "$Y" week "$W" [--date YYYY-MM-DD] [--json]   # 该天所在周的 7 天
node "$Y" month "$W" YYYY-MM [--json]              # 一个月里落在周期内的每天的类型与课次（日历用）
node "$Y" overview "$W" [--date YYYY-MM-DD] [--json] # 路线结束日、本周期起止与剩余天数、每门课的节数与下一节（总进度用）
node "$Y" check "$W" [--json]                      # 校验所有周期页与课程排期是否一致
```

- 不给 `--date` 就用本机今天。日期、星期、第几周一律以脚本输出为准，不自己推算。
- `day --json` 返回 `{ date, weekday, cycle, week, type, subject, course, aux, auxCourse, names, subjects, roles, lessons, overdue }`（`subject`/`aux` 是当天的主项与辅助科目，`course`/`auxCourse` 是它们当天的课，`names` 课程 slug → 短名，`subjects` 科目 slug → 短名，`roles` 课程 slug → `main` 或 `aux`）：
  - `cycle` 为 `null` 表示这天不在任何周期内（其余字段为空）。
  - `type` 是周模板里这天的类型；`course` 是深度日链接的课程 slug，其他类型为 `null`。
  - `lessons`：所有周期课程在这天的计划行 `[{ course, id, content }]`（新课与机动行，不含复习）。深度日以外出现课次，就是额外上课日。
  - `overdue`：这天之前、`完成：` 行里没有的新课次 `[{ course, id, date, content }]`。
- `week --json` 返回 `{ cycle, week, start, end, days: [day 的结构 × 7] }`。
- `month --json` 返回 `{ month, days: { 'YYYY-MM-DD': { cycle, week, type, course } }, lessons: { 'YYYY-MM-DD': [{ course, id, content }] }, names, cycles: [{ cycle, start, end }], recovery: ['YYYY-MM-DD'] }`；`days` 只含周期内的日子，`recovery` 是路线页恢复周落在本月的日子。
- `overview --json` 返回 `{ date, route, cycle, courses }`：`route`（没有路线页时为 `null`）含 `start, end, bufferWeeks, weeksLeft, cycles, recovery`；`cycle`（不在周期内为 `null`）含 `cycle, title, start, end, week, weeks, daysLeft, next`；`courses` 是周模板链接的每门课 `{ slug, name, total, done, end, next }`（只算新课次，`next` 是第一节未完成的课，可能已过期）。问「什么时候学完」「还剩多久」时用它。
- `check --json` 返回 `{ ok, problems: [string] }`。
- 科目骨架用同目录的 `subjects.mjs`：`node "<技能实际目录>/subjects.mjs" list "$W" [--date YYYY-MM-DD] --json` 返回 `{ date, cycle: { cycle, week, weeks, aux } | null, subjects: [{ slug, title, layer, route, main, courses, materials }] }`。`main` 表示它是当前周期的主项（`route` 以「C1 主项」这样的文字开头）；资料行按 `### 书籍` 等分类解析出记号、状态、角色、标题和链接的课程。登记资料后可以用它核对科目页格式。
- 脚本只读，不写任何文件。报错就停下如实报告，不改用别的方式推算。

## 流程

### 每日简报（打开总控、问「今天学什么」）

1. 运行 `day --json`。`cycle` 为 `null` 时说明不在周期内，问用户是否要建新周期，到此为止。
2. 按下面的「返回格式」给出简报，按类型写今天的事：
   - **深度**：主项课的课次；另一门主项课程页 `Today` 里未打勾、日期是今天的「讲后读」行（读课程页，只读）；日期早于今天、仍未打勾的讲后读也列出，用 `!` 标「没读」；`auxCourse` 不为空时再列辅助课的课次（只做了解、不考核），辅助科目还没排课时写「辅助 X 未排课」；Anki。`lessons` 里 `roles` 为 `aux` 的课按辅助列出，不当主攻。
   - **整合**：两门主项（只算 `roles` 为 `main` 的课）各自 `This Week` 里的周核实项（读课程页，只读）；本周 `Learning Record` 里标「待核实」的问题；项目时间。
   - **低强度**：Anki；书房今天的两段（`reading` 技能目录的 `bookshelf.mjs today "<库根>" --json`：计划内一本、计划外一本，写书的短名和 pp.起–止）——书房每天都读，不只在低强度日；可选一份科目页里 ◌ 拓展资料的阅读，不上新课。
   - **休息**：只说「今天休息」，不推任务；Anki 可做可不做。
3. 有 `overdue` 时用 `!` 标出，说明「开这门课时 course 会先把它顺延到下一个上课日」；本技能不跑 `shift --write`。
4. 用户要开始上课时，交给对应课程：在桌面版切到该课程的会话；在其他宿主里，明确选中该课程后按 `course` 与 `teach` 进行。总控本身不讲课。

### 周五整合

- 周核实的提问、作答、打勾都按 `course` 的「周核实（整合日）」在**明确选定的那门主项课**里做（辅助课不核实），一门一门来；总控只列出要核实什么、汇总结果。
- 汇总写进周期页 `## Log` 一行（如 `- 2026-11-13: W1 整合：离散 W1 通过 2/3，CTM 周核实未做`），不改课程文件。

### 新建周期

只在用户要求时做，需要用户确认的点逐一问清后再写：

1. 依据 `wiki/subjects.md` 的路线表确定主项与辅助（上一周期的辅助转为主项）；用户可改。
2. 定 `start`、`end`：以 `wiki/cycles/route.md` 里这一周期的那一行为准（`end = start + 48 天`）；再定周模板。
3. 写 `wiki/cycles/<cN>.md`（上面的格式 + Overview / Acceptance / Pending / Log），登记到 `wiki/index.md` 的 `## Cycles`，把路线页这一行的周期格改成 `[[cycles/cN\|CN]]`、状态改「进行中」（上一周期改「完成」），更新 `wiki/subjects.md` 的「当前周期」，`wiki/log.md` 追加 `## [YYYY-MM-DD] cycle | CN`。
4. 每门主项的课程由 `course` 建立或重排：`plan … --days <该课的深度日> --reviews anki`，第一天不是深度日但用户要上课时加 `--extra`。主项课必须读原书：原书方式「讲后读（错开）」（核心页开课时定，读在另一门主项的下一个上课日），另有不受周期限制的通读，在书房（`wiki/shelf/`（旧库：`wiki/书房/`），每天一段，计划内一次一本，见 `reading` 技能「书房」）。
5. 运行 `check`，零问题才算完成。

### 调整周模板

改周期页表格 → `## Log` 记一行 → 受影响的课程按 `course` 用新的 `--days` 重排（已有记录与勾选保留）→ `check`。改模板会改用户的日程，先给出改后的一周预览（`week`）请用户确认。

### 周期验收与轮换

1. 最后一周的整合日或周期结束后，读每门主项课程页的 `Overall Goals`，逐条列出已核实 / 未完成，写进周期页 `## Acceptance`，`## Log` 记一行。
2. 主项未达标：按路线规则先用恢复周补齐，仍不达标则整体顺延，下一周期不提前启动依赖它的主项。说明情况后由用户决定；决定顺延时，把路线页之后每一行的日期和 frontmatter 的 `end` 一起往后改，`## Log` 记一行原因，再跑 `check`。
3. 用户确认后按「新建周期」开下一周期。

### 登记资料

用户说「把 X 加进 Y 科目」时，按库规则 Material Registration Workflow：只核对能核对的（扉页、目录、出版页），建登记来源页，放进科目页对应的资料类型下，状态 `◌ 未制定计划`，更新索引、追加 `subject` 日志。登记不是摄取：不建概念页、不制卡。要给它排课，交给 `course`。

## 读写边界

- 可写：`wiki/cycles/`、`wiki/subjects.md`、`wiki/subjects/`、登记用的 `wiki/knowledge/sources/`（旧库：`wiki/知识/sources/`） 新页、`wiki/index.md`、`wiki/log.md`（只追加）。
- 只读：`wiki/courses/`（改课程一律交给 `course`）、`wiki/knowledge/flashcards/`、`wiki/reading/`、`raw/`、`clippings/`（旧库：`Clippings/`）、`wiki/prompts/`、凭据目录。
- 记忆：科目页的 `## 讲解偏好` 归 `course`（按用户确认写），本技能不改；总控可以读各科偏好，只在用户明确要求时写 `wiki/profile.md`（全局）。
- 状态记号与库规则一致：● 学习中 · ! 需注意 · ✓ 已完成 · ○ 已排期 · ◌ 未制定计划 / 搁置。
- 没有证据不说「已完成」：课次是否学过只看课程页的 `完成：` 行与勾选。

## 返回格式（每日简报）

```text
C1 · W2 · 周一 11-16 · 深度 · 离散数学
● 主攻 离散 D4：Ch3 §3.1–3.2……
○ 讲后读 CTM D2 核心页：§2.4 pp.56–63、§2.6 pp.79–84
○ 辅助 C 语言 D2：……（只做了解）
! 未学 离散 D3（11-11）——开课时会先顺延，今天从 D3 开始
○ Anki
明天：周二 · 深度 · CTM
```

第一行固定为「周期 · 第几周 · 星期 日期 · 类型 · 课程」；非深度日有课次（额外上课日）时写成「整合 · 额外上课：离散 D1」，按深度日的方式安排这一课，整合内容顺延到下周；之后每行一个记号开头；最后一行写明天的类型。整合日列出各课的周核实项；休息日只有第一行和「今天休息」。
