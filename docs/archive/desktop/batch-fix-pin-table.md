# batch-fix-pin-table（DeepSeek 返修）：盯板里带表格的题目显示错乱

用户 11-09 报：出的题目里有表格时，盯板（Bear 左侧 pin rail）的「当前题目」显示乱。

## 原因（Claude 已查明）

`apps/desktop/src/renderer/core/chat/pin-board.ts` 的 `questionText(body)` 把题目 callout 的所有行 `trim` 后用空格拼成一行，表格的 `| a | b |` / `|---|---|` 各行被挤成一串，Markdown 不再识别为表格。实例：`~/.xuegen/sessions/--Users-gjy-learning--/2026-11-08T23-56-47-700Z_*.jsonl`（只读看，别改）。

## 改法

1. `questionText(body)`：若去掉空行后有任何一行以 `|` 开头（表格），则**保留换行**：各行 `trimEnd()`，去掉首尾空行，用 `\n` 连接；否则保持现在的单行拼接。JSDoc 改成说明这两种情况。
2. `skins/bear/pin-rail.tsx`：题目项现在用 `Inline` 渲染；`markdownToHast` 已能渲染表格（与对话流同一管线），不用改组件，只确认带表格的题目渲染出 `<table>`。
3. `skins/bear/skin.css`（只改 `.bear-pin-*`）：加
   ```css
   [data-skin="bear"] .bear-pin-md table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-size: var(--fs-1); line-height: var(--lh-1); margin: var(--sp-1) 0; }
   [data-skin="bear"] .bear-pin-md th, [data-skin="bear"] .bear-pin-md td { border: 1px solid var(--gray-6); padding: var(--sp-1) var(--sp-2); white-space: nowrap; }
   ```
   只用已有变量，不写散值。
4. 测试：`core/chat/pin-board.test.ts` 加：带表格的题目保留换行且其余题目仍单行；`skins/bear/pin-rail.test.tsx` 加：带表格的题目渲染出 `table`。

## 硬约束

不读写 `~/.xuegen/`（上面那个文件只读）、不碰 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint。只改上面列的四个文件。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文）

改了什么、测试清单、验收输出、未完成项。
