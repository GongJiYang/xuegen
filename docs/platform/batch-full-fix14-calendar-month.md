# batch-full-fix14-calendar-month（DeepSeek 返修，约 5 分钟，TDD）：calendar month 接受 2027-13

`skills/calendar/calendar.mjs` 的 `isMonth` 只测 `/^\d{4}-\d{2}$/`：`month <vault> 2027-13`（及 `2027-00`、`2027-99`）返回 `{"month":"2027-13","days":{}}`、退出 0，看起来像「这个月没安排」。

## 改法
只改 `skills/calendar/calendar.mjs` 与 `skills/calendar/calendar.full.test.mjs`（去掉那条 `{ todo }`）。不 commit/push。**自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
1. 去掉 B7 留的 todo，确认失败。
2. `isMonth` 另要求月份 01–12；非法时照现有日期报错的写法：`calendar: 月份格式非法：<值>（应为 YYYY-MM）`，退出 1。
3. 验收：`cd /Users/gjy/pi-learning/xuegen && node --test skills/calendar/*.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)'`
## 结束报告（中文）：失败输出、改动、验收输出。
