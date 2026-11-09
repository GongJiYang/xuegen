# batch-shelf-2a-review（DeepSeek）：审核 + 补测试 + 修三处日期

Devin 按 `docs/desktop/batch-shelf-2a.md` 写完了基础代码（未提交）。你负责：A 审核（问题直接修）、B 修日期（下方给定公式，照写）、C 补测试。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`、`docs/desktop/batch-shelf-1.md`、`docs/desktop/batch-shelf-2a.md`（规格）、`skills/reading/bookshelf.test.mjs`（测试写法照它）。
- 测试只用临时目录；不读写 `~/.xuegen/`、不碰真实 Obsidian 库、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。
- 只改：`skills/reading/bookshelf.mjs`、`skills/reading/bookshelf.test.mjs`、`skills/course/course-state.mjs` 及其测试、`apps/desktop/src/shared/data-protocol.ts` 及其测试、`apps/desktop/src/main/data/handler.ts` 及 `handler*.test.ts`、`apps/desktop/src/main/data/README.md`。工作区里其它未提交改动不是你的，别动。

## A. 审核（逐节对照 `batch-shelf-2a.md`，问题直接修）

重点：
1. `appendToSection` 新节插在 `## 读书记录` 之前，顺序 `## 核心页已读`、`## 摘录`、`## 读书记录`；反复运行不累积空行。
2. `parsePageList` / `formatPageList` / `parseCoreRead` / `parseExtracts` 与规格的正则、边界一致；`card` 按 `parseExtracts` 的序号找行，**不会改错行**（中间夹着格式不对的行时也对）。
3. `lecture` 不改 `position`/`status`；`extract` 把换行折成空格、校验 1–99999 与 ≤ 500 字；`card` 已做过的进 `skipped`。
4. `course-state.mjs after-read` 的 `book`/`course`/`pages`；`handler.ts` 有 `book` 时走 `lecture`、不再写阅读页，没有时照旧。
5. 协议校验：`shelf.extract`、`shelf.card` 的合法/非法样例。

## B. 修三处日期（shelf-1 审核留下的，公式已定，照写）

在 `bookshelf.mjs` 加：
```js
// 下一段该读的那天：今天已经记过「第 position 段」就是明天，否则今天；不早于 started。
function nextReadDay(page, today) {
  const started = bookStarted(page) || today;
  const position = bookPosition(page);
  const readToday = position > 0 && recordDate(page.body, position) === today;
  const base = readToday ? addDays(today, 1) : today;
  return base > started ? base : started;
}
```
`recordDate(body, n)`：`## 读书记录` 里**最后一条**匹配 `^- (YYYY-MM-DD): 第 n 段 ` 的日期，没有为 null（讲后读那种记录不算）。

1. **`bookView` 的 `end`**：未读完时改为 `addDays(nextReadDay(page, today), total - position - 1)`；读完时不变。`plannedEnd`、`late` 公式不变。
2. **`planRows(page, today)`**：块 `index ≤ position` 的日期 = `recordDate(body, index) ?? addDays(started, index - 1)`；`index > position` 的日期 = `addDays(nextReadDay(page, today), index - position - 1)`。
3. **`plan --write`**：`started` 为空时先 `setField(page, "started", today)` 再生成表并写回。
4. **`done`**：记完一段、未读完时，用新的 `planRows(page, today)` 重写排期表（`withPlan`）再写回。
5. `startNextPlanned` 不用改（`started` = 明天，`nextReadDay` 自然取明天）。

完成后这些例子必须成立（写成测试）：
- `started 11-09`、共 4 段、`position 0`、today `11-09` → `end 11-12`、`late 0`。
- 同上，today `11-10`（昨天没读）→ `end 11-13`、`late 1`；`plan` 表第 1 段日期 `11-10`。
- `started 11-09`，11-09 `done` 后（`position 1`）、today 仍 `11-09` → `end 11-12`、`late 0`；排期表第 1 段 `11-09`、第 2 段 `11-10`。
- 读完一本自动开下一本（`started` 明天）→ 下一本 `end == plannedEnd`、`late 0`。
- `started: ""` 的书 `plan --write` 后 frontmatter `started` 等于 `--today`。

## C. 补测试

1. `skills/reading/bookshelf.test.mjs` 追加：四个纯函数（正常、边界、坏输入）；`bookView.coreOverlap`（有交集、无交集、读完为 null）；`lecture`（记录行、核心页行、无 `--pages`、非法 `course`/`pages`/`label`、不改 position）；`extract`（换行折叠、空文本/超长/页码 0 报错）；`card`（标记、重复进 skipped、越界报错、夹坏行时序号仍正确）；`list` 带 `extracts`/`coreRead`；B 的五个例子。
2. `skills/course/` 的 after-read 测试：输出含 `book`（有 `[[书房/epp]]` 链接时）、`course`、`pages`（用规格里的例句）；无链接、无「核心页已定」时为 null。
3. `apps/desktop`：`data-protocol.test.ts` 补 `shelf.extract`/`shelf.card` 合法与非法样例；`handler.shelf.test.ts` 补：`shelf.extract`、`shelf.card` 端到端；`course.afterRead` 在课程页有 `[[书房/t]]` 时写进书页（读书记录 + 核心页已读），且**不**写 `wiki/reading/`。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -3
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6
cd /Users/gjy/pi-learning/xuegen && git status --short
```

## 结束报告（中文）

1. 审核：每节结论、问题、修改。
2. B 的五个例子各自的实际输出。
3. 新增测试清单（每条一句）。
4. 验收输出。
5. 未完成项 / 需要 Claude 决定的事。
