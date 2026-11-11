# batch-full-fix17-lint-links-frontmatter（DeepSeek 返修，约 15 分钟，TDD）：vault-lint 加断链与概念页 frontmatter 检查

## 用户 11-11 定
vault-lint 要报：① 指向不存在文件的 `[[…]]`（断链）；② 概念页缺 frontmatter 或 frontmatter 里没有 `sources:`。
（真实库 57 页老概念页由 Claude 另行补空 `sources: []`，不在本单。）

## 现状
`skills/wiki-save/vault-lint.mjs` 只查「链接走了后缀解析」，不查目标是否存在；不查 frontmatter。
`skills/wiki-save/vault-lint.full.test.mjs` 约 151、180 行有两条 `{ todo: … }` 用例。
`skills/wiki-save/rename-vault.mjs` 第 24 行 import 了 `lintTree`、`lintLinks`，**这两个函数的行为不能变**（改名脚本自己另查断链）。

## 改法（先写失败测试，再改）
只改 `skills/wiki-save/vault-lint.mjs`、`skills/wiki-save/vault-lint.full.test.mjs`、`skills/wiki-save/vault-lint.test.mjs`。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

1. 先写测试，确认失败：
   - 把 full 测试里两条 todo 转正（去掉 `{ todo }`，断言不变）。
   - `vault-lint.test.mjs` 加纯函数测试：
     - `brokenLinksInText(text, files)`（`files` 是库相对文件路径 Set，含扩展名）：返回 `[{target, line}]`。解析规则同 Obsidian：目标 = `linkTarget()` 的结果；能解析 = 有文件路径等于目标，或等于「目标 + .md」，或以「/目标」或「/目标.md」结尾。空目标、`.` 开头的跳过；代码块和行内代码里的跳过（用 `makeCodeTest`）。用例：存在的全路径、存在的后缀名、`![[pic.png]]` 存在、不存在的、代码里的不存在的（不报）、`[[a#标题|显示]]` 只看 `a`。
     - `checkConceptFrontmatter(text)`：不以 `---\n` 开头 → `"概念页缺少 frontmatter（须以 --- 开头）"`；frontmatter 里没有 `^sources\s*:` 行 → `"概念页 frontmatter 缺少 sources:"`；`sources: []` → null（空也算有）；正常 → null。文字与 `skills/course/close/rules.mjs` 的 `checkConceptPage` 一致（不要 import 它，在旁边注释写「与收课 check 的 checkConceptPage 保持一致」）。
   跑一次贴失败输出。
2. 实现，都 `export`：
   - `brokenLinksInText` 如上。
   - `lintBrokenLinks(vault, entries)`：文件范围与 `lintLinks` 相同（复用 `linkCheckedFiles`），每条断链 `problem("broken-link", 文件, \`断链：[[目标]]（第 N 行）\`)`。
   - `lintConceptFrontmatter(vault, entries)`：只查 `wiki/` 下路径段里含 `concepts` 的 `.md`，每页最多一条 `problem("frontmatter", 文件, 上面的文字)`。
   - `main()` 里在 `lintLinks` 之后 push 这两项。`lintTree`、`lintLinks` 不改。
   - 文件头注释与 `usage()` 补上「断链、概念页 frontmatter（sources:）」。
3. 现有测试（含 rename-vault 的）全部照旧通过。

## 验收命令（在 xuegen/ 里）
```sh
node --test "skills/wiki-save/**/*.test.mjs" 2>&1 | grep -E "^# (tests|pass|fail|todo)"
```
## 结束报告（中文）：第 1 步失败输出、改动、验收输出。
