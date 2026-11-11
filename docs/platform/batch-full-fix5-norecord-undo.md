# batch-full-fix5-norecord-undo（DeepSeek 返修，约 10 分钟，TDD）：「不记录，直接结束」后出现「撤销这次收课」

## 现象与根因（Claude 已查清）
- 现象：课程会话里点「收课 ▾ → 不记录，直接结束」，学根回答后（没写任何文件，已核实），输入框旁按钮变成「撤销这次收课 · 制卡」。这时点撤销会去撤**上一次真正的收课**。
- 根因：`apps/desktop/src/renderer/core/chat/lesson-actions.ts` 第 76 行「不记录」用的也是 `"close"` 标记；第 40–44 行只要最后一条用户消息的标记是 `close` 且学根答过，就判定「刚收过课」，换成撤销按钮。

## 改法（先写失败测试，再改）
只改 `apps/desktop/src/renderer/core/chat/action-marker.ts`、`lesson-actions.ts`、`apps/desktop/src/renderer/core/strings.ts`、`lesson-actions.test.ts`（及 action-marker 的测试，如有）。不 commit/push。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
1. 先在 `lesson-actions.test.ts` 加：最后一条用户消息是「不记录」那个选项的 text、学根已回答 → 按钮**不是**撤销，而是平常的「总结 · 制卡 · 收课」三个。跑一下确认失败。原有「收课 / 收课，不写概念页」之后出撤销的测试照旧通过。
2. `ACTION_KINDS` 加一个 `"close-skip"`；`strings.actions` 加 `"close-skip": "不记录，结束"`（折叠标签用，照 `close: "收课"` 那一组的写法）；`lesson-actions.ts` 第 76 行改用 `"close-skip"`。
3. `grep -rn '"close"' apps/desktop/src` 确认别处（`run-command.ts` 的 /收课 等）不受影响；typecheck 会提示 `strings.actions` 缺键的地方一并补。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx vitest run src/renderer/core/chat 2>&1 | tail -3 && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests|Test Files"
```

## 结束报告（中文）
第 1 步失败输出、改动、验收输出。

## 附带一条（上一单 fix4 的边界，`skills/course/course-state.mjs` 的 `stripTailNote`）
现在按「最后一个 `）` 之后的第一个 `——`」截。旧备注里自己带括号时失效：
`- [ ] 讲后读 X · 2026-11-10 读（完成条件：读完）——开课时问过（11-11），未读` → 最后一个 `）` 在备注里，什么都没删。
改成：从左往右扫，记全角/半角括号深度（`（(` +1、`）)` −1），**第一个出现在深度 0 的 `——`** 起到行尾删掉；没有就不删。先在 `skills/course/course-state.test.mjs` 加上面这条（期望结果 `- [x] 讲后读 X · 2026-11-10 读（完成条件：读完）（用户自报，未检查，<date>）`）确认失败，再改；已有 12 条照旧通过。另跑：
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/course/course-state.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
