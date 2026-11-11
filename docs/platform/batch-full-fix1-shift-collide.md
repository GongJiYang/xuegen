# batch-full-fix1-shift-collide（DeepSeek 返修，约 15 分钟，TDD）：顺延后两节新课撞到同一天

## 现象与根因（Claude 已复现、已查清）
- 现象：D1 没完成、D2 已完成（提前学了），`shift --today 2026-11-11` 后 D1 和 D2 都是 11-11——同一天两节新课。复现命令见 `skills/course/course-schedule.full.test.mjs` 第 3 条（现为 `todo`）。
- 根因：`skills/course/course-schedule.mjs` 的 `shiftSchedule`（约 387–422 行）把 `row.date >= first` 的**未完成**新课一律后挪 `shiftedDays` 个上课日，**已完成**的新课留在原日期，没有检查挪过去的日期是否已被已完成的新课占着。

## 改法（先写失败测试，再改代码）
1. 先把 `course-schedule.full.test.mjs` 第 3 条的 `{ todo: … }` 去掉，断言改为：D2（已完成）日期不变；D1 不与 D2 同一天，落在 today 起第一个**没有被已完成新课占用**的上课日；之后 D3、D4 顺序不变、日期严格递增、互不同天。跑一下确认它**失败**。
2. 再在 `course-schedule.test.mjs` 加一条单元测试直接测 `shiftSchedule`：同样场景 + 一个对照场景（没有提前完成的课时，结果与改前完全一样——用改前的函数输出写死期望值）。
3. 改 `shiftSchedule`：被挪的未完成新课按原顺序依次放置，每节取 `max(原日期后挪 shiftedDays 个上课日, 上一节放置日期之后的下一个上课日)`，并跳过已完成新课占用的日期（用 `addStudyDays(…, 1, off)` 往后找）。复习行照旧跟着所属新课的新日期算。`dropped`（越过 end）仍按最终日期判断。没有已完成新课挡路时结果必须与现在完全一致。
4. 不改别的函数的对外行为；不改 `SKILL.md`、`apps/**`。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-schedule.test.mjs skills/course/course-schedule.full.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```
期望 fail 0、todo 0。

## 结束报告（中文）
第 1 步失败测试的输出（证明 bug 存在）、改了哪几行、验收输出。
