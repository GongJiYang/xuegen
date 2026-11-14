# batch-planbook-1-check-a（DeepSeek，约 15 分钟，只写测试）：带读（辅助课）不设完结

背景：`docs/platform/PLANBOOK-1111.md`。用户 2026-11-11 定：辅助课（对用户叫「带读」）和主项课一样**不设完结**——排期一律 `--elastic`，`shift` 不加 `--end`，没上的课一直往后顺延，不再进「留到下个周期」。技能文字已改；脚本没改（Claude 估计脚本本来就支持）。这一单**只写测试来验证**，不改任何非测试文件。

约束：只改 `skills/course/course-schedule.test.mjs` 与 `skills/cycle-plan/cycle.test.mjs`；全部用 mkdtemp，不碰 `~/xuegen-data`；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。照文件里现有测试的写法（第 474、558 行附近有 end / elastic 的例子）。

## 要加的测试
1. `course-schedule.test.mjs`：辅助课的写法——`plan --days mon,wed --reviews anki --elastic --start <周一> --end <7 周后>`，6 个课次：排期标记里**没有** `end=`；之后用 `shift --today <比最后一节还晚 10 天> --write`：
   - 6 节全部还在表里（没有课被移出），日期都在 today 之后、都落在周一或周三；
   - 文件里**没有**「### 留到下个周期」这一节；输出 JSON 的 `dropped` 为 `[]`、`end` 为 null。
2. 同文件：课次多于到 `--end` 的上课日时，`plan` 退出码非 0、错误里有「建议截止日期 YYYY-MM-DD」；用这个日期作 `--end` 再加 `--elastic` 重跑成功，标记里没有 `end=`。
3. 同文件（回归）：标记里**手写了** `end=` 的旧课，`shift` 仍然把越过它的新课移进「留到下个周期」（第 474 行那条已覆盖就只在报告里说一声，不重复写）。
4. `cycle.test.mjs`：周期实际结束日（`elasticCycles` / `overview` 的 `cycle.end`）**只看主项课**——给一个周期配一门主项课（最后一节在周期内）和一门辅助课（最后一节在周期结束后 20 天），实际结束日不被辅助课拉长。
5. `cycle.test.mjs`：辅助课课次落在**下一个周期**、而下一个周期的周模板里没有这个科目时，`dayInfo`（或 `day --json`）那一天的 `lessons` 里**有没有**这节课？**照实写**：如果没有，就写成 `test.todo("带读跨周期：下一周期模板里没有该科目时，day 看不到它的课次")` 并在报告里说明；如果有，写成正常测试。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-schedule.test.mjs skills/cycle-plan/cycle.test.mjs 2>&1 | tail -8 && npm test 2>&1 | grep -E "^# (tests|pass|fail|todo)"
```

## 结束报告（中文）
每条测试的名字和结果；**失败的照实留着、不要为了变绿去改期望或改脚本**，在报告里写清失败输出和你认为的原因；第 5 条是哪种情况。
