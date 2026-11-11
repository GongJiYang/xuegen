# 接着做（上次 503 中断）
任务单原文见 `docs/platform/batch-full-fix1b-shift-today.md`。**第 1 步已完成**（`course-schedule.mjs` 已完全还原，`git diff skills/course/course-schedule.mjs` 为空，不要再动它）。
现在只差第 2、3 步：两条测试仍按旧规则断言而失败——`course-schedule.full.test.mjs` 第 3 条、`course-schedule.test.mjs`「shift skips the days already taken by a lesson finished ahead of schedule」；第 8 条冒烟的「同一天没有两节新课」改成只算未完成的。照任务单改，跑任务单里的验收命令，报告。
**自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
