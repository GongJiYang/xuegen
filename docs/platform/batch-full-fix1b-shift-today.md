# batch-full-fix1b-shift-today（DeepSeek 返修，约 10 分钟）：改口——已完成的课不占日子，D1 就放今天

上一单 `batch-full-fix1-shift-collide.md` 让 `shiftSchedule` 跳过已完成新课占的日期。用户 11-11 定了**另一种**规则：**已完成的新课不占日子**。D1 没完成、D2 提前完成且排在今天时，shift 后 D1 就是今天；D2 那行（已完成）日期不动，表里两行同一天没关系（D2 显示为已完成，今日卡只出 D1）。

## 改法
只改 `skills/course/course-schedule.mjs`、`skills/course/course-schedule.test.mjs`、`skills/course/course-schedule.full.test.mjs`。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
1. `shiftSchedule`：撤掉上一单加的 `finishedDates` / `lastPlaced` 放置逻辑，恢复成上一单之前的写法（`git diff skills/course/course-schedule.mjs` 能看到上一单的改动，整段还原即可）。
2. 测试改成新规则：
   - `course-schedule.full.test.mjs` 第 3 条：D2（已完成）日期不变 = 11-11；D1 = 11-11（今天）；D3、D4 照统一后挪；断言「**未完成**的新课互不同天、日期严格递增」。测试名改成说明新规则。
   - 第 8 条库副本冒烟里「同一天没有两节新课」改成「同一天没有两节**未完成**的新课」。
   - `course-schedule.test.mjs` 上一单加的两条：回归对照那条保留（期望值不变）；「skips the days already taken…」那条改成新规则（D1 = 11-11，复习跟 D1 的新日期算），改名。
3. 跑验收，全部通过。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && git diff --stat skills/course/course-schedule.mjs && node --test skills/course/course-schedule.test.mjs skills/course/course-schedule.full.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```
期望 `course-schedule.mjs` 的 diff 为空（完全还原）、fail 0、todo 0。

## 结束报告（中文）
还原确认、改了哪些断言、验收输出。
