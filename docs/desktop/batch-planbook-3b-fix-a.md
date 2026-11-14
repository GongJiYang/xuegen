# batch-planbook-3b-fix-a（DeepSeek 返修，约 20 分钟，能写测试的先写测试）：周计划本真机验收 9 处

来源：Claude 11-12 真机验收（`docs/desktop/PLANBOOK-AUDIT-3b.md`，截图 `/tmp/xg-e2e/audit-3b/`）。设计稿：`/Users/gjy/pi-learning/design/animate/src/plan2.jsx` + `plan2.css`。
约束：只改下面提到的文件及其测试；样式只用 Bear 变量、写在 `[data-skin="bear"]` 下；文案进 `strings.ts`；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。`npm test` 末尾 `lint-wording` 0 处。

1. **聊天栏内容溢出（严重）**：`.bear-pb-chat`（340px）里的 `.bear-column` 实测宽 757px（`max-width: none` 但被内容撑开），消息与输入框右半截被裁。改 `skin.css`：`.bear-pb-chat .bear-column { width: 100%; max-width: 100%; min-width: 0; padding: 0 var(--sp-3); }`，并保证其子元素（`.bear-thread-wrap`、`.bear-pane`、代码块、表格）`min-width: 0; max-width: 100%`，长代码块横向滚动而不是撑宽。验证：组件测试里断言不了布局的，在报告里写你用了什么规则。
2. **「今天」禁用样式**：`planbook.tsx` 顶栏「今天」按钮 `disabled` 时颜色 `--gray-11`、`cursor: default`、无 hover 底色（现在与可点时一模一样）。
3. **月视图格子（严重）**：现在每格塞整节课的内容（`离散 D3 · Ch2 §2.3：有效论证…`），格子被撑高。照设计稿 `MonthView`：每格只写 **课程短名 + 课次**（`离散 D3`、带读行 `C 语言 D1`），各一行、`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`；没有课次的日子写类型短标签：整合日「整合」、低强度日「低强度」，休息日空。格子固定最小高 72px（设计稿 `.p2-mc`），不随内容长高。数据来自 `PlanDay.items`：在 `planbook.ts` 给 `PlanItem` 加 `short: string`（`${names[course]} ${id}`；讲后读 / 自读给空串），月视图用 `short`。测试：`buildMonth` 的 `short`；组件测试断言月格只含短名。
4. **本周目标缺课名**：现在只显示「周核实 W1 · 11-13（周五整合日）」。`planbook.ts` 的 goals 加 `name`（课程短名），显示成 `CTM · 周核实 W1 · 11-13（周五整合日）`。测试同步。
5. **复盘日期错**：现在写「11-06 周五整合日时…」（本周第一天）。应为**本周结束后的那个整合日**：从 `week.end` 的次日起往后 7 天内第一个类型为「整合」的日子（C1 W1 → 11-13）；找不到就不写日期（`strings.planbook.reviewEmptyNoDate`：「整合日时由总控和你一起写」）。把这个日期算进 `PlanWeek`（`reviewDate: string | null`），测试覆盖 W1 与找不到两种。
6. **日视图重复标题**：看今天时（渲染 `todayCard`）不要再在卡片上方显示「11-11 周三 · 主攻日」那行（今日卡自带）；非今天保留。
7. **非今天清单缺类别**：只读清单每项前加 lane 名：`讲后读 · `、`带读 · `、`自读 · `（主项课不加），文案用 `strings.planbook` 里已有的行名。组件测试同步。
8. **图例**：`strings.planbook.legend` 去掉「→ 顺延了」那一段（没有这种记号）。
9. 文档：把 1–8 的结果写回 `docs/desktop/PLANBOOK-AUDIT-3b.md` 对应行的「实物」列（只填你改过的那几行，结果列留给 Claude）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files" && npm run -s build 2>&1 | tail -1
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -1
```

## 结束报告（中文）
每条改了哪几行；先失败的测试；验收输出。
