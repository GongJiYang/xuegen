# batch-full-fix10-b1-fixture（DeepSeek，约 5 分钟）：B1 情况 8 依赖库副本的具体日期

`skills/cycle-plan/cycle.full.test.mjs` 情况 8（约 378–418 行）读 `/tmp/xg-e2e/vault/GJY`（会变的测试副本），却写死「2026-12-25 cycle 为 null」。测试窗口里顺延过一次离散课后，C1 的实际结束日变成 12-28，这条就红了。另外副本不存在的机器上这条会直接报错。

## 改法（只改这个测试文件）
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。** 不 commit/push。
1. 情况 8 加 `{ skip: existsSync(VAULT_COPY) ? false : "<VAULT_COPY> 不存在（需要有库副本的机器）" }`（写法照 `skills/course/course-schedule.full.test.mjs` 第 372 行）。
2. 删掉写死 `2026-12-25` 的两行，改成：取 `loadElasticCycles(VAULT_COPY)` 里 C1 的 `end`，断言 `addDays(end, 1)` 那天——若没有别的周期覆盖它——`dayInfo` 的 cycle 为 null；有别的周期覆盖时断言是那个周期。`first`（11-06 为 C1）那条保留。
3. 跑一次：`cd /Users/gjy/pi-learning/xuegen && node --test skills/cycle-plan/cycle.full.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)'`，期望 fail 0。
## 结束报告（中文）：改动与输出。
