# batch-bear-trim-1110（Devin）：Bear 去掉「复制 Markdown」和「（太久了可以点输入框的停止）」

用户 11-10 直接要求：「复制 Markdown 用不上，直接去掉」；「『太久了可以点输入框的停止』完全没有必要写」。**只做删除，不加任何新东西。** 只改 Bear（bare / chicago 只保证编译，它们的复制按钮不动）。

## 硬约束
- 只改：`src/renderer/skins/bear/slots.tsx`、`src/renderer/skins/bear/skin.css`、`src/renderer/core/strings.ts`，以及因此失败的测试（只改断言，不删测试用例本身的其他检查）。别碰 `src/agent/**`、`skills/**`。
- 不 commit/push、不加依赖、不放宽 eslint。只用已有 CSS 变量。

## 步骤
1. `bear/slots.tsx` 助手消息（约第 271–274 行）：删掉复制按钮整个 `<button … onClick={onCopy}>…</button>`。`.bear-answer-foot` 里只剩出错时的「重试」按钮：改成 `{showsError(message) && (<div className="bear-answer-foot"><button …重试…></div>)}`——**没有错误时不渲染这个 div**（免得留一块空白）。
2. 同组件不再用到的 props（`onCopy`、`copied`）：只在 Bear 组件的解构里删掉；**接口类型 `AssistantMessageProps`（skins/contract.ts）不改**（bare/chicago 还在用）。若 eslint 报未使用变量，就在解构里不取它们。
3. `bear/slots.tsx` 的 `ActivityLine`（约第 300–303 行）：删掉 `{activity.long ? strings.chat.activityLong : ""}` 这一行；`is-long` 类名保留（它只改颜色，计时仍显示）。
4. `core/strings.ts`：删掉 `activityLong` 这一项（全仓库只有 Bear 用它；删后 `npm run typecheck` 必须过）。`copy` / `copied` / `copyTitle` **保留**（bare、chicago 在用）。
5. `bear/skin.css`：第 1851 行注释里「and only the answer's last part keeps 复制 Markdown」改成「and only the answer's last part keeps its foot (重试)」；第 1870 行那条隐藏非末段 foot 的规则保留。`.bear-answer-foot` 的样式保留。
6. `grep -rn "复制 Markdown\|activityLong" src/renderer/skins/bear src/renderer/core` 只允许剩下 strings.ts 里的 `copy: "复制 Markdown"` 一处。

## 验收命令（报告里贴输出）
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/renderer 2>&1 | tail -4 && npm run build 2>&1 | tail -2 && git diff --stat
```
## 结束报告（中文，必须输出）
每步做了没有、改了哪些测试断言、验收输出。
