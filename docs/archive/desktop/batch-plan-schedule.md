# 批次 PL-1：按截止日期排满每一天 + 间隔复习 + 没学自动顺延 + 「明天」

先读：`AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`、`skills/course/SKILL.md`、`skills/course/PLAN-STANDARD.md`、`skills/calendar/SKILL.md`、`skills/calendar/calendar.mjs`（它已经读取课程「计划表」里带日期的行并显示在日历上）。

## 用户需求（已确认）
- 建课时问打算多久学完（截止日期），把内容按天排满到截止日期，每天的任务都能在日历里看到；能看到「明天」的计划。
- **读新内容按天顺序排**；**复习按间隔重复排**：每个学习日的内容在之后第 1、3、7、14 天各安排一次简短复习（落在休息日就顺延到下一个学习日；超过截止日期的复习照样排在截止日期之后，标注「课后复习」）。
- **日期由脚本计算，不由模型凭感觉定**（与 `reading-queue.mjs` 同一原则）。
- **某天没学，后面的安排整体往后顺延**（截止日期随之后移，并在课程页如实记录顺延了几天）。

## A. 排期脚本 `skills/course/course-schedule.mjs`（零依赖、可单独运行，写测试 `course-schedule.test.mjs`）
- `plan <course.md> --start YYYY-MM-DD --end YYYY-MM-DD --rest <周几列表，如 sun 或 sat,sun 或 none> --lessons <lessons.json> [--write]`
  - `lessons.json`：模型给出的有序课次列表 `[{ id: "D1", content, material, done_when }]`（只给内容，不给日期）。
  - 脚本把课次按顺序分配到 start..end 的学习日（跳过休息日）；课次多于学习日时报错并给出「至少需要 N 个学习日 / 建议截止日期」，不擅自压缩；课次少于学习日时把剩余学习日标为「机动 / 复习」。
  - 为每个课次生成复习行（D+1/3/7/14 规则同上），复习行 `id` 如 `R1-D3`，内容「复习：{课次内容简称}」，完成条件「不看笔记复述要点 / 重做一道检查题」。
  - 输出计划表 Markdown：`| 天 | 日期 | 类型 | 内容 | 材料 | 完成条件 |`，日期格式 `YYYY-MM-DD（周X）`，类型为「新课 / 复习 / 机动」。不带 `--write` 时打印到 stdout；带 `--write` 时**只替换**课程页 `## 计划表` 段内由本脚本生成的表格（用 `<!-- xuegen:schedule:start -->` / `<!-- xuegen:schedule:end -->` 标记包住），段内其他人工内容保留。
- `shift <course.md> --today YYYY-MM-DD [--write]`：找出日期早于 today、且未完成的行（判断未完成：该行 `id` 不在课程页 `## Learning Record` 已记录完成的课次里——完成记录格式在 SKILL.md 中约定，例如记录里写 `完成：D3`），把这些行及其后所有行按学习日整体后移，使第一条未完成行落在 today；输出顺延天数。复习行随其课次一起后移。
- `next <course.md> --date YYYY-MM-DD --json`：返回该日的计划行（供桌面「今天/明天」使用也可以直接复用 calendar 的聚合，二选一，在报告里说明选了哪种）。
- 所有日期计算用本地日期字符串，不依赖时区；纯函数部分导出并测试（分配、休息日、复习间隔、顺延、课次过多报错、标记段替换不破坏人工内容）。
- 确认 `calendar.mjs` 能读出新表格的日期行（`YYYY-MM-DD（周X）` 格式）；若它只认 `MM-DD`，扩展它并补测试。确认 `render-board.mjs` / 桌面课程解析不受新增「类型」列影响。

## B. `skills/course/SKILL.md` 与 `PLAN-STANDARD.md`
- 新建课程 / 改计划时：模型先列课次（lessons.json 写到临时文件），**再调用 `course-schedule.mjs plan` 生成日期**，不手写日期。
- 开课（用户「开始今天的…」）时：先运行 `shift --today <本机今天> --write`，有顺延就用一句话告诉用户「之前没学的 N 天已整体顺延，新的截止日期是 X」。
- 收课时：在 Learning Record 用约定格式记下完成的课次 id（含复习行）。
- 「完整计划」段说明改为：由脚本生成的逐日表格，仍不带复选框。
- `npm run lint:skills` 0 错误。

## C. 桌面
- 新课程表单（`skins/*/progress-panel.tsx` + `core/board/course-prompts.ts`）：新增「截止日期」（默认开始日期 + 4 周）与「休息日」（无 / 周日 / 周六日，默认周日）；`newCoursePrompt` 带上这两项，并要求「用 course-schedule.mjs 排出到截止日期的逐日计划」。更新测试。
- 「今天」窗口：在「今天计划」下方新增「明天」一栏，列出明天的计划行（来源与「今天计划」相同：日历聚合），没有时显示「明天没有安排」。bare 与 chicago 都实现；文案进 `core/strings.ts`。
- 课程展开区的「改计划」输入框占位文字改为提示可以说「截止日期改到 12 月 20 日」「周六也休息」之类。

## 验收（你必须自己跑，全部通过才算完成）
`apps/desktop`：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。仓库根：`npm test`、`npm run lint:skills`。`wc -l apps/desktop/src/renderer/App.tsx` ≤ 450。
另外用一个临时目录里的假课程文件，实际跑一遍 `plan`、`shift`、`next` 和 `calendar.mjs get`，把输出贴进报告。

## 禁止
不读写 `~/.xuegen/`，不碰 Obsidian 库（只用临时目录的假文件），不启动 Electron，不 git commit/push，不加依赖，不放宽 eslint、不加 `eslint-disable`。不改前面几批的行为。

## 结束时
输出：改了哪些文件、偏离规格之处及原因、脚本实际运行输出、六条命令结果（贴最后几行）、App.tsx 行数。

## 执行记录（2026-11-04）
因 DeepSeek 余额不足，本批由 Claude 直接完成。偏离：计划表不加「类型」列（复习行用「复习：」前缀、id 为 `R{n}-{课次}`），以保持 `course-parse.mjs` 的「日期后一格是内容」约定；「明天」复用日历聚合（月末最后一天看不到下月的明天，已在代码注释说明）。
