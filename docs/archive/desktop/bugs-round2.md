# 第 2 轮：Claude 核心代码审查发现（待第 1 轮修复完成后一起派发）

审查范围：`apps/desktop/src/main/data/`（scripts、skills、anki、sources）、`skills/wiki-save/flashcards.mjs`、`skills/calendar/calendar.mjs` 的写入路径。结论：脚本执行无 shell 注入；Anki 只读白名单有效；卡片与日历写入有库内路径校验与严格日期校验。以下为问题：

### C1 技能获取：只认仓库根目录的 SKILL.md（P1）
- `fetchSkill` 要求 `<仓库>/SKILL.md`，常见结构 `skills/<name>/SKILL.md`（如 imxv/Pretty-mermaid-skills）一律失败。
- 改：克隆到临时目录后查找所有 `**/SKILL.md`（深度 ≤ 3）；一个就直接用，多个就列出让用户选；把选中的技能目录（不是整个仓库）放入待审核区。

### C2 技能获取：待审核目录名与 frontmatter name 不一致导致无法启用（P1）
- 待审核目录用网址推出的名字，`promotePendingSkill` 却按 frontmatter `name` 找目录，不一致时静默不做事，技能永远停在待审核。
- 改：待审核目录一律以 frontmatter `name` 命名；启用找不到目录时报错而不是静默。测试覆盖「仓库名 ≠ 技能名」。

### C3 技能启用前没有审核视图；第三方技能被我们的写作规范误拒（P1）
- 改：技能面板中待审核技能显示「审核」按钮 → 对话框展示 SKILL.md 全文、目录里的文件清单（标出可执行脚本 `.mjs/.js/.sh/.py`）、`lint-skills` 的问题（作为提示，不阻断）、来源地址与提交号；只有在审核对话框里点「启用」才启用。`fetchSkill` 不再因 lint 失败丢弃（只在缺少 SKILL.md 或 name 不合法时拒绝）。
- `git clone` 加 `-c core.hooksPath=/dev/null --no-recurse-submodules --`，地址作为 `--` 之后的参数。

### C4 Anki 父牌组到期数包含子牌组（P2）
- `deck:"Link" is:due` 会包含 `Link::…` 子牌组，父子各算一次。改：查询加 `-deck:"Link::*"`，或只对叶子牌组计数、父牌组显示合计。

### C5 新牌组的卡片会落进第一个牌组（P2）
- 牌组尚不存在时写入 `flashcards/inbox.md`，该文件只有一个 `TARGET DECK`，后续不同新牌组的卡全部算进第一个牌组。改：新牌组写到 `flashcards/<牌组名转成安全目录名>/inbox.md`（名字只保留字母数字中文与连字符，校验最终路径在 `wiki/flashcards/` 内）。
