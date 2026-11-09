# batch-shelf-2b-review（DeepSeek）：审核 + 补测试（今日卡书房行）

Devin 按 `docs/desktop/batch-shelf-2b.md` 写完了基础代码（未提交）。你负责 A 审核（问题直接修）与 B 补测试。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/desktop/BEAR-VISUAL-PLAN.md`、`docs/desktop/batch-shelf-2b.md`（规格）、`core/board/control-card.test.ts` 与 `core/board/use-control-card.test.tsx`（测试写法照它们）。
- 不读写 `~/.xuegen/`、不碰真实 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`/`@ts-ignore`。
- 只改本批相关文件：`skills/reading/bookshelf.mjs`（及测试）、`shared/data-protocol.ts`、`renderer/core/board/{control-card,use-control-card,use-shelf,use-reading}.ts(x)` 及其测试、`renderer/skins/{bear,bare,chicago}/control-card.tsx`、`renderer/skins/bear/skin.css`（只限 `.bear-cc-*`）、`renderer/core/strings.ts`（只限 `control.card`）、`renderer/gallery/*`、`renderer/core/board/README.md`。工作区其它未提交改动不是你的，别动。`App.tsx` 不许再加行（≤ 450）。

## A. 审核（逐节对照规格）

重点：
1. `bookView` 的 `doneToday`/`doneChunk`：讲后读记录（「讲后读 … 已读」）不能让 `doneToday` 变 true；`position 0` 时为 false。
2. `controlCard` 书房行：插入位置（讲后读之后、阅读队列之前）；休息日也出；`mark` warn/plan/done；`sub` 拼接顺序（第 n 天 → 晚了 → 讲后读重叠）；读完的书不出行；`planned` 有、`free` 无时出「自由读 · 还没有书」，`planned` 为 null 时不出。
3. 撤销窗口：`afterRead` 与 `shelf` 共用一个 `pending`；窗口内再点另一行时先提交旧的；`undoShelf` 不写；倒计时到才调 `shelf.done`；失败显示 `shelfDoneFailed`。
4. 摘几句：页码校验（`11`、`p.11`、`p 11` 通过；`0`、`100000`、`11a`、空串不通过）、空原句报错、保存成功关表单且 `counts` +1、失败显示 `extractFailed`、保存中按钮禁用。
5. Bear：`.bear-cc-sub` 在 done 行不被划线；新样式只用变量、选择器以 `[data-skin="bear"]` 开头；`Escape` 取消、原句框 `⌘Enter` 保存。
6. bare/chicago 能用（sub、表单都在），无样式。

## B. 补测试

1. `skills/reading/bookshelf.test.mjs`：`doneToday`/`doneChunk`（当天 done 后 true 且 `doneChunk` 是刚读的块；第二天 false；只有讲后读记录时 false；读完最后一段当天 `doneToday` true、`chunk` null）。
2. `core/board/control-card.test.ts`：§A2 每条一个用例；`withPendingShelf`（命中/不命中/null）；`withExtractCount`（0 不改、>0 追加、非 extract 行不改）；`parsePageInput`（§A4 的通过与不通过样例）。
3. `core/board/use-control-card.test.tsx`：用假 `shelf`（`done`/`extract` 用 `vi.fn`）与假时钟（`vi.useFakeTimers`），覆盖 §A3 与 §A4：点「读完这段」→ 行变「撤销 · 10」、10 秒前不调 `done`、到点调一次；撤销后不调；`done` 返回 false 时 `error` 是 `shelfDoneFailed`；`extract` 打开表单、页码非法与空原句的报错、成功后表单关、`sub` 含「摘了 1 句」、失败报 `extractFailed`。
4. `skins/contract.test.tsx`（或现有的皮肤渲染测试）：三个皮肤在 `extract` 非 null 时都渲染出页码框、原句框、两个按钮；`row.sub` 文本出现在行里。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
wc -l /Users/gjy/pi-learning/xuegen/apps/desktop/src/renderer/App.tsx && cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文）

1. 审核：每节结论、问题、修改。
2. 新增测试清单（每条一句）。
3. 验收输出。
4. 未完成项 / 需要 Claude 决定的事。
