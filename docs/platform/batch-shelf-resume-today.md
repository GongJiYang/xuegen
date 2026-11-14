# batch-shelf-resume-today（DeepSeek，约 15 分钟，先写测试）：恢复当天不再把下一段当成今天要读

## 现象（Claude 11-12 在副本上复现）
```sh
V=/tmp/xg-shelfchk   # 书房副本
node skills/reading/bookshelf.mjs pause  $V epp --today 2026-11-12
node skills/reading/bookshelf.mjs resume $V epp --today 2026-11-13   # 「恢复，明天接着读」
node skills/reading/bookshelf.mjs today  $V --today 2026-11-13
# → 计划内：…（0/81 段，下一段 Ch1 §1.1–1.4 pp.1–9，预计 2027-02-02 读完）
```
预计日期已经按明天起算（对），但 `today` 文字和总控「今天」卡片仍把这一段当成今天要读，卡片还给出「读完这段」按钮。周计划本的书房排期（`list --from/--to`）已正确，不用动。

## 要改（只改这几处）
1. `skills/reading/bookshelf.mjs` 的 `bookView`（约 406 行）：返回值加 `resumedToday: resumedToday(page.body, today)`（函数已有，约 507 行）。文件头 `bookView` 注释（约 399–405 行）补一行说明。
2. 同文件 `commandToday`（约 790 行）：`chunk` 存在且 `view.resumedToday` 时，`doing` 改成 `` `今天恢复，明天从 ${chunk.title} pp.${chunk.from}–${chunk.to} 接着读` ``。
3. `apps/desktop/src/shared/data-protocol.ts` 的 `ShelfBook`（`doneToday` 旁，约 97 行）加 `resumedToday: boolean;`（带一行 JSDoc）；接收端若有运行时校验（`grep -rn "doneToday" apps/desktop/src/main apps/desktop/src/shared`），照 `doneToday` 同样补上。所有 typecheck 报缺字段的夹具补 `resumedToday: false`（只补字段）。
4. `apps/desktop/src/renderer/core/board/control-card.ts` 的 `bookRow`（约 102 行）：在 `doneToday` 分支之后、`book.chunk === null` 判断之后，若 `book.resumedToday`，返回 `{ mark: "plan", text: prefix + card.shelfChunk(book.short, book.chunk), sub: card.shelfResumed, button: null, action: null, hint: null }`。
5. `apps/desktop/src/renderer/core/strings.ts`：`shelfDoneSub` 旁加 `shelfResumed: "今天恢复，明天接着读"`。

## 测试（先写，先跑确认失败）
- `skills/reading/bookshelf.test.mjs`：pause 11-12 → resume 11-13 → `today --today 2026-11-13 --json` 的 `planned.resumedToday === true`；文字输出含「今天恢复，明天从」；`--today 2026-11-14` 时 `resumedToday === false`、文字是普通「下一段」。
- `control-card.test.ts`：`resumedToday: true` 的书 → 该行 `button === null`、`sub === "今天恢复，明天接着读"`；`resumedToday: false` 照旧有「读完这段」。

## 不许做
- 不改 `nextReadDay`、`commandResume`、`done` 的行为；不改书房排期与 index 输出；不加依赖；不 commit / push；不跑 prettier 整文件；**自己做完，不要调用别的 agent**。
- 文案只进 `strings.ts`；`npm test` 末尾 `lint-wording` 0 处。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | grep -E "^# (pass|fail)|lint-wording"
cd apps/desktop && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests |Test Files"
```

## 结束报告（中文）
改了哪些文件；先失败的测试名与失败输出；验收输出最后几行；偏离之处。
