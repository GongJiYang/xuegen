# F1 续做

上一轮 F1 因 Command Code 余额不足中途退出，没有最终报告。已写出的文件（不要推倒重来，在此基础上补完）：
`skills/course/course-parse.mjs`(+test)、`course-state.mjs`、`render-board.mjs`；`skills/calendar/`；`skills/wiki-save/flashcards.mjs`(+test)；`skills/teach/SKILL.md`；`apps/desktop/src/main/data/`（handler、anki、skills、vault、scripts 及测试）；`src/shared/data-protocol.ts`(+test)、`protocol.ts`；`src/preload/index.ts`；`src/agent/index.ts`、`session.ts`、`smoke.ts`；`src/main/index.ts`。

## 任务

1. 对照 `docs/desktop/batch-f1.md` **逐条**自查，列出「已完成 / 部分完成 / 未做」清单，然后补完所有未完成项（重点核对：`course-state.mjs list --json` 字段、`calendar.mjs month|get|write`、`flashcards.mjs stats|add`、DATA_CHANNEL 全部 13 个动作与守卫、AnkiConnect 只读白名单测试、`skills.fetch` 只允许 https 并进入 pending、agent `list-commands`/`commands` 与 `disabledSkills`、`desktop.json` 的 `courseStyles`/`sessionStyle`/`disabledSkills` 守卫与默认值、`core/client.ts` 方法）。
2. 修既有测试 bug：`skills/reading/reading-queue.test.mjs` 的 stats 测试中 `pause` 没传 `--today`，结果随真实日期变化。给该调用补 `--today`，并检查同文件其他调用是否有同类问题。
3. 按 `batch-f1.md` 的验收节完整执行并报告（含库只读副本上的实际 JSON）。

不读写真实 `~/.xuegen`（除只读 `wiki.json`）；不写真实用户库；不 git commit；中文逐项报告。
