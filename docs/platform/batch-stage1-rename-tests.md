# batch-stage1-rename-tests（DeepSeek）：vault-lint / rename-vault 代码审核 + 补测试（只用小型假库）

取代 `batch-stage1-rename-review.md` 里的 B 节与 A2/A3/A4/A6/A7 的代码部分。**在真实库副本上跑改名、比对断链由 Claude 自己做，你不要复制真实库、不要扫 `~/学根/库`**（上次就是卡在这一步）。

## 硬约束

- 先读 `apps/desktop/AGENTS.md`、`docs/skills/AUTHORING.md`、`docs/platform/VAULT-NAMING.md`、规格 `docs/platform/batch-stage1-rename.md`、`skills/wiki-save/flashcards.test.mjs`（测试写法照它）。
- 测试只用 `mkdtemp` 临时目录里手搭的**小型假库**（十几个文件即可）。不读真实库、不读写真实 `~/.xuegen/`、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`。
- 只改：`skills/wiki-save/vault-lint.mjs`、`skills/wiki-save/rename-vault.mjs` 及两者的新测试；本批 Devin 改过的 `skills/reading/*`、`skills/course/*`、`skills/wiki-save/{flashcards,anki-sync}.mjs`、`apps/desktop/src/main/data/{sources,handler}.ts` 及它们的测试。别碰 `apps/desktop/src/agent/**`、`shared/protocol.ts`、`renderer/**`（另一个审核在改）。
- **每做完一个测试文件就跑一次**，别攒到最后。

## A. 代码审核（读代码，问题直接修）

1. 链接改写：只在后缀解析**唯一命中**时改；代码块（```）与行内代码里的 `[[…]]` 不改；表格里的 `[[x\|y]]` 保留转义竖线。
2. 只读锁：临时放开的目录/文件权限在 `finally` 里恢复，中途出错也恢复。
3. 前置检查：`from` 缺失 / `to` 已存在 / `jj st` 不干净 / 有学根或 Obsidian 进程，各自 exit 1 且一字不改。jj 与进程检查要能通过参数或注入跳过（测试机不一定装 jj）。
4. 新旧布局函数每个模块只写一次；「只有新 / 只有旧 / 都有」三种都选对；不会自己新建新目录。
5. `vault-lint`：`AGENTS.md`、`wiki/prompts/` 里的示例占位链接加明确例外（常量 + 注释）。

## B. 补测试

1. `skills/wiki-save/rename-vault.test.mjs`（新）：试运行不改文件；`--apply` 后文件就位；链接改写各写法（`[[旧]]` 补显示文字、`[[旧|显示]]`、`[[旧#标题]]`、`![[图.png]]`、短路径、裸名唯一命中、裸名歧义不改并进残留、代码块内不改、表格转义竖线）；只读目录权限恢复（含中途失败）；前置检查四种失败；删空目录；大小写改名 `Clippings`→`clippings`。
2. `skills/wiki-save/vault-lint.test.mjs`（新）：`checkName` 合法/非法样例；`lintTree` 覆盖规格列出的每种问题 + 例外；退出码。
3. 新旧布局：`bookshelf`、`reading-queue`、`render-board`、`course-state after-read`、`sources.ts`、`handler.ts`（courses.md 位置）各补「只有新 / 只有旧 / 都有」（加在已有测试文件里）。

## 验收命令（贴出最后几行）

```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && npm run lint:skills 2>&1 | tail -2
cd apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/main 2>&1 | tail -4
```

## 结束报告（中文，必须输出）

A 每条结论；改了哪些文件；新增测试数；未完成项。
