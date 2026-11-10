# batch-shift-cycle-end（DeepSeek 返修，小单约 15 分钟）：顺延不越过周期结束日，挤出去的课次进「留到下个周期」

用户 11-09 定。现象：C 语言（辅助，`days=mon,wed`）11-09 的 D1 没上，`shift --today 2026-11-10` 后最后一节 D14 落到 2026-12-28，超出学习周期 C1（2026-11-06 至 2026-12-24）。`skills/course/SKILL.md`「学习周期里的课」规定：排不下时周期内排满，剩下的列进计划表「留到下个周期」一节，不压缩、不加天。**先写测试再改。**

## 硬约束
- 只改 `skills/course/course-schedule.mjs`、`skills/course/course-schedule.test.mjs`。不碰真实库（测试用 `mkdtemp`；可只读复制 `~/学根/库/wiki/courses/c-language.md` 当样本）。不 commit/push、不加依赖。
- 另顺手修：`skills/wiki-save/rename-vault.test.mjs` 跑完在系统临时目录留下 `rename-vault-test-*-map.json`，在 `after`/`finally` 里删掉（只改这个测试文件的清理部分）。

## 要做的
1. 排期标记支持 `end=YYYY-MM-DD`：`plan --end` 写入标记时带上它；`readSchedule` 解析出 `end`（没有就是 null）。
2. `shift` 新增可选 `--end <date>`；有效结束日 = `--end` ?? 标记里的 `end` ?? 无。
3. 有结束日时：顺延后日期 > 结束日的**新课**行不留在表里，而是追加到「### 留到下个周期」一节（该节在计划表段里，标记之外；没有就在标记之前新建）。追加格式一行一个：`- <id>：<内容>（<材料>）`；该节原来只有一行「- 无：…」时把那行替换掉（原文保留在新行后面括号里不需要，直接替换）。复习行（`R…`）超出的照现有规则处理（标「课后复习」），不挪。
4. 输出提示加一句：「N 节排不进本周期，已移到「留到下个周期」：D14」。`--write` 之前不改文件（照旧）。
5. 测试：样本页 shift 后 D1→11-11、D14 移到「留到下个周期」且原「- 无：…」被替换；`--end` 优先于标记；没有结束日时行为与现在完全一致（旧测试不改）；重复 shift 幂等（已移出的不再出现在表里、不重复追加）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
T=$(mktemp -d) && cp ~/学根/库/wiki/courses/c-language.md $T/ && chmod u+w $T/c-language.md && node skills/course/course-schedule.mjs shift $T/c-language.md --today 2026-11-10 --end 2026-12-24
```
## 结束报告（中文，必须输出）
改了什么、新增测试数、样本输出。
