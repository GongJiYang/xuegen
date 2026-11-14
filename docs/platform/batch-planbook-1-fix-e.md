# batch-planbook-1-fix-e（DeepSeek，约 15 分钟，先写测试）：今日卡与总进度的几处文案

依据：Claude 11-11 真机过界面；叫法见 `docs/desktop/SKIN-LEDGER.md` 第三节（11-11 更新）。只改显示，不改数据格式。

约束：只改下面点名的文件及其测试；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。每条先改 / 加测试看它失败，再改代码。

## 1. 讲后读那一行（`skills/calendar/calendar.mjs` 约 107 行）
现在：`讲后读 §1.1–1.4 核心页（离散数学（Epp, 5th ed））· 11-10 该读`——有内部词「核心页」，括号套括号。
- `title` 改成 `` `讲后读 · ${范围} · ${course.title}` ``，其中「范围」= `match[1].trim()` 去掉「核心页」三个字后再 trim（`§1.1–1.4 核心页` → `§1.1–1.4`；`§2.4 pp.56–63` 原样）。`slug`、`date` 不变。
- **先查**：`grep -rn "讲后读" apps/desktop/src --include=*.ts | grep -v test` 看有没有代码按 `title` 的旧格式解析（例如 `afterReadEntry` 取 label）。有的话同步改并在报告里说明；label 若用于写课程页 / 书页，**写入的 label 保持原来的值**（只改显示）。
- `apps/desktop/src/renderer/core/strings.ts` `afterReadDue`：`` ` · ${date.slice(5)} 该读` `` → `` ` · 原定 ${date.slice(5)}` ``。
- `skills/calendar/calendar.test.mjs`（或对应测试）与桌面测试里依赖旧文字的期望同步。

## 2. 书房两行（`strings.ts` 约 279–292 行）
- `shelfPlanned: "读书 · "` → `"自读 · "`；`shelfFree: "自由读 · "` → `"自读（计划外）· "`。
- 计划外没有书时那一行（`shelfFreeEmpty` / `shelfFreeEmptySub`）**不再显示**：在 `renderer/core/board/control-card.ts` 的 `shelfRows`（或生成该行的地方）里，计划外为空就不推这一行。依据用户 11-11 说的「是否加入排期由我来决定」：书房加不加书由用户决定，不在每日卡上提示（Claude 据此推定，汇报时请用户确认）。对应测试改为断言没有这一行。

## 3. 今日卡 Anki 行带今日张数（`control-card.ts` 约 245 行）
现在只有 `Anki`；右侧今天面板已经显示「74 张待复习」（`cycle-today.ts` 的 `ankiDueCount`）。
- 今日卡的输入里如果已有 Anki 状态就直接用；没有就从调用方（`use-control-card.ts`）把同一份 `AnkiStatus` 传进来（照右侧面板拿数据的方式）。
- 文本：Anki 在运行 → `` `Anki · 今日 ${n} 张` ``；没运行或还没读到 → `Anki`（不提示「未打开」，不催）。
- 测试：有张数 / 没运行 两条。

## 4. 总进度「带读」两行（`skins/bear/progress-panel.tsx` 带读那一节，数据在 `renderer/core/board/plan-view.ts` 或 `progress-groups.ts`）
现在：`C · C 语言　0 / 14 节`、`数据结构 · 数据结构　0 / 14 节`——科目短名和课名重复。
- 科目短名与课程名相同、或课程名已包含科目短名时，只显示课程名（`数据结构`、`C 语言`）；不同时保持「科目 · 课程」。
- 行尾在「x / y 节」后加 `strings.plan.courseEnd(<最后一节日期 MM-DD>, "aux")`（即「预计 12-28 学完」）；数据里没有日期就不加。
- 测试：纯函数层加两条（同名去重、带预计日期）。

## 5. 右侧今天面板的带读行也要显示完成（fix-d 漏的一处）
fix-d 让 `CycleLesson` 带了 `done`，今日卡主项、带读行和右侧面板的**主攻**行都改成完成态了，但右侧面板（`skins/bear/today-panel.tsx` / `cycle-today.tsx`）的**带读**行没改。照主攻行的做法：`done === true` → ✓ + 「回到这节课 →」。加一条测试。

## 这几件事还在哪些地方显示（新流程要求，逐处核对后在报告里打勾）
- 课次完成：今日卡（control-card）、右侧今天面板（主攻行、带读行）、总进度（plan-view / progress-panel）、日历当天详情（calendar-panel）。日历当天详情如果也把已完成的课画成待上课，一并改并说明。
- Anki 张数：今日卡、右侧今天面板。
- 讲后读行文字：今日卡、日历当天详情（如有）。
- 书房行文字：今日卡、阅读面板（reading / shelf 相关组件）。
- 带读名字与预计日期：总进度带读一节、日历格子、右侧今天面板。
对每一处写「已一致 / 已改 / 不涉及（原因）」。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | grep -E "^# (tests|pass|fail)"
cd apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
每条改了哪些行；第 1 条查到的解析依赖；先失败的测试输出；验收输出。
