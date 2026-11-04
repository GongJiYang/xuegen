# 渐进阅读 · 任务 1 修复 3：resume 行为

## 问题（`commandPauseOrResume`）

1. `resume` 没有按规格把 `due` 设为今天（规格：resume 恢复为 active 或 queued，`due` = 今天）。实测：`resume --today 2026-11-05` 后 `due` 仍是 2026-11-07。
2. `resume` 对 `status: done` 或非 `paused` 的条目不报错，会把已完成的条目静默改回 active。
3. pause/resume 分发时没有传入 `todayFrom(options)`，`--today` 对它们无效。
4. 内部参数仍叫 `wiki`，与已改名的 `<vault>` 含义不一致，容易误读。

## 要求

- `resume` 只接受 `status: paused` 的条目，否则报错「只有暂停的条目可以恢复」；成功时 `due` = 今天（支持 `--today`）。
- `pause` 只接受 `queued`/`active`；对 `paused` 报错「已暂停」，对 `done` 维持现有报错。
- 两者都在「Reading Log」追加 `- 日期: paused` / `- 日期: resumed`。
- 全文件把表示库根目录的参数/变量统一命名为 `vault`。
- 新增测试：resume 设置 due 为 `--today`；对 done、queued、active 执行 resume 报错；对 paused 再 pause 报错；Reading Log 追加记录。
- 运行 `npm test` 并贴出输出。

只改 `skills/reading/reading-queue.mjs` 与其测试文件。不 git commit，不碰 `apps/desktop/`。中文简短报告。
