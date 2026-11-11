# batch-full-b2-schedule（DeepSeek，约 15 分钟）：course-schedule.mjs 端到端补测——只写测试、报告失败

全量测试 B2（计划 `docs/platform/FULL-TEST-1110.md`）。**只写测试，不改产品代码。**

## 硬约束
- 只新建 `skills/course/course-schedule.full.test.mjs`。不改 `course-schedule.mjs`、其他脚本、`SKILL.md`、`apps/**`、已有测试。不 commit/push、不加依赖。
- 全部在 `mkdtemp` 临时目录；写法参考 `skills/course/course-schedule.test.mjs`（可从 `./course-schedule.mjs` import 导出函数，CLI 用 `execFile`）。
- 库副本 `/tmp/xg-e2e/vault/GJY` 只读：要用它的课程页就先 `cp` 到临时目录再跑（课程页是 0444，复制后 `chmod u+w`）。
- 失败且你认为是产品 bug：改成 `test("…", { todo: "疑似 bug：<一句话>" }, …)`，保留断言，报告里列出。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

## 要测的情况（每条一个 test）
1. **连续多天没学**：周一三课（`--days mon,wed`，`--reviews anki`，有 `end=`），D1~D3 都没完成，`shift --today` 设在 D1 之后 10 天（跨两周、跨月底）→ D1 落在 today 当天或之后第一个上课日；之后各课保持顺序与上课日；超过 end 的进「留到下个周期」。
2. **today 是休息日**：`shift --today <周日>` → 第一节落在下一个上课日，不落在周日。
3. **跳着完成**：D1 没完成、D2 已完成（Learning Record 有「完成：D2」）→ shift 后 D2 的日期是否不动、D1 挪到今天？按实际行为断言并写进报告；若出现两节课同一天或已完成的课被挪，标 todo。
4. **复习挪到今天**：`reviews` 默认（spaced），D1 已完成、R1-D1 过期 → shift 把复习挪到 today、新课不动（已有类似测试，换成过期 5 天 + today 为休息日的组合）。
5. **plan 边界**：`--start` 是休息日；`--extra` 给的是休息日（应报错或忽略——按实际断言）；`--end` 早于 `--start` 报错；课次正好填满到 end（无 flex 行）；多一课 → 报错且含 suggestedEnd，用 suggestedEnd 再 plan 成功。
6. **elastic**：`--elastic` 的课 shift 很多天后不进「留到下个周期」，最后一节可以在原 end 之后。
7. **next**：`next --date` 在休息日、在最后一节之后、所有课都完成时 → 不报错，返回合理结果（按实际断言）。
8. **库副本冒烟**：把 `/tmp/xg-e2e/vault/GJY/wiki/courses/*.md` 复制到临时目录，对每页跑 `shift --today` 取 2026-11-11、2026-11-20、2026-12-10 三天（不带 `--write`，`--json`），断言：不抛错；新课次日期严格递增；没有课落在 rest 日；有 `end=` 的页新课次都 ≤ end；同一天没有两节新课；D 编号不重复。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-schedule.full.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1
```

## 结束报告（中文，必须输出）
新增测试数；每条的实际行为一句话；所有 todo 的复现命令与实际/期望；验收输出。
