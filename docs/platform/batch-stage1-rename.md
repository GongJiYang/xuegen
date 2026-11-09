# batch-stage1-rename（Devin 写基础代码）：代码认新旧两种布局 + vault-lint + 一次性改名脚本

路线阶段 1 第 7 项。规则：`docs/platform/VAULT-NAMING.md`（库里 `AGENTS.md` 的「File Naming Conventions」是同一份）。映射表（已审）：`docs/platform/vault-rename-map.json`。**不做界面**；界面上的中文用词（「书房」等）不改，只改路径。

## 硬约束（压缩后也要记得）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`、`docs/platform/VAULT-NAMING.md`、`docs/platform/vault-rename-map.json`（看结构即可）。
- **不碰真实库** `~/学根/库`（改名由 Claude 在用户退出应用后执行）；测试用临时目录。脚本零依赖；写文件原子（临时文件 → rename）。
- 不读写真实 `~/.xuegen/`、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint。不写新测试（DeepSeek 补），现有测试必须通过。

## 一、代码同时认新旧布局（「有新的用新的，没有用旧的」）

每处都写成一个小函数（同一个模块里只写一次），优先新名，不存在时退回旧名；**新写入的文件按当前实际存在的布局放**（不自己新建新目录）：

| 位置 | 新 | 旧 |
|---|---|---|
| `skills/reading/bookshelf.mjs` 的 `SHELF_DIR`，以及 `index.md` 里生成的链接前缀 `[[书房/…]]` | `wiki/shelf`，链接 `[[shelf/…]]` | `wiki/书房`，链接 `[[书房/…]]` |
| `skills/reading/reading-queue.mjs` 与 `skills/wiki-save/flashcards.mjs`、`skills/wiki-save/anki-sync.mjs` 的知识目录 | `wiki/knowledge` | `wiki/知识`（再旧：`wiki`，保持现有的退回） |
| `skills/reading/reading-queue.mjs` 原文根、`apps/desktop/src/main/data/sources.ts` 的 `SOURCE_ROOTS` | `clippings` | `Clippings`（两者都在时都列） |
| `skills/course/render-board.mjs`（`courses.md` 路径）与 `apps/desktop/src/main/data/handler.ts` 第 143–144 行（`courses.md`、`courses.html`） | `wiki/_generated/` | `wiki/` |
| `skills/course/course-state.mjs after-read` 找书房链接的正则 | `[[shelf/<slug>` | `[[书房/<slug>`（两种都认） |

对应的文件头注释、`usage()`、`README` 里的路径说明同步改成「新路径（旧库：旧路径）」。

## 二、`skills/wiki-save/vault-lint.mjs`（新）

```
node vault-lint.mjs <vault> [--json]
```
- 按 `VAULT-NAMING.md` 第 1、3、4 节检查 `wiki/`、`clippings/`（或 `Clippings/`）下所有文件和目录名，以及 `raw/` 的**第一、二层分区目录名**（不查原料文件名）。
- 报告：不合规的名字、不在规定位置的生成物、空目录、概念页没有编号、卡片页找不到同名概念页、链接用了后缀解析（`[[concepts/…]]` 这种不以 `knowledge/`、`courses/`、`shelf/` 等 `wiki/` 一级目录开头的）。
- 退出码：有问题 1，没有 0。`--json` 输出 `{ problems: [{ kind, path, detail }] }`。
- 纯函数 `export`：`checkName(segment)`、`lintTree(entries)`（入参是路径列表，便于测试）。

## 三、`skills/wiki-save/rename-vault.mjs`（新，一次性）

```
node rename-vault.mjs <vault> <map.json> [--apply]
```
不带 `--apply` 是试运行，只打印计划。步骤：
1. **前置检查**（任何一项不过就 `fail`，什么都不动）：`map.json` 里每个 `from` 都存在、每个 `to` 都不存在且互不重复；库里 `jj st` 干净（工作区无改动）；没有学根或 Obsidian 进程（`pgrep -f "学根.app/Contents/MacOS|Obsidian.app/Contents/MacOS"`）。
2. **算出链接改写表**：对每个改名的 `.md`，旧的「wiki 内路径去掉 `.md`」以及旧的「去掉 `wiki/知识/` 前缀后的短路径」（Obsidian 后缀解析时的写法，例如 `concepts/math/010-变量与三类陈述`）都映射到新的「`wiki/` 起的完整路径去掉 `.md`」（例如 `knowledge/concepts/discrete-math/010-variables-and-statements`）。
3. **改写链接**：扫描库里所有 `.md`（含 `AGENTS.md`、`README.md`、`log.md`），把 `[[旧|显示]]`、`[[旧]]`、`[[旧#标题]]`、`![[旧]]` 换成新路径；没有显示文字的 `[[旧]]` 改成 `[[新|<该页 title 或 H1>]]`（`map.json` 的 `title` 字段）。图片（`.png`）引用同理。只替换完整链接目标，不做子串替换。
4. **搬文件**：先按 `dirs` 建目录、再按 `files` 逐个 `rename`（同卷），最后删 `removeEmptyDirs` 里已经空的目录。
5. **核对**：重新扫描，所有 `[[…]]` 链接目标都能找到文件（找不到的列出来）；跑一次 `vault-lint`。
6. 输出改了多少文件、多少条链接、残留问题清单。**不做 jj 提交**（由 Claude 看过结果后提交，可以 `jj undo`）。
7. 中途任何一步出错：停止并打印已做到哪一步（库在 jj 下，Claude 用 `jj restore` 回滚）。

## 四、技能文字与库外文档

把 6 份技能文档（`skills/calendar/SKILL.md`、`skills/course-board/SKILL.md`、`skills/course/SKILL.md`、`skills/course/references/concept-page.md`、`skills/cycle-plan/SKILL.md`、`skills/reading/SKILL.md`）以及 `skills/course/PLAN-STANDARD.md` 里的库路径改成新名，并在第一次出现处加一句「（旧库：`wiki/知识/…`）」。`concept-page.md` 的例子按新规则写（`wiki/knowledge/concepts/discrete-math/` 或带主题目录，文件名 `<三位编号>-<英文名>.md`、H1 用中文）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
# 试运行（只读真实库，不改）：
node skills/wiki-save/rename-vault.mjs ~/学根/库 docs/platform/vault-rename-map.json | tail -20
node skills/wiki-save/vault-lint.mjs ~/学根/库 | tail -5
# 在一份临时副本上真跑一遍：
rm -rf /tmp/vault-rename-try && cp -R ~/学根/库 /tmp/vault-rename-try && rm -rf /tmp/vault-rename-try/.jj && (cd /tmp/vault-rename-try && jj git init --colocate >/dev/null 2>&1; jj describe -m base >/dev/null; jj new >/dev/null) && node skills/wiki-save/rename-vault.mjs /tmp/vault-rename-try docs/platform/vault-rename-map.json --apply | tail -20
node skills/reading/bookshelf.mjs today /tmp/vault-rename-try --json | head -c 200
cd /Users/gjy/pi-learning/xuegen && git status --short
```
（真跑那一步在副本上，前置检查里的「没有学根/Obsidian 进程」若因用户开着应用而失败，加一个 `--skip-process-check` 仅供副本测试使用，并在报告里说明。）

## 结束报告（中文）

改了哪些文件、每节是否照做、偏离之处及原因、未完成项；附试运行与副本真跑的输出（改了多少文件、多少链接、残留问题）。
