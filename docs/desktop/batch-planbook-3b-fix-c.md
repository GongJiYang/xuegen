# batch-planbook-3b-fix-c（DeepSeek 二次返修，约 15 分钟，先写测试）：周表格文字与记号对齐设计稿

来源：用户 11-12 试用，Claude 并排截图对比（设计稿 `/tmp/plan2-shots/1.png`，真窗口 `/tmp/xg-e2e/now-week.png`）。设计稿：`/Users/gjy/pi-learning/design/animate/src/plan2.jsx` 的 `WEEK`、`WeekView`、`Window`。
约束：只改下面提到的文件及其测试；文案只进 `strings.ts`（`strings.planbook`）；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。`npm test` 末尾 `lint-wording` 0 处。fix-b 已经在改 `skin.css` 的按钮重置，本单不碰那一条。

1. **周格子缺读法开头**：设计稿格子写「讲后读 · Epp pp.…」「带读 · 数据结构 §1.1–1.2」「自读 · Epp §1.1–1.4 pp.1–9」；现在周视图只写后半截。周视图格子（`skins/bear/planbook.tsx` 渲染周格子处）对 `after` / `guide` / `self` 三种 lane 在文字前加 `strings.planbook` 里已有的行名 + ` · `（fix-a 第 7 条给日视图非今天清单加过，复用同一个函数或文案），主项课不加。组件测试：周视图三种 lane 的格子文字以行名开头。
2. **今天一列全是 ●**：`core/board/planbook.ts` 的 `markOf` 让今天所有项都是 `now`，周视图今天一列整列加粗。设计稿只有**今天的主项课**是 ●（加粗），讲后读 / 带读 / 自读 / Anki 是 ○。改成：今天、未完成、lane = `main` → `now`；今天其它 lane → `plan`。先写 `planbook.test.ts` 的失败测试（今天有主项 + 带读 + 自读：只主项是 now）。查一遍其它用到 `mark === "now"` 的地方（日视图非今天清单、月视图）不受影响或照设计稿。
3. **今天的 Anki 格**：设计稿今天一格是「○ 今天 42 张」+ 右侧「打开 →」按钮；现在是「○ Anki · 今日 42 张」、没有按钮。改成设计稿的文字（新加 `strings.planbook.ankiToday(n)`），按钮复用今日卡 Anki 行「打开 →」的同一个回调（看 `ControlCard` 怎么拿到的，原样从 props 传进 `Planbook`；契约 `PlanbookProps` 加 `onOpenAnki(): void`，bare / chicago 跟着补最小实现）。其它日子保持灰字「Anki」。
4. **顶栏标题**：总控会话的标题设计稿是「总控 · C1 · 计划本」；现在是「总控 · C1」。只在计划本显示时（`planbook` 非 null）在标题后加 ` · ` + `strings.planbook.titleSuffix`（「计划本」）。课程会话标题不变。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files" && npm run -s build 2>&1 | tail -1
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -1
```

## 结束报告（中文）
每条改了哪几行；先失败的测试；验收输出。
