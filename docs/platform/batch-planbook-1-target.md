# batch-planbook-1-target（Devin，约 1 小时）：书房目标日期 + 三处「留到下个周期」文字

背景：`docs/platform/PLANBOOK-1111.md`（用户 2026-11-11 定）。书房的书可以设一个**可选的目标日期**，只用来和预计读完日期对比，**不改排期、不加页数**。辅助课不再有周期完结日，界面文字里「排不下的留到下个周期」要去掉。

约束：只改下面列出的文件；不加依赖；不 commit / push；不改 `SKILL.md`（Claude 改）；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。先写测试，看它失败，再改代码。

## 一、`skills/reading/bookshelf.mjs`（+ `bookshelf.test.mjs`）

1. `FIELD_ORDER` 在 `"position"` 之后加 `"target"`。`target` 不进 `STRING_FIELDS`（写成裸日期 `target: 2027-01-15`，同 `started`）。
2. 新函数 `bookTarget(page)`：读 `field(page, "target")`，是合法日期（用现有 `isDate`）返回该字符串，否则返回 `null`（空、缺失、乱写都算 null）。
3. `bookView(page, today)` 返回值加两项（放在 `late` 之后）：
   - `target: bookTarget(page)`
   - `targetLate`: `target === null ? null : Math.max(0, daysBetween(target, end))`（预计读完比目标晚几天；不晚为 0）。
   文件头 `bookView` 上方注释补两行说明这两项。
4. `commandList` 的 item 加 `target` 与 `targetLate`。注意排队书的 `end` 用的是 `queue.get(slug) ?? view.end`：`targetLate` 要按**这个 end** 重算（`target === null ? null : Math.max(0, daysBetween(target, end))`），不能直接用 `view.targetLate`。文本输出在 `预计 ${item.end} 读完` 后面，有目标时追加 `｜目标 ${item.target}${item.targetLate > 0 ? `，晚 ${item.targetLate} 天` : ""}`。
5. `commandToday` 的文本行：有目标时在 `预计 ${view.end} 读完` 后追加 `，目标 ${view.target}${view.targetLate > 0 ? `，晚 ${view.targetLate} 天` : ""}`。JSON 自然带上第 3 步的两项。
6. `indexLine(view, status, end, shelfName)`：未读完且有目标时，在 `· 预计 ${end} 读完` 后追加 ` · 目标 ${view.target}`，`targetLate > 0` 时再加 `（晚 N 天）`——N 按传入的 `end` 重算（同第 4 步）。读完的书不显示目标。
7. 新命令 `target`：`node bookshelf.mjs target <vault> <slug> (--date YYYY-MM-DD | --clear) [--json]`。
   - 用现有 `loadBook`；`--date` 不是合法日期 → `fail("目标日期要写成 YYYY-MM-DD")`；两个都没给或都给了 → `fail("target 要 --date <日期> 或 --clear 二选一")`。
   - `--date`：`setField(page, "target", <日期>)`；`--clear`：把 `target` 设成空（看 `setField` 怎么处理空值；最终 frontmatter 里要么没有这一行、要么是 `target:` 空——选一种，测试里写死）。
   - 用现有的原子写（`writeAtomic`）写回书页，再像其他写命令一样刷新 `index.md`（照 `done` 命令的做法）。
   - 输出：文本 `target: <slug> 目标 <日期>`（清除时 `target: <slug> 不设目标`）；`--json` 输出 `{ slug, target, end, targetLate }`。
   - 文件头用法注释加这一行；`main` 的命令分发加 `else if (command === "target")`；`--help` / 用法文字同步。
8. 测试（`bookshelf.test.mjs`，照现有测试的建库写法，全部 mkdtemp）至少：
   - 没有 target：`bookView` 的 `target`、`targetLate` 都是 null；`today` 文本不含「目标」。
   - target 早于预计：`targetLate` = 正确天数；`list`、`today`、`index.md` 三处文字都含「目标 … 晚 N 天」。
   - target 晚于预计：`targetLate` 为 0，文字只有「目标 …」不含「晚」。
   - 排队书：`list` 的 `targetLate` 按 `queueEnds` 的 end 算，不是按今天算（构造一本在读 + 一本排队）。
   - frontmatter 里 `target: 乱写` → null，不报错。
   - `target --date` 写入后再读出一致，`position`、`started` 等字段原样；`--clear` 后为 null；坏日期、两个参数都给 → 退出码非 0、中文错误。
   - 有 target 的书 `done` 一段后，target 不丢。

## 二、界面文字（只改字符串，不改结构）

9. `apps/desktop/src/renderer/core/strings.ts` 约 430 行 `placementHint`：
   - aux：`"带读只做了解，不出检查题；不设完结，没上的课往后顺延。"`
   - main：`"按教材章节切课次；按 7 周学时排，日期跟实际走。"`
   同一处 `placementTag` 里的 `"辅助"` 改成 `"带读"`。
10. `apps/desktop/src/renderer/core/board/course-prompts.ts` 约 89 行（`if (request.cycle)` 分支）：
   - `const role = placement.role === "aux" ? "辅助" : "主项";` 的 `"辅助"` 不改（给模型看的，技能里仍叫辅助课）。
   - 那一长句改成：aux 时 `…，${length}，从今天之后第一个上课日开始排，不设完结（不加 --end 截断、不写「留到下个周期」）；原书…`；main 时 `…，${length}，从今天之后第一个上课日排到 ${placement.end}（${placement.cycle} 结束），主项加 elastic；原书…`。其余句子不动。
11. `apps/desktop/src/agent/tools/course-close-tool.ts` 约 156 行 `end` 的 description 改成：`"shift 用：只给排期标记里已有 end= 的旧课；新排的主项课与带读（辅助）课都不设完结，不填"`。
12. 这三处如有对应测试（`grep -rn "留到下个周期\|placementHint\|placementTag" apps/desktop/src`）一并更新期望值。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/reading/bookshelf.test.mjs 2>&1 | tail -5 && npm test 2>&1 | grep -E "^# (tests|pass|fail)" && node scripts/lint-skills.mjs | tail -3
cd apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests|Test Files"
```

## 结束报告（中文）
每步改了哪些行；第 8 步测试先失败的输出；验收命令完整输出；拿不准的地方单独列出。
