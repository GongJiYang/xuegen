# batch-full-fix3-undo-prompt（DeepSeek 返修，约 10 分钟，TDD）：「撤销这次收课」按钮让模型走旧的「抵消」

## 现象与根因（Claude 已查清）
- 现象：测试窗口里 CTM 收课后点「撤销这次收课」，模型没有调 `course_close` 的 `undo`，而是又开了一次收课暂存，把勾退回 `[ ]`、加撤销说明和截图，再提交——jj 里多了第二个「收课 ctm …」，改过的文件没有恢复到收课前。
- 根因：`apps/desktop/src/renderer/core/strings.ts` 第 190–191 行 `undoClosePrompt` 仍写「按 course 技能收课第 3 步「抵消」，把本次收课打的勾退回 [ ]…」；而 `skills/course/SKILL.md` 收课第 9 步（用户 11-10 定）是「用户随后点「撤销这次收课」时，用 `course_close` 的 `undo`」。按钮发的话和技能矛盾，模型照按钮的话做了。

## 改法（先写失败测试，再改）
只改 `apps/desktop/src/renderer/core/strings.ts` 与 `apps/desktop/src/renderer/core/chat/lesson-actions.test.ts`。不改 `SKILL.md`、别的文件。不 commit/push。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
1. 先在 `lesson-actions.test.ts` 加一条：撤销按钮的正文（`splitActionMarker(...).body`）包含 `course_close` 和 `undo`，且不含「抵消」「退回 [ ]」。跑一下确认失败。
2. 把 `undoClosePrompt` 改成（原样照抄）：
   `撤销这次收课：用 course_close 的 undo（这门课的 slug），把这次收课改过的已有文件恢复到收课前；不要另开暂存手工改勾。新建的概念页和卡片保留，列出来问我要不要删。undo 拒绝时照它给的原因告诉我。`
3. 全仓 `grep -rn "undoClosePrompt\|抵消" apps/desktop/src` 确认没有别的地方还引用旧说法（测试快照之类一并更新）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx vitest run src/renderer/core/chat 2>&1 | tail -4 && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests|Test Files"
```

## 结束报告（中文）
第 1 步失败输出、改动、验收输出。
