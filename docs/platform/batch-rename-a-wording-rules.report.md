# batch-rename-a-wording-rules 报告

## 做了什么

### 1. 先写的测试
`scripts/lint-wording.test.mjs` 新增一条用例「改名三词：临时仓库里讲后读 / 带读 / 主项课被报出，allow 里的文件不报」：

- 在 `os.tmpdir()` 下造临时仓库，写 `apps/desktop/src/renderer/x.ts`，四行字符串字面量分别是「课后读 …」「讲后读 …」「带读 …」「主项课 …」。
- 另写 `apps/desktop/src/renderer/core/allowed.ts`（数据格式行，进了 allow）。
- 规则文件也写在临时目录（`banned` 三条 + `allow` 一条），用 `node lint-wording.mjs --root <tmp> --rules <tmp>/rules.json` 跑。
- 断言：第 2/3/4 行各报一处且 `say` 是新词，第 1 行不报，`allowed.ts` 不报，收尾行 `lint-wording: 3 处`，退出码 1。

### 2. 词表（`scripts/wording-rules.json`）
- 改 `say`：`辅助` → 「导读课」；`核心页` → 「课后读 · pp.… · 日期」。
- 新增 banned：`讲后读` → 「课后读」、`带读` → 「导读课」、`主项课` → 「主课」（顺序紧跟「核心页」，与 SKIN-LEDGER 词表一致）。

### 3. 跑 lint 后逐处处理（共 48 处）
**改成新名字（真给用户看的旧说法，3 处）**

| 文件 | 位置 | 改法 |
|---|---|---|
| `skills/course/course-schedule.mjs:480` | `usage()` 里 `--elastic` 的说明 | 「主项课：以后顺延…」→「主课：以后顺延…」 |
| `skills/cycle-plan/cycle.mjs:639` | `usage()` 里日期口径的说明 | 「按主项课顺延推算」→「按主课顺延推算」 |
| `apps/desktop/src/renderer/gallery/planbook-samples.ts:148` | 画廊样例 `tomorrow` 行 | 「+ 带读 数据结构」→「+ 导读课 数据结构」（与 `strings.cycle.tomorrow` 一致） |

（`cycle.mjs:287` 的同类说法在注释里，lint 不扫，也没动。）

**加 allow（13 处文件 · 词），全部写进 `scripts/wording-rules.json`**

| 文件 | 词 | why |
|---|---|---|
| `apps/desktop/src/renderer/core/board/consistency-fixture.ts` | 讲后读 | 日历样例数据：课程页行标题与 `#讲后读-` 标记原样，界面经 `afterReadTitle` 显示「课后读 · …」 |
| `apps/desktop/src/renderer/core/board/control-card.ts` | 讲后读 | 数据格式：解析日历标题前缀「讲后读 · 」与 `#讲后读-N` 标记 |
| `apps/desktop/src/renderer/core/board/control-prompts.ts` | 带读 | 发给模型的指令：按 course 技能建带读课（数据上是 course 的带读课） |
| `apps/desktop/src/renderer/core/board/control-prompts.ts` | 讲后读 | 发给模型的指令：读法名按技能里的说法，技能词下一张单子统一改 |
| `apps/desktop/src/renderer/core/board/control-prompts.ts` | 主项课 | 同上：指令里转述技能对「主项课」的说法 |
| `apps/desktop/src/renderer/core/board/course-prompts.ts` | 带读 | 建课提示词：原书方式「带读」是课程页 `Key Facts` 的数据值 |
| `apps/desktop/src/renderer/core/board/course-prompts.ts` | 讲后读 | 同上：主项课的「讲后读（错开）」是课程页原书方式的数据值 |
| `apps/desktop/src/renderer/core/board/planbook.ts` | 讲后读 | 数据格式：`#讲后读-` 标记与日历标题前缀「讲后读 · 」 |
| `apps/desktop/src/renderer/core/strings.ts` | 带读 | 新课表单的读法选项「带读」= 原书方式 `guided`，不是导读课（`readingOptions.guided`） |
| `apps/desktop/src/renderer/gallery/panel-samples.ts` | 讲后读 | 画廊样例数据：日历 `readingDue` 标题原样，界面显示「课后读 · …」 |
| `skills/calendar/calendar.mjs` | 讲后读 | 数据格式：课程页 `Today` 行「- [ ] 讲后读 …」与日历标题「讲后读 · …」 |
| `skills/course/course-state.mjs` | 讲后读 | 数据格式：课程页行前缀「- [ ] 讲后读 」，报错里点名的也是这一行 |
| `skills/reading/bookshelf.mjs` | 讲后读 | 数据格式：书页节名「## 讲后读已读」与读书记录行「讲后读 … 已读」 |
| `skills/course/SKILL.md` | 讲后读 / 带读 | SKILL.md 正文下一张单子改，词表先放行（**两条**） |
| `skills/cycle-plan/SKILL.md` | 讲后读 / 带读 | 同上（**两条**） |

合计新增 17 条 allow（`scripts/wording-rules.json` 现在 banned 17 条、allow 28 条，无重复 file+word）。

### 4. 台账（`docs/desktop/SKIN-LEDGER.md`）
- G7：「书房、带读、主项」→「书房、导读课、主课」。
- 第三节词表 63–69 行：
  - 读书三种读法：用词改「课后读（跟主课）、导读课（…原来的辅助课）、自读」，「不要用」补 `讲后读、带读、主项课`。
  - 「讲后读一行」→「课后读一行」，用词「课后读 · pp.… · 日期」。
  - 「带读 / 书房的结束」→「导读课 / 书房的结束」，「结课（只给主课用）」。
  - 「读完这段」的备注「那是讲后读的」→「那是课后读的」。
- 历史变更记录（`- 2026-11-xx …` 行）**没动**。

## 没动的
- `skills/*/SKILL.md` 与 `references/*.md` 的正文（只有 allow 白名单放行，正文没改）——下一张单子做。所以 SKILL.md 里`讲后读`、`带读`、`辅助课` 这些词现在还在，`npm test` 靠 allow 过。
- 数据格式、函数名、字段名（`#讲后读-`、`aux` / `main`、`## 讲后读已读`、`readingOptions.guided` 等）。
- `apps/desktop` 的非测试代码只改了 `gallery/planbook-samples.ts` 那一处样例文案（画廊给用户看的字符串）。

## 拿不准、先加 allow 等人看（3 处）
1. **`control-prompts.ts` 的建课 / 改读法 / 暂停 / 恢复指令**：这些文本其实会原样发给模型，模型再把大意转述给用户，严格说是「发给模型的话」而不是用户直接看到的字。按单子里「发给模型的指令里要求按数据格式写的地方 → allow」处理了，但其中「讲后读（跟主项课…）、带读（学根陪读…）」是**读法名**，用户迟早会看到这三个词的转述。建议与 SKILL.md 那张单子一起统一：要么技能里改叫「课后读 / 导读课」，要么在本文件里就改词并同步指令人话。
2. **`course-prompts.ts` 的 `READING_NAMES`（`guided: "带读"`）与 `strings.ts` 的 `readingOptions.guided`**：同一个「带读」字面量，界面上的那个是原书方式选项（表单里显示给用户），不是「导读课」。按单子要求放行并写清 why；但用户在新课表单里会看到「带读」，和词表里「不要用 带读」冲突——**需要人决定**：是表单选项改叫别的（比如「学根讲，不读原文」），还是词表本身就允许这一处。
3. **`consistency-fixture.ts` / `panel-samples.ts` 的样例标题**：它们是测试夹具 / 画廊数据，写的是 `calendar.mjs` 产出的真实标题格式。放行了，但若将来数据格式也改名，这两处要一起改（界面层已用 `afterReadTitle` 兜住显示）。

## 另有一处遗留（没改，报备）
`scripts/lint-wording.test.mjs` 里的本地夹具 `RULES` 还是旧说法（`辅助 → 带读`、`核心页 → 讲后读 · pp.… · 日期`），其中一条用例把「讲后读 · pp.56–63 · 11-13」当作「干净文字」断言不报。这只影响这个测试文件自己的夹具，不影响真实词表与闸门；本单只要求加一条用例，所以没顺手改。若要与新词表对齐，建议下一张单子一起把这批夹具更新（那条「干净文字」改成「课后读 · pp.56–63 · 11-13」）。

## 验收（仓库根目录）

```
$ node scripts/lint-wording.mjs
lint-wording: 0 处

$ npm test
1..652
# tests 652
# pass 652
# fail 0
lint-wording: 0 处

$ cd apps/desktop && npx vitest run
 Test Files  141 passed (141)
      Tests  1355 passed | 1 skipped (1356)
   Duration  21.03s
```

没 commit、没 push、没启动 Electron。
