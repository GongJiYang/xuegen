# batch-planbook-1-fix-d（DeepSeek，约 15 分钟，先写测试）：今天已收课的课仍显示「● 开课 →」

现象（Claude 11-11 真机，测试窗口）：离散 D3 当天已收课（课程页 Learning Record 有「完成：D3」，总进度面板显示 3/15、按钮「回到这节课 →」），但总控今日卡和右侧「今天」面板仍是「● 离散 D3 … 开课 →」。
根因：`skills/cycle-plan/cycle.mjs` 的 `dayInfo` 输出的 `lessons` 只有 `{ course, id, content }`，不带完成状态；`apps/desktop/src/renderer/core/board/control-card.ts`（约 178–197 行）和右侧今天面板对所有当天课次都画成待上课。

约束：只改下面列出的文件和它们的测试；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。

## 改法
1. `cycle.mjs` `dayInfo`：`lessons` 每项加 `done: info.done.has(row.id)`（`overdue` 不变，它本来就只含没完成的）。`cycle.test.mjs` 加一条：某课 Learning Record 写了「完成：D3」，那天 `day --json` 的 lessons 里 D3 `done === true`，别的课次 `false`。
2. `apps/desktop/src/shared/data-protocol.ts` 的 `CycleLesson` 加 `done?: boolean`（可选，兼容旧数据）。
3. `control-card.ts`：当天主项课次 `done === true` 时，行 `mark: "done"`，按钮用总进度面板里「回到这节课 →」那条已有文案（在 `strings.ts` 里找，没有就加 `card.backToLesson: "回到这节课 →"`），`action` 不变（仍是 study 该课）。带读课次同理。`done` 不为 true 的保持现状。
4. 右侧今天面板（`renderer/core/board/cycle-today.ts` 与 `skins/bear/cycle-today.tsx` 或 `today-panel.tsx`，按实际找）：今天主攻课已完成时，按钮同样换成「回到这节课 →」，前面记号显示完成（照该组件里已有的完成样式；没有就用 ✓）。
5. 测试：`control-card.test.ts` 加「done 的主项课 → mark done + 回到这节课」「未 done → 原样」两条；今天面板有测试文件就加一条，没有就在报告里说。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && node --test skills/cycle-plan/cycle.test.mjs 2>&1 | grep -E "^# (pass|fail)" && npm test 2>&1 | grep -E "^# (tests|pass|fail)"
cd apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
改了哪些行；先失败的测试输出；验收输出。
