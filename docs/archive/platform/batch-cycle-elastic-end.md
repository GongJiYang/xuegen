# 任务单：周期「固定 7 周学时、不固定日期」——cycle.mjs 推算实际结束日（Devin，SWE-2）

## 硬约束（先看这里）
- 只改两个文件：`skills/cycle-plan/cycle.mjs`、`skills/cycle-plan/cycle.test.mjs`。其余文件（特别是 `course-schedule.mjs`、`SKILL.md`、`apps/desktop/**`）不动。
- 零依赖 Node（`node:` 内建模块）；不读写 `~/.xuegen/`、`~/xuegen-data/`、任何真实库；测试只用 `os.tmpdir()` 下的临时库。不 commit/push。

## 背景（用户 2026-11-10 定）
学习周期固定的是「7 周学时」，不是日期。哪天没学，`course_close shift` 会把这门课没学的课次顺延到它的下一个上课日（不压缩内容），于是主项课的最后一节可能落在周期页 `end` 之后。现在 `cycle.mjs` 只认周期页 frontmatter 的 `start`/`end`，顺延后最后几节课会被当成「不在周期内」或算进下个周期。

规则：
1. 周期页与 `route.md` 里写的日期是**计划日期**，不改。
2. **实际结束日** = max(计划结束日 + 前面周期累计的推迟天数, 本周期**主项课**（`role === "main"`）所有新课次 `kind === "new"` 中最晚的日期)。辅助课不影响结束日（用户定：辅助课没上完的进下个周期）。
3. **实际开始日** = 计划开始日 + 前面周期累计的推迟天数。累计推迟天数 = 上一个周期「实际结束日 − 计划结束日」的天数（链式累加）。
4. 周序号仍按日历：从实际开始日起每 7 天一周（`weekOf` 不变），推迟后会多出一个短的 W8。
5. `route.md` 里没有周期页的后续周期（C2…）和恢复周，统一按「它前面最后一个有周期页的周期的累计推迟天数」整体平移。

## 一、cycle.mjs

1. 新增导出纯函数（放在 `checkOverlap` 之后）：
   ```js
   /**
    * 把计划日期推成实际日期。cycles：按 start 排序的 parseCycle 结果；mainLastDates：Map<周期名, 该周期主项课最晚新课次日期 | null>。
    * 返回新数组（不改入参），每项多 plannedStart、plannedEnd、delayDays（本周期结束比计划晚几天，≥ 0），start / end 换成实际日期。
    */
   export function elasticCycles(cycles, mainLastDates)
   ```
   实现：`let carry = 0`；对每个 cycle：`start = addDays(plannedStart, carry)`，`end0 = addDays(plannedEnd, carry)`，`last = mainLastDates.get(cycle.cycle)`，`end = last && last > end0 ? last : end0`，`delayDays = daysBetween(plannedEnd, end)`，`carry = delayDays`。
2. 新增导出纯函数：
   ```js
   /** 路线表按周期推迟平移：有周期页的行用实际日期；其后的行（含恢复周）按前面最后一个有周期页的周期的 delayDays 平移。不改入参。 */
   export function shiftRoute(route, elastic)
   ```
   每行多 `plannedStart`、`plannedEnd`。`route` 为 null 时返回 null。
3. 新增 `export async function loadElasticCycles(vault)`：
   - `const planned = await loadCycles(vault);`
   - 逐个周期按顺序算：先用当前 `carry` 得到候选窗口 `{ ...cycle, start: addDays(cycle.start, carry), end: addDays(cycle.end, carry) }`，对这个窗口调 `loadCourses(vault, window)`，取其中 `role === "main"` 的课所有 `kind === "new"` 行的最晚日期写进 `mainLastDates`；然后用 `elasticCycles` 的同一算法推进 `carry`（可以逐个调用、也可以先收集再一次调用，结果必须与 `elasticCycles(planned, mainLastDates)` 完全一致）。
   - 返回 `elasticCycles(planned, mainLastDates)`。
4. `loadCourses(vault, cycle)` 不改签名、不改逻辑（它按传进来的 `start`/`end` 过滤，传实际窗口即可）。
5. `planInfo`：`cycleInfo` 加两个字段 `plannedEnd: cycle.plannedEnd ?? cycle.end`、`delayDays: cycle.delayDays ?? 0`；`weeks` 用实际 `start`/`end` 算（不改公式）；`next` 与 `routeInfo.cycles` 改用调用方传进来的已平移路线（见第 7 条），公式不变。
6. `checkCycle`：「共 N 天，应为 49 天」那条改用 `cycle.plannedStart ?? cycle.start` 与 `cycle.plannedEnd ?? cycle.end` 计算；「在周期之外」那条仍用实际 `start`/`end`（主项课被顺延到实际结束日之前就不再报）。
7. CLI `main()`：
   - `month`、`overview`、`day`、`week` 四个命令里的 `loadCycles(vault)` 全部换成 `loadElasticCycles(vault)`；`loadRoute(vault)` 的结果先过 `shiftRoute(route, cycles)` 再交给 `planInfo` / `monthInfo`。
   - `check`：周期页解析与 `checkOverlap` 照旧用计划日期；`route.md` 与周期页一致性比较照旧比计划日期；`checkCycle` 改为对 `loadElasticCycles` 的结果逐个调用（`loadCourses` 用实际窗口）。
   - `overview` 文本输出那行：`delayDays > 0` 时在「还剩 N 天」后加 `（比计划晚 N 天，计划结束 <plannedEnd>）`。
8. `usage()` 里补一句：周期页与 route.md 的日期是计划日期；day / week / month / overview 输出的是按主项课顺延推算的实际日期。

## 二、cycle.test.mjs（先写测试，再改代码）
新增（放进现有文件，沿用其临时库写法）：
1. `elasticCycles`：主项最晚日期在计划结束日之前或为 null → 日期不变、`delayDays` 0；晚 5 天 → 本周期 `end` 晚 5 天、下一周期 `start`/`end` 都晚 5 天；两个周期各晚 3、2 天 → 第二个周期 `start` 晚 3 天，`end` = max(计划结束+3, 它自己主项最晚日期)，`delayDays` 按第 1 条公式。
2. `shiftRoute`：有周期页的行换成实际日期，后面的行与恢复周平移；`plannedStart`/`plannedEnd` 保留原值；null 入参返回 null。
3. 临时库端到端：C1 周期页 11-06 ~ 12-24，主项课排期最后一节 12-29、辅助课最后一节 12-31：
   - `day --date 2026-12-29 --json` 的 `cycle` 为 `"C1"`、`week` 为 8；
   - `day --date 2026-12-31 --json`：在 C1 实际结束日（12-29）之后、C2 之前（C2 计划 12-25 起，平移 5 天后 12-30 起）→ `cycle` 为 C2 时它是 C2 的第 1 周第 2 天（按实际开始日 12-30 算）；如果临时库里没有 C2 周期页，就断言 `cycle` 为 null；
   - `overview --date 2026-12-20 --json` 的 `cycle.end` 为 `"2026-12-29"`、`cycle.plannedEnd` 为 `"2026-12-24"`、`cycle.delayDays` 为 5、`cycle.weeks` 为 8；
   - 只有辅助课晚（主项最后一节 12-23）→ 实际结束日仍是 12-24，`delayDays` 0；
   - `check` 对主项课 12-29 那节不再报「在周期之外」，49 天检查仍按计划日期通过。
4. 现有全部测试保持通过（不准为了通过改旧断言的期望值；确需改动的在报告里逐条说明理由）。

## 验收（贴出最后几行）
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/cycle-plan/cycle.test.mjs && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm test
```

## 结束报告
改了哪些函数（每个一句）；新增测试条数；偏离任务单之处及原因；未完成项。不提交。
