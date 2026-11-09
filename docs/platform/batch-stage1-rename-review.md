# batch-stage1-rename-review（DeepSeek）：审核 + 补测试（新旧布局、vault-lint、rename-vault）

Devin 按 `docs/platform/batch-stage1-rename.md` 写完了（未提交），结束报告见 `/Users/gjy/pi-learning/devin-stage1-rename.log`。你负责 A 审核（问题直接修）、B 补测试。不做任何界面。

## 硬约束

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`、`docs/platform/VAULT-NAMING.md`、规格 `docs/platform/batch-stage1-rename.md`、Devin 的结束报告、`skills/wiki-save/flashcards.test.mjs`（测试写法照它）。
- **真实库 `~/学根/库` 只许只读**（试运行、lint 可以跑；绝不带 `--apply`）。真跑只在 `/tmp` 副本上。不读写真实 `~/.xuegen/`、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。
- **别碰 `apps/desktop/src/agent/**`**：另一个审核正在改（包括 `guard/roles.ts` 里写死的旧路径——那个问题留给下一批，你不要改）。它的测试暂时失败时稍后重跑，不要修。
- 只改：`skills/wiki-save/vault-lint.mjs`、`skills/wiki-save/rename-vault.mjs` 及两者测试；本批 Devin 改过的 `skills/reading/*`、`skills/wiki-save/flashcards.mjs`、`skills/wiki-save/anki-sync.mjs`、`skills/course/*`、`apps/desktop/src/main/data/sources.ts`、`handler.ts` 及它们的测试。

## A. 审核（逐条，问题直接修，报告里列表格）

1. **不新增断链（最重要）**：在副本上，改名**前**扫一遍所有 `[[…]]`/`![[…]]` 找不到目标的链接（按 Obsidian 后缀解析），改名**后**再扫一遍。改名后的断链必须全部是改名前就断的（按「来源文件 + 原链接文字」对应）。列出两个数字和差集；差集非空就是 bug，修到为空。
2. **后缀解析改写**（Devin 偏离规格第 1 条）：只在唯一命中时改写；抽 20 条改写（含裸名如 `[[epp]]`、深后缀如 `[[mech-interp/…]]`、带 `#标题`、带 `|显示`、`![[x.png]]`、表格里 `[[x\|y]]`）逐条核对改对了；确认代码块（``` 围起来的）和行内代码里的 `[[…]]` 不被改写——若被改了就修。
3. **只读锁**：`wiki/courses/` 原本 0555 / 文件 0444。真跑后所有目录与文件的权限必须和改名前一致（按新路径对应）；中途出错也要恢复（`finally`）。
4. **大小写改名** `Clippings`→`clippings`：在 APFS（大小写不敏感）上真跑后 `ls` 显示的是小写；`sources.ts` 新旧都在时不重复列。
5. **jj 跟踪**：库的 `snapshot.max-new-file-size` 是 30 MB。搬动后的文件对 jj 来说是新路径——找出所有被搬动（含整目录改名）的文件里超过 30 MB 的，列出来；有的话在报告里写清楚，并让 `rename-vault.mjs` 在前置检查里提示（不 fail）。
6. **前置检查**：`from` 缺失 / `to` 已存在 / `jj st` 不干净 / 有学根或 Obsidian 进程，各自都 exit 1 且库一字不变。
7. **新旧布局函数**：每个模块只写一次；只有新的、只有旧的、两者都有三种情况都选对；新写入的文件不会自己新建新目录。
8. **vault-lint 误报**：报告里统计副本改名后剩余 lint 问题按 `kind` 分组的数量；`AGENTS.md`、`prompts/` 里文档示例占位符这类误报，加明确例外（写在常量里，附注释说明为什么）。

## B. 补测试（临时目录，`node:test`）

1. `skills/wiki-save/rename-vault.test.mjs`（新）：小型假库 + 假 map：试运行不改任何文件；`--apply` 后文件就位、链接改写（各种写法：`[[旧]]` 补显示文字、`[[旧|显示]]`、`[[旧#标题]]`、`![[图.png]]`、短路径、裸名唯一命中、裸名歧义不改并进残留、代码块内不改）；只读目录权限恢复；前置检查四种失败；删空目录。jj 和进程检查可用参数跳过或注入（不要求测试机装 jj）。
2. `skills/wiki-save/vault-lint.test.mjs`（新）：`checkName` 合法/非法样例各若干；`lintTree` 覆盖规格列的每一种问题 + 例外；退出码。
3. 新旧布局：`bookshelf`、`reading-queue`、`render-board`、`course-state after-read`、`sources.ts`、`handler.ts`（courses.md 位置）各补「只有新 / 只有旧 / 都有」用例（已有测试文件就加在里面）。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
node skills/wiki-save/rename-vault.mjs ~/学根/库 docs/platform/vault-rename-map.json | tail -20
rm -rf /tmp/vault-rename-try && cp -R ~/学根/库 /tmp/vault-rename-try && (cd /tmp/vault-rename-try && jj st >/dev/null) && node skills/wiki-save/rename-vault.mjs /tmp/vault-rename-try docs/platform/vault-rename-map.json --apply --skip-process-check | tail -20
(cd /tmp/vault-rename-try && jj st | tail -5)
cd /Users/gjy/pi-learning/xuegen && git status --short skills apps/desktop/src/main
```
（副本保留 `.jj`，这样 jj 配置与真实库一致；`cp -R` 之后若 jj 报工作区路径问题，改用 `jj workspace` 或说明你用的办法。）

## 结束报告（中文）

A 每条的结论表（含第 1 条两个数字与差集、第 5 条大文件清单、第 8 条分组数）；改了哪些文件；新增测试数；未完成项和要人决定的事。
