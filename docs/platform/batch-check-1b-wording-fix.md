# batch-check-1b-wording-fix（DeepSeek，约 10 分钟）：用词闸门剩 2 处 + 挂进 npm test

约束：只改下面列的文件；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。

1. `apps/desktop/src/renderer/gallery/Gallery.tsx` 约 340 行标题里「深度日」→「主攻日」。
2. `skills/reading/bookshelf.mjs` 约 1074 行用法文字「整本书通读的排期与进度」→「整本书自读的排期与进度」。
3. 确认 `node scripts/lint-wording.mjs` 输出 `lint-wording: 0 处`、退出码 0。
4. 根 `package.json` 的 `test` 脚本末尾加 ` && node scripts/lint-wording.mjs`（保持原有 node --test 部分不变）。
5. 跑：`cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -3 && cd apps/desktop && npm test 2>&1 | grep -E "Tests |Test Files"`。

结束报告（中文）：改了哪几行；验收输出。
