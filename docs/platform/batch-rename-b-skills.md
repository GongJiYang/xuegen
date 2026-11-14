# batch-rename-b-skills（DeepSeek，约 15 分钟）：9 个技能里对用户说的字改成新名字

## 背景
用户 11-14 批准：9 个技能（`skills/` 下 article、calendar、course、course-board、cycle-plan、diagram、reading、teach、wiki-save）的文字跟上新名字——主项课→主课、带读→导读课、讲后读→课后读。上一张单子（`batch-rename-a-wording-rules.md`）已经把旧词加进 lint 词表。

**只改对用户说的字，不改数据格式。**区分方法：
- 改：技能告诉模型「对用户说 / 告诉用户 / 回复」的话、```text 块里的回复模板、介绍课程类型时给用户的叫法、脚本（`*.mjs`）里会被原样转述给用户的报错 / 提示。
- 不改：要求模型往课程页、周期页**写进文件**的格式（例如「讲后读 · pp.… · 日期」行、`#讲后读-` 标记、周模板第 4 列「辅助」、`aux` / `main` 字段）。这些行旁边可以加半句说明「（界面上显示为「课后读」）」，但原格式字符串保持原样。
- 技能内部的说法（模型自己看的规则段落、不转述给用户）改不改都行，**优先保持一致**：同一段里既有给用户的话又有数据格式时，只改给用户的部分。

## 先写测试
在 `skills/` 现有的 lint 测试（`scripts/lint-skills.test.mjs` 或 `scripts/lint-wording.test.mjs`，挑写法更接近的）加一条：读真实的 `skills/course/SKILL.md`，断言其中 ```text 块和「告诉用户 / 对用户说」行的「」引号里不再出现「讲后读」「带读」「主项课」（复用 lint-wording 的提取函数，不要自己再写一套解析）。先跑一次看它失败，再改技能文字。

## 要做
1. `rg -n "带读|讲后读|主项课|主项" skills` 列出所有出现处，逐处按上面的区分方法改。重点文件：`skills/course/SKILL.md`、`skills/cycle-plan/SKILL.md`、`skills/reading/SKILL.md`、`skills/course/references/weekly-check.md`。
2. `skills/*.mjs` 里如果有给用户看的提示用了旧词，改成新词；数据常量不动（lint 已用 allow 放行的就是数据）。
3. 每个改过的 SKILL.md 的 frontmatter `description` 里如有旧词也改（它会被列给用户看）。
4. **开课不再核验课后读**（用户 11-14 定：开课只讲课，不问读没读核心页）。`skills/course/SKILL.md` 里：
   - 「讲后读（错开）」一段（约 50 行）删掉「下次开这门课时先问那节读了没有、有什么疑问：读完就打勾……没读就保留，不假装读过。」这一串；改成一句：课后读由用户在总控里勾「读完」记下（界面已自动记进书页），开课不问、不等。
   - 开课步骤「5. 问讲后读并回忆」（约 138 行）改成「5. 回忆」：只出一个回忆上次关键关系的提取题，不问讲后读读了没有、不在开课时打勾或写书页。步骤标题和别处引用这一步的地方一起改。
   - 收课时写「- [ ] 讲后读 …」那行的数据格式不变（总控靠它显示课后读）。
   - 在先写的测试里加一条：`skills/course/SKILL.md` 不再含「读了没有」。

## 不准动
- `apps/desktop/` 任何文件；`docs/` 下的历史单子与报告。
- 不改数据格式字符串、不改脚本行为。

## 验收（仓库根目录，贴最后几行输出）
```
node scripts/lint-wording.mjs     # 0 处
node scripts/lint-skills.mjs      # 通过
npm test                          # 全过
```
不要 commit、不要 push。

## 报告
写在 `docs/platform/batch-rename-b-skills.report.md`：每个文件改了几处；故意没改的数据格式出现处（文件:行 · 为什么）。
