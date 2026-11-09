# batch-stage1-rename-fix（DeepSeek 返修）：Claude 副本核对查出的 4 个问题

Claude 11-09 20:30 在真实库副本（`cp -cR` 到 `/private/tmp/xg-rename-check/vault`）上跑 `rename-vault --apply`，用独立脚本 `/tmp/xg-rename-check/tools/links.py` 比对改名前后断链。文件数一致、权限 0 变化；但有下面 4 个问题。

## 硬约束

- 先读 `apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`、`docs/platform/VAULT-NAMING.md`。
- 不读写真实库与真实 `~/.xuegen/`；测试用 `mkdtemp` 小型假库。不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。
- 只改：`skills/reading/bookshelf.mjs`、`skills/wiki-save/{anki-sync,rename-vault,vault-lint}.mjs` 及它们的测试、`scripts/lint-skills*`（或 `lint:skills` 实际所在文件）及其测试。别碰 `apps/desktop/src/**`。

## 1. 经符号链接调用时脚本静默不执行（exit 0）

`bookshelf.mjs:1025`、`anki-sync.mjs:432`、`rename-vault.mjs:455`、`vault-lint.mjs:327` 用 `resolve(process.argv[1]) === fileURLToPath(import.meta.url)` 判断是否直接运行。Node 会把主模块解析成真实路径，经 `~/.xuegen/app`（→ 仓库）或 `/tmp`（→ `/private/tmp`）调用时两边不等，脚本什么都不做且 exit 0。复现：`node ~/.xuegen/app/skills/reading/bookshelf.mjs --help` 无输出。

- 4 处全部改成仓库里已有的写法（`skills/course/course-schedule.mjs:509`）：`realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "")`，argv[1] 不存在时不抛错。
- `lint:skills` 加一条错误级检查：技能脚本里出现 `resolve(process.argv[1]) ===`（或不经 `realpathSync` 比较 `import.meta.url` 与 `argv[1]`）即报错。加测试。
- 每个脚本加一个测试：在临时目录建指向脚本所在目录的符号链接，经链接跑 `--help`，断言有输出。

## 2. 同名概念页与卡片页让后缀解析「歧义」→ 不改写 → 36 条新断链

旧链接 `[[link/210-符号处理]]` 同时后缀命中 `wiki/知识/concepts/link/210-符号处理.md` 与 `wiki/知识/flashcards/link/210-符号处理.md`，现逻辑判歧义跳过，改名后断（全部在 `wiki/log.md`，36 条，例：`link/200-连接器核心逻辑`、`mme/700-SFT数据设计与指令体系`、`math/000-谓词集合与证明`、`sre/000-SRE基础`、`dp/Command`）。

- 规则：多个命中时，若**恰好一个**不在 `flashcards/` 下，取它（链接默认指概念/正文页，卡片页只是同名附属）；否则仍按歧义跳过并进残留。
- 测试：概念页 + 同名卡片页 → 改写到概念页；两个概念页同名 → 仍歧义。

## 3. vault-lint 把 `wiki/` 顶层文件的链接误报为后缀解析

`[[index]]`、`[[subjects]]`、`[[log]]`、`[[profile]]` 指的就是 `wiki/index.md` 等，是完整路径。`allowedLinkRoots` 要把 `wiki/` 下的**顶层文件名（去 `.md`）**也算合法根。测试覆盖。

## 4. 改名让 `.gitignore` 失效 → 教材与代码进版本库

库 `.gitignore` 有 `raw/学习路径/`（教材 228 MB，含 `.venv`、`.git` 包）。映射把它改成 `raw/library/`，忽略规则失效，副本里 jj 一下收进 636 个文件。

- `rename-vault --apply`：在搬目录**之前**，把库根 `.gitignore` 里与 `dirs` 的 `from` 前缀相同的行改成对应的 `to`（只改路径前缀，保留注释与其它行；原子写）。试运行时打印将改的行。
- 前置检查补一项：`dirs` 里任何 `from` 若被 `.gitignore` 忽略而改名后的 `to` 不被忽略（且上一步也改不到），`fail`。
- 测试：假库含 `.gitignore` 的 `raw/旧/` 行 → apply 后变 `raw/新/`；其它行原样。

## 验收命令（贴出最后几行）

```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -3
node ~/.xuegen/app/skills/reading/bookshelf.mjs --help | head -2
```

## 结束报告（中文，必须输出）

4 条各怎么改的；改了哪些文件；新增测试数；未完成项。
