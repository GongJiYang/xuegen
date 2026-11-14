# batch-planbook-2-carry（Devin，约 45 分钟，先写测试）：带读跨周期仍可见、check 不再误报

背景：`docs/platform/PLANBOOK-1111.md`。用户 2026-11-11 定：辅助课（对用户叫「带读」）**不设完结**，没上的课一直往后顺延，可以越过周期结束日、进入下一个周期。现在 `skills/cycle-plan/cycle.mjs` 有两处跟不上：
- `loadCourses(vault, cycle)` 只装这个周期**自己周模板**里的科目（主项列 + 辅助列）的课。带读顺延进下一周期、而下一周期模板里没有这个科目时，`day` / `month` / `overview` 都看不到它（`cycle.test.mjs` 第 689 行的 `test.todo` 记的就是这个）。
- `checkCycle` 对每个新课次都检查「在周期之外」，带读一越过周期结束日，`check` 就报错。

约束：只改 `skills/cycle-plan/cycle.mjs` 与 `skills/cycle-plan/cycle.test.mjs`；不加依赖；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。先写测试看它失败，再改代码。

## 改法

1. **`loadCourses` 补「带过来的带读」**：照现有两组（main、aux）装完以后，再扫 `wiki/courses/*.md`（`readdir`，只看 `.md`，跳过已装进 `courses` 的 slug）：
   - 有排期标记（`readSchedule(text)` 不为空），且至少一个 `kind === "new"` 的行日期在 `[cycle.start, cycle.end]` 内，且这一行**没完成**（`completedIds(text)` 里没有它的 id）——才装进来；
   - 装进来的值：`{ subject, role: "aux", carried: true, name, rows, done, days }`。`subject` = 课程页 `## Relationships` 一节里第一个 `[[subjects/<s>` 的 `<s>`（照 `skills/course/close/rules.mjs` 的 `subjectOf` 写一个本文件内的同样函数，不要跨目录 import 它）；找不到为 `null`。`name` = 该科目页里链到这门课的别名（复用本文件的 `subjectCourses(subjectText)`），科目页不存在或没别名时用课程页第一个 `# ` 标题去掉 `# `，再没有就用 slug。
   - 读不到的文件、坏文件照现有写法 `continue`，不抛。
   - 函数上方注释补一段：为什么要这一步（用户 11-11 定带读不设完结）、只装「本周期内有未完成新课次」的课。
2. **`checkCycle` 放过带读越界**：
   - `info.carried === true` 的课：**跳过**「上课日不是深度日」和「在周期之外」两条检查（它本来就不属于这个周期的模板）；「同一科目同一天两门课」照查（`info.subject` 为 null 时跳过这条）。
   - 模板里的辅助课（`info.role === "aux"`，非 carried）：课次日期**晚于** `cycle.end` 时不报「在周期之外」（早于 `cycle.start` 照报）。主项课不变。
   - 注意 `elasticCycles` 那条路径（约 459 行）只看 `role === "main"`，不受影响；确认一下并在报告里说。
3. `dayInfo`、`monthInfo`（或同名函数）不用改：它们从 `courses` 取课次，`roles` 里 carried 的课是 `"aux"`。`dayInfo` 的 `auxCourse` 仍只按模板辅助列取（不改）。

## 测试（`cycle.test.mjs`，照现有建临时库的写法，全部 mkdtemp）
4. 把第 689 行的 `test.todo` 换成真测试：C1 辅助科目 z 的课 d（不设 end，`days=mon,wed`），有两节顺延到 C2 的日期；C2 模板里没有 z。断言：C2 那天 `day --json` 的 `lessons` 里有 d 的课次、`roles.d === "aux"`、`names.d` 是科目页里的别名；`overview` 在 C2 的 `courses` 里有 d、`role === "aux"`。
5. 同一库：`check` 不报 d 的「在周期之外」「不是深度日」（C1、C2 都不报）。
6. d 在 C2 的课次都已完成（Learning Record 写 `完成：…`）时，C2 不再装 d。
7. 模板里的辅助课有一节晚于 C1 结束日：C1 的 `check` 不报它；主项课有一节越界时**照报**（回归）。
8. 路线外、有排期但所有新课次都在 C2 之前的课：C2 不装它。
9. 同一科目同一天：carried 课和 C2 模板里同科目的课撞同一天时，照报「同时排了」。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/cycle-plan/cycle.test.mjs 2>&1 | tail -6 && npm test 2>&1 | grep -E "^# (tests|pass|fail|todo)" && node skills/cycle-plan/cycle.mjs check /tmp/xg-e2e/vault/GJY 2>&1 | tail -2
```
（最后一条在真实库副本上跑 check，应仍是 OK。）

## 结束报告（中文）
改了哪些函数、哪几行；测试先失败的输出；验收命令完整输出；第 2 步 elasticCycles 的确认结果；拿不准的地方。
