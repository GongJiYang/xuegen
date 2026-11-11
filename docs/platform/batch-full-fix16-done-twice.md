# batch-full-fix16-done-twice（DeepSeek 返修，约 10 分钟，TDD）：书房同一天 done 两次要拦住

## 用户 11-11 定
同一本书同一天第二次 `done` → 报错「今天这段已记过」，不前进、不写文件。

## 现状
`skills/reading/bookshelf.mjs` 的 `commandDone`（约 716 行）不看今天是否已记过，同一天连跑两次会前进 2 段。
`bookView(page, today).doneToday`（约 397 行）已经能判断「今天的读书记录里已有第 position 段」。
`skills/reading/reading.full.test.mjs` 约 216 行有一条 `{ todo: … }` 用例记录了现状。

## 改法（先写失败测试，再改）
只改 `skills/reading/bookshelf.mjs`、`skills/reading/reading.full.test.mjs`。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**
1. 把那条 todo 用例转正：去掉 `{ todo: … }`，标题改成「done 同一天连点两次：第二次报『今天这段已记过』，不前进」。断言改为：
   - 用 4 段的书（`## 分段` 写 `1. Ch1 pp.1–40`，确认按现有分段规则能切成 ≥ 3 段；不够就加页数），第一次 `done` → position 1、finished false。
   - 第二次 `done`（同一 `--today`）→ 退出码非 0，stderr 含「今天这段已记过」（用文件里已有的「跑脚本不抛错」辅助函数，没有就照 `calendar.full.test.mjs` 第 42 行那种写一个）。
   - 第二次之后书页文件内容与第一次之后**逐字相同**（先读一次存起来再比）。
   - 第二天（`--today` +1 天）再 `done` → position 2，正常。
   先跑一次确认这条失败。
2. `commandDone` 里，在 `const nextPosition = …` 之前：`if (bookView(page, today).doneToday) fail(\`${slug} 今天这段已记过（第 ${position} 段），明天再记下一段\`);`。上方加一行注释：用户 11-11 定同一天只记一段，防止连点两次前进两段。
3. 文件头用法注释里 `done` 那行后面补「（同一天只能记一段）」。
4. 现有测试全部照旧通过。

## 验收命令（在 xuegen/ 里）
```sh
node --test skills/reading/ 2>&1 | grep -E "^# (tests|pass|fail|todo)"
```
## 结束报告（中文）：第 1 步失败输出、改动、验收输出。
