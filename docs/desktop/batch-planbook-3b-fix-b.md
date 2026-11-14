# batch-planbook-3b-fix-b（DeepSeek 二次返修，约 10 分钟，先写测试）：周表格格子线与留白没生效

来源：用户 11-12 试用发现周计划本和设计稿差很多；Claude 查到根因（CDP 实测 `.bear-pb-cell` 计算样式 `border: 0px none; padding: 0px`）。设计稿：`/Users/gjy/pi-learning/design/animate/src/plan2.jsx` + `plan2.css`（`.p2-grid` 一段）。
约束：只改 `apps/desktop/src/renderer/skins/bear/skin.css` 和下面说的测试文件；不 commit / push；**自己做完，不要调用 `pi`、`devin` 或别的 agent**。

## 根因
`skin.css` 第 3468 行 `[data-skin="bear"] .bear-pb button { … border: none; padding: 0; … }` 的优先级是 (0,2,1)，高于第 3614 行 `[data-skin="bear"] .bear-pb-cell`（(0,2,0)）。周表格每个格子是 `<button class="bear-pb-cell">`，所以格子的 `padding`、`border-bottom`、`border-left` 全被清掉；`min-height` 等没被覆盖的照常生效。同样受影响的还可能有 `.bear-pb-btn`、日视图 / 月视图里写在 button 上的类。

## 改
1. **先写测试**（新文件 `apps/desktop/src/renderer/skins/bear/planbook-css.test.ts`）：读 `skin.css` 文本，断言：
   - 计划本的按钮重置规则用 `:where(button)`（即选择器为 `[data-skin="bear"] .bear-pb :where(button)`），不再出现 `[data-skin="bear"] .bear-pb button {`；
   - 重置规则出现在 `.bear-pb-cell {` 规则**之前**。
   先跑一次确认失败。
2. 把第 3468 行选择器改成 `[data-skin="bear"] .bear-pb :where(button)`（优先级降到 (0,2,0)，且位置在前，后面的 `.bear-pb-cell`、`.bear-pb-btn` 等能覆盖它）。规则内容不变。
3. 在 `skin.css` 里搜 `.bear-pb` 下其它写成 `.bear-pb xxx button`、`.bear-pb-… button` 形式、带 `border`/`padding`/`background` 的规则，逐条确认没有同样的覆盖问题；有就同样改成 `:where(button)`，并在报告里列出。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files" && npm run -s build 2>&1 | tail -1
```

## 结束报告（中文）
改了哪几行；先失败的测试输出；第 3 步查过的规则清单；验收输出。真机效果由 Claude 用 CDP 量计算样式验证。
