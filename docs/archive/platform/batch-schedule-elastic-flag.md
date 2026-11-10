# 任务单：主项课排期不把截止日写进标记（`--elastic`）（Devin，SWE-2）

## 硬约束
- 只改 6 个文件：`skills/course/course-schedule.mjs`、`skills/course/course-schedule.test.mjs`、`skills/course/course-close.mjs`、`skills/course/course-close.test.mjs`、`apps/desktop/src/agent/tools/course-plan-tool.ts`、`apps/desktop/src/agent/tools/course-plan-tool.test.ts`。`SKILL.md` 等文档由 Claude 改，不动。
- 不读写 `~/.xuegen/`、`~/xuegen-data/`、真实库；不启动 Electron；不放宽 lint；不 commit/push。

## 背景
用户 2026-11-10 定：主项课固定的是 7 周学时、不固定日期，哪天没学就整体往后顺延、不砍课（周期实际结束日由 `cycle.mjs` 按主项课推算，另一批在做）。现在 `course-schedule.mjs plan --end X` 会把 `end=X` 写进排期标记，之后的 `shift` 顺延不越过它、多出的课被移进「留到下个周期」——这对**辅助课**是对的（保持不变），对**主项课**不对。加一个开关：排课时照样用 `--end` 铺课（课次放不下照旧报错并给 suggestedEnd），但**不把 `end=` 写进标记**。

## 一、`skills/course/course-schedule.mjs`
1. `plan` 分支：`const table = renderTable(rows, rest, days, reviews, end);` 改为 `const table = renderTable(rows, rest, days, reviews, flags.elastic === true ? null : end);`。
2. 同分支 `summary` 加字段 `elastic: flags.elastic === true`。
3. 文件头第 9 行注释的 `end` 说明后补「（plan 加 --elastic 时不写 end，主项课用）」；`usage()` 的 plan 用法行加 `[--elastic]`，并加一行说明：`--elastic：照 --end 铺课，但不把 end 记进排期标记（主项课：以后顺延不受周期结束日限制）`。
4. 确认 `parseArgs` 把后面紧跟 `--write` 或位于末尾的 `--elastic` 解析成 `true`（现有解析规则如此；不是的话按现有风格补）。

## 二、`skills/course/course-close.mjs`
1. `schedule` 命令里组装 `args` 的循环之后、`args.push("--write")` 之前加：`if (flags.elastic === true) args.push("--elastic");`。
2. 第 11 行用法注释与 `usage()` 的 schedule 行加 `[--elastic]`。

## 三、`apps/desktop/src/agent/tools/course-plan-tool.ts`
1. `CoursePlanParams` 加 `elastic?: boolean | undefined;`（放在 `reviews` 后）。
2. `scheduleCall`：在 `for (const [flag, value] of flags)` 循环之后加 `if (params.elastic === true) args.push("--elastic");`（仍在 `"--json"` 之前）。
3. 工具参数 schema 在 `reviews` 后加：`elastic: Type.Optional(Type.Boolean({ description: "schedule 用：主项课传 true——照 end 铺课，但不把 end 记进排期标记（以后没学就整体顺延，不砍课）；辅助课不传" })),`。

## 三之二、`course_plan` 新动作 `shift`（总控手动顺延，用户 2026-11-10 要求「在总控里说一句顺延今日内容」）
`course_close`（课程会话专用）已有 `shift`；总控不能用 `course_close`（这是刻意的权限设计，不改）。给 `course_plan` 加同样的顺延，脚本复用 `course-close.mjs shift`（暂存 → 顺延 → 校验 → 提交，jj 记「顺延」，没有要顺延的什么都不写）。
1. `PlanAction` 加 `"shift"`（放在 `"board"` 前）；`CoursePlanParams` 加 `today?: string | undefined;`。
2. `coursePlanCalls` 的 switch 加：
   ```ts
   case "shift":
     return [shiftCall(params, vault, cwd)];
   ```
   新函数（放在 `scheduleCall` 后）：
   ```ts
   /** `shift`：总控替一门课顺延（同 course_close 的 shift）；slug、today 必填。 */
   function shiftCall(params: CoursePlanParams, vault: string, cwd: string): CoursePlanCall {
     if (params.slug === undefined) throw new Error("course_plan shift 缺少 slug：要顺延哪门课。");
     if (params.today === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(params.today)) {
       throw new Error("course_plan shift 缺少 today（YYYY-MM-DD）：这一天之前没学的新课顺延到它或之后的第一个上课日。");
     }
     const args = ["shift", vault, params.slug, "--workspace", cwd, "--today", params.today];
     if (params.end !== undefined) args.push("--end", params.end);
     return { script: CLOSE_SCRIPT, args: [...args, "--json"] };
   }
   ```
3. schema：`action` 的字面量联合里加 `Type.Literal("shift")`；action 的 description 末尾补「；shift 替一门课顺延（slug + today，today 填明天就是把今天没上的课挪走）」；参数加 `today: Type.Optional(Type.String({ description: "shift 用：YYYY-MM-DD，这一天之前没学的新课顺延到它或之后的第一个上课日" })),`；`end` 的 description 补「；shift 时只给辅助课：周期计划最后一天」。
4. 工具的总说明（`description` 里那句流程「用编辑工具改暂存目录里的…」）后面补一句：「临时不上课、要把某天的课往后挪：shift（不开暂存、一步提交）。」
5. `guard/roles.ts` 不改（`course_plan` 本来只给总控）；在 `roles.test.ts` 不必加用例，但 `course-plan-tool.test.ts` 要覆盖下面第 4 节的用例。

## 四、测试（先写，再改代码）
0. `course-plan-tool.test.ts`（shift）：`{action:"shift", slug:"ctm", today:"2026-11-11"}` → 一次调用，args 恰为 `["shift", <vault>, "ctm", "--workspace", <cwd>, "--today", "2026-11-11", "--json"]`；带 `end` 时 `--end` 在 `--json` 前；缺 slug / today 或 today 格式不对 → 抛中文错误；真脚本跑一次（沿用文件里已有的临时库 + 真 course-close.mjs 写法，若文件里有）：课程页 11-10 有一节未完成新课、days=tue,thu，`today:"2026-11-11"` → 那节移到 11-12，jj 有「顺延」提交（若现有测试没有真 jj 条件就只断言课程页内容）。
1. `course-schedule.test.mjs`：`plan --end 2026-12-24 --elastic --write` 后标记行里**没有** `end=`、课次日期与不加 `--elastic` 时完全相同；不加 `--elastic` 时标记仍有 `end=2026-12-24`（锁住旧行为）；带 `--elastic` 排出的课页再 `shift --today <晚于第一节的日期> --write` 时最后一节可以落在 12-24 之后、不出现「留到下个周期」。
2. `course-close.test.mjs`：计划暂存上 `schedule … --end … --elastic` 后暂存课程页标记无 `end=`；不带时有。
3. `course-plan-tool.test.ts`：`elastic: true` 时生成的 args 含 `--elastic` 且在 `--json` 之前；不传时不含。

## 验收（贴最后几行）
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-schedule.test.mjs skills/course/course-close.test.mjs && npm test && npm run lint:skills
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
```

## 结束报告
每个文件改了什么；新增测试条数；偏离之处；未完成项。不提交。
