# batch-full-fix11-state-parse（DeepSeek 返修，约 15 分钟，TDD）：B4 的 3 条 todo——verify 漏报无标记页、看板与 list 数任务不一致

## 现象与根因（B4 报告 + Claude 核实代码）
- T1：`skills/course/course-state.mjs` `verify`（约 180–193 行）用 `loadCourses` → `course-parse.mjs` `listCourses`（约 249–262 行，默认 `requireMarker: true`）先把**没有标记的页过滤掉**，于是第 192 行「缺少标记」永远报不出来；课程页标记被删时 verify 说 OK、看板悄悄少一门课。
- T2：`skills/course/render-board.mjs` 第 14 行自带 `TASK_RE`（接受 `*` 与缩进），`course-parse.mjs` 第 34 行 `isTask` 只认 `- [`。`* [ ]` 任务看板数、list/dashboard 不数。
- T3：`course-parse.mjs` 第 39–45 行 `sectionLines` 只认精确标题；看板用 `findSection`（精确，再前缀）。`## This Week（W1 · 测试周）` 看板数得到、list/dashboard 数不到、verify 还报缺段。

## 改法（把 B4 的 3 条 todo 去掉 `{ todo }` 当失败测试，再改到通过）
只改 `skills/course/course-parse.mjs`、`skills/course/course-state.mjs`、`skills/course/render-board.mjs`、`skills/course/course-state.full.test.mjs`（去 todo）、必要时 `course-parse.test.mjs`。不改 `SKILL.md`、别的文件。不 commit/push。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
1. 先把 `course-state.full.test.mjs` 里 3 条 `{ todo: … }` 去掉，跑一下确认 3 条失败。
2. T1：`verify` 读课程时用 `requireMarker: false`（只在 verify 里；`list`/`dashboard` 照旧只收带标记的），这样 `wiki/courses/*.md` 里没标记的页会报「缺少标记」。
3. T2：`course-parse.mjs` 导出唯一的 `isTask`：trim 后匹配 `/^[-*] \[[ xX]\]/`；`render-board.mjs` 删掉自己的 `TASK_RE` 判断任务的部分，改用这个 `isTask`（取勾选状态与文字的解析可以留在 render-board，但「是不是任务」只用共享函数）。
4. T3：`sectionLines` 先精确找，找不到再找「以 `## <名>` 开头、后面紧跟全角/半角括号或空白」的标题（与 `findSection` 的前缀规则一致，但不让 `## This Weekend` 误配 `This Week`）；`findSection` 同步用同一规则。
5. 原有全部测试照旧通过。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-state.full.test.mjs skills/course/course-state.test.mjs skills/course/course-parse.test.mjs skills/course/render-board.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo)' && npm test 2>&1 | grep -E '^# (pass|fail|todo)' && npm run lint:skills 2>&1 | tail -1 && node skills/course/course-state.mjs verify /tmp/xg-e2e/vault/GJY/wiki/courses
```
期望 fail 0、todo 0；最后一条对库副本 verify 的结果原样贴出（只读，不改副本）。

## 结束报告（中文）
第 1 步失败输出、改动、验收输出。
