# batch-full-b1-cycle（DeepSeek，约 15 分钟）：cycle.mjs 端到端补测——只写测试、报告失败

全量测试 B1（计划见 `docs/platform/FULL-TEST-1110.md`）。**只写测试，不改产品代码。**

## 硬约束
- 只新建 `skills/cycle-plan/cycle.full.test.mjs`。不改 `cycle.mjs`、`course-schedule.mjs`、`SKILL.md`、`apps/**`、已有测试。不 commit/push、不加依赖。
- 全部在 `mkdtemp` 临时目录里造库；fixture 写法照抄 `skills/cycle-plan/cycle.test.mjs` 开头（`CYCLE`、`CYCLE_AUX`、`ROUTE`、`writeSubjects`、`courseText`、`planSchedule`），复制进新文件即可，不要从旧测试文件 import。
- 只读 `/tmp/xg-e2e/vault/GJY`（库副本），不碰 `~/xuegen-data`。
- 一个测试如果失败、并且你认为是产品 bug（不是测试写错）：把它改成 `test("…", { todo: "疑似 bug：<一句话>" }, …)`，保留断言，在报告里列出。这样 `npm test` 仍是绿的。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

## 要测的情况（每条一个 test，走 CLI：`node cycle.mjs <cmd> <vault> … --json`）
1. **周期首日 / 末日**：C1 2026-11-06（周五）`day` → week 1、type 按模板；2026-12-24 `day` → week 7；`week --date 2026-12-24` 列 7 天且含 12-24。
2. **推迟后的 W8**：主项课最后一节新课排到 12-29（照 cycle.test.mjs 最后一个测试造 aLate）→ `week --date 2026-12-28` 的 week = 8，7 天里 12-29 有 a 的课；`month 2026-12` 里 12-25~12-29 算 C1 的天，12-30 起属 C2（route.md 里 C2 平移后的起点）。
3. **周期之间 / 路线之后**：C1 不推迟时 `day --date 2026-12-25`（C2 没有周期页）→ cycle 为 null 或指向 C2——按实际行为断言并写进报告；`day --date 2028-01-01`（路线之外）不报错、cycle null；`overview --date 2028-01-01` 不崩溃。
4. **没有 route.md**：删掉 route.md → `day`、`week`、`overview`、`check` 都不崩溃；overview 的 route 为 null 或空，cycle 照常。
5. **只有辅助课晚**：辅助课 d 最后一节排到 12-31，主项准时 → overview `cycle.end` 仍是 12-24、`delayDays` 0、`weeks` 7；`check` 报 d 在周期之外。
6. **主项课提前完成**：主项最后一节新课在 12-10 → overview `cycle.end`、`delayDays`、`weeks` 是什么？（设计：周期固定 7 周学时，提前完成不应让周期变短到 < 计划结束日——如果实际缩短了，标 todo 疑似 bug。）
7. **推迟两个周期**：造 C1、C2 两个周期页（C2 照 C1 改日期 2026-12-25 ~ 2027-02-11），C1 主项晚 5 天、C2 主项再晚 3 天 → C2 overview 的 start = 12-30、end = 计划结束 + 8 天、route.md 里 C3 起点平移 8 天、路线 end 平移 8 天。
8. **库副本冒烟**：对 `/tmp/xg-e2e/vault/GJY` 从 2026-11-01 到 2027-03-31 每一天跑 `day --json` 和 `overview --json`（可用 import 函数代替 CLI 提速：`loadElasticCycles` 等，看 cycle.mjs 导出），断言：不抛错；有 cycle 时 week ≥ 1 且日期在 cycle.start ~ cycle.end 之间；同一天 day 的 cycle 与 overview 的 cycle 一致。再跑一次 `check --json`，把 problems 原样写进报告（不断言）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/cycle-plan/cycle.full.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```

## 结束报告（中文，必须输出）
新增测试数；每条情况的实际行为一句话；所有 todo（疑似 bug）的复现命令与实际/期望输出；第 8 条库副本 check 的 problems；验收输出。
