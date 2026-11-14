# batch-rename-b-skills 报告（DeepSeek）

词表新名字（`scripts/wording-rules.json`）：主项课 → **主课**、带读 → **导读课**、讲后读 → **课后读**。
本次只改「对用户说的字」，数据格式字符串一律保持原样，行旁加半句「界面上显示为 …」。

## 先写的测试

`scripts/lint-wording.test.mjs` 加两条（复用 `extractMarkdownVisibleText` + `findBanned`，没有另写解析）：

1. `真实仓库：skills/course/SKILL.md 对用户说的话不再用旧名字` —— 读真实的 `skills/course/SKILL.md`，
   用 lint-wording 的 markdown 可见文字提取（```text 块 + 「告诉用户 / 对用户说 / 回复 / 说一句」行的「」引号），
   断言不再命中「讲后读 / 带读 / 主项课」。
2. `真实仓库：skills/course/SKILL.md 开课不再问课后读读了没有` —— 断言文件里不再出现「读了没有」。

改技能前先跑，两条都失败（失败原文：命中 `line 50/121/123/140/151/176/208` 的「讲后读」「带读」；
`source.includes("读了没有")` 为 `true`）。改完两条都通过。

```
$ node --test scripts/lint-wording.test.mjs
# tests 24
# pass 24
# fail 0
```

## 每个文件改了几处

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `skills/course/SKILL.md` | 27 行 | description；`course_close` 一句（去掉「开课时给讲后读打勾」）；「原书方式」整段（四种读法的叫法、`- 原书：…` 数据值加界面说明）；「讲后读（错开）」整段（删掉「下次开这门课时先问那节读了没有…」一串，改成「课后读由用户在总控里勾『读完』记下，界面已自动记进书页，开课不问、不等」）；原书通读、不估时长、阅读位置、Key Facts 示例；「概念页在收课时写」；「日志与记录里的用词」；开课第 3/4/5/6/7 步（第 5 步改成「**回忆**」，只出提取题）；「学习周期里的课」四条；「周核实」一句；「收课第 9 步」的例子 |
| `skills/cycle-plan/SKILL.md` | 20 行 | frontmatter description（两门主课）；周模板第 4 列那条（列名保留「辅助」，旁注界面上叫「导读课」）；类型/一天只主攻一条；路线页六列表说明不动；「脚本」两条；每日简报「深度」「整合」两条；手动顺延；周五整合；新建周期第 1/2/3/4/5 步与子项；周期验收两处；返回格式样例（`○ 课后读 · …`、`○ 导读课 …`） |
| `skills/reading/SKILL.md` | 6 行 | description（记一笔课后读）；`note` 示例文案；书房「主项教材」→「主课教材」；「读法」三个词（课后读 / 导读课 / 自读）；「课后读」那一节（勾选改由用户在总控勾「读完」，`## 讲后读已读` 节名标注是数据格式） |
| `skills/course/references/weekly-check.md` | 1 行 | 「确认主课」：只对主课做，导读课不核实 |
| `skills/teach/SKILL.md` | 2 行 | 「辅助课」→「导读课」两处（讲法例外与今日要点条数） |
| `skills/course/course-schedule.mjs` | 1 行 | `--elastic` 的 `usage()` 说明（模型会转述给用户）里「主项课」→「主课」；行为与常量不动 |
| `skills/cycle-plan/cycle.mjs` | 1 行 | `usage()` 说明里「按主项课顺延」→「按主课顺延」；行为与常量不动 |
| `scripts/wording-rules.json` | 4 条 allow 删掉、1 条 why 改字 | 上一张单子给 `skills/course/SKILL.md`、`skills/cycle-plan/SKILL.md` 的「讲后读」「带读」放行条目撤销（技能文字已改净，不放行也 0 处）；`辅助` 那条的 why 改成「对用户说『导读课』」。桌面版文件的 allow 不动 |
| `scripts/lint-wording.test.mjs` | +88 行 | 上面两条真实仓库测试 |
| `docs/platform/FEATURE-WIKI.md` | 2 处 | 1.3 开课第 5 步那条改为「回忆题 — 课后读不问、不在开课时打勾」；`<!-- feature-steps -->` 块用 `node scripts/feature-steps.mjs --write` 重新生成（步骤 5 现为「回忆」）。不改它 `lint-skills` 会报流程表与 SKILL.md 不一致 |

## 开课不再核验课后读（用户 11-14 定）

- 「讲后读（错开）」一段：删掉「下次开这门课时先问那节读了没有、有什么疑问：读完就打勾…没读就保留，不假装读过」，
  改成「**课后读由用户在总控里勾「读完」记下，界面已自动记进书页（`bookshelf.mjs lecture`）；开课不问、不等，也不在开课时打勾。**」
- 开课第 5 步：`5. **问讲后读并回忆**` → `5. **回忆**`，只出一个回忆上次关键关系的提取题，不问课后读、不打勾、不写书页。
  别处引用这一步的地方（`docs/platform/FEATURE-WIKI.md` 的 1.3 开课流程）一起改。
- 收课时 `- [ ] 讲后读 §x–y pp.a–b · YYYY-MM-DD 读` 这一行原样保留（总控靠它显示课后读），旁边注明「这一行是数据格式，界面上显示为『课后读』」。
- 测试里加了「不再含『读了没有』」一条（改前失败、改后通过）。

## 故意没改的数据格式（文件:行 · 为什么）

- `skills/course/SKILL.md:45` · `- 原书：带读` / `讲后读（错开）`：`Key Facts` 的数据值，桌面版按它显示读法（`strings.ts` 的 `readingOptions`、`course-prompts.ts` 的 `READING_NAMES`）。改成新词会让旧课程页对不上；行内已注明界面上显示为「导读课」「课后读」。
- `skills/course/SKILL.md:50` · `讲后读（开课时定页码）· 下一个 <另一门短名> 日`（排期表材料列）与 `- [ ] 讲后读 §x–y pp.a–b · YYYY-MM-DD 读`（`Today` 行）：`calendar.mjs` 用 `/^- \[ \] 讲后读 (.+?) · (\d{4}-\d{2}-\d{2}) 读/` 解析，`control-card.ts` 解析日历标题前缀「讲后读 · 」与 `#讲后读-N` 标记，界面再经 `afterReadTitle` 显示「课后读 · …」。
- `skills/course/SKILL.md:76` · 课程页骨架示例 `- 原书：带读（…）`：同上，数据值示例。
- `skills/cycle-plan/SKILL.md:33` · 周模板表头 `| 星期 | 类型 | 主项 | 辅助 |`：`cycle.mjs` 按这四列解析，`allow` 里已放行「辅助」。
- `skills/cycle-plan/SKILL.md:53` · 路线页 `周期 | 开始 | 结束 | 主项 | 辅助（下周期主项） | 状态`：同上，脚本按表头解析。
- `skills/reading/SKILL.md:59` · 书页节名 `## 讲后读已读`、`## 读书记录` 行：`bookshelf.mjs` 的 `CORE_READ_HEADING` / `LECTURE_RECORD_RE` 常量，旧书页还有 `## 核心页已读` 要兼容。
- `skills/calendar/calendar.mjs`、`skills/course/course-state.mjs`、`skills/reading/bookshelf.mjs` 里的「讲后读」：数据格式与报错点名的行，`wording-rules.json` 已 allow。
- `skills/cycle-plan/cycle.mjs` 里的「主项」「辅助」：`role` / `main` / `aux` 字段与周模板列名，`wording-rules.json` 已 allow。
- 「主项」单独出现的地方（`subjects.mjs` 的 `route.startsWith("${cycle.cycle} 主项")`、`cycle.mjs` 的报错、`skills/cycle-plan/SKILL.md:41/53/77/87/108/113/125`）：这是科目页 `route` 字段的数据文字（「C1 主项」）与脚本接口名，不是对用户说的课名；讲给用户时说的是「主课」。词表也只禁「主项课」，不禁「主项」。

## 未完成项 / 需要人执行

- 没有 commit、没有 push。
- 仓库里 `apps/desktop/dist/mac-arm64/学根.app/.../skills/course/SKILL.md` 是打包产物（旧文字），按「不准动 apps/desktop」没有碰；下次打包会自然更新。
- `lint-skills` 的既有警告 `course/render-snapshot.mjs: 缺少同名测试 render-snapshot.test.mjs` 与本次无关，未处理。

## 验收输出

```
$ node scripts/lint-wording.mjs
lint-wording: 0 处

$ node scripts/lint-skills.mjs
[警告] course/render-snapshot.mjs: 缺少同名测试 render-snapshot.test.mjs
lint:skills: 9 个 skill，0 个错误，1 个警告

$ node --test scripts/lint-wording.test.mjs
# tests 24
# pass 24
# fail 0

$ npm test
# tests 654
# pass 654
# fail 0
lint-wording: 0 处
```

`npm test` 跑的是根目录 `package.json` 的脚本（`node --test "scripts/**/*.test.mjs" "skills/**/*.test.mjs" && node scripts/lint-wording.mjs`），全过。
`apps/desktop` 的测试不在其中，本次也没碰那个目录。
