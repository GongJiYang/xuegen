# batch-wiki-read 结束报告

在学根内读一页 wiki（术语点开不再依赖 Obsidian）。只做数据层：协议类型 + 主进程读取 + 测试；`src/renderer/` 一行未动。

## 改了哪些文件

- `apps/desktop/src/shared/data-protocol.ts`：新增 `WikiPage`（path / title / markdown）；`DataRequest` 加 `{ kind: "wiki.read"; path: string }`；`DataResponseMap` 加 `"wiki.read": WikiPage`；`isDataRequest` 加 `wiki.read` 分支（`path` 为以 `/` 开头、以 `.md` 结尾的字符串）。
- `apps/desktop/src/shared/data-protocol.test.ts`：合法用例 +1；非法用例 +6（缺 path、空串、非字符串、相对路径、非 `.md`、无扩展名）。
- `apps/desktop/src/main/data/wiki-page.ts`（新）：`readWikiPage(vault, path)` 同步读取；`realpathSync(join(vault,"wiki"))` 与 `realpathSync(path)` 做前缀+分隔符比较（照 `src/agent/session-file.ts`），限 `wiki/` 内的普通 `.md` 文件；去开头 frontmatter，`title` 取第一个 `# ` 标题、没有则用文件名去 `.md`。纯函数 `parseWikiPage`（文本 → WikiPage）与 I/O 外壳分离。
- `apps/desktop/src/main/data/wiki-page.test.ts`（新）：11 条——正常读、去 frontmatter、没 H1 用文件名、`wiki/` 外文件、`../` 逃逸、符号链接指出 `wiki/`、`*.md` 目录、不存在、非 `.md`、超 512 KB、frontmatter 在 EOF 收尾。
- `apps/desktop/src/main/data/handler.ts`：`handleScriptRequest` 的 switch 加 `case "wiki.read": return readWikiPage(vault.vault, request.path);`（该分支已拿到 `vault`，未配置时经 `requireVault` 返回 `vault-missing`）。
- `apps/desktop/src/main/data/handler.test.ts`：补 `wiki.read` 未配置库 → `vault-missing` 用例。
- `apps/desktop/src/main/data/README.md`：补 `wiki.read → wiki-page.ts（只读，限 wiki/ 内的 .md）`。

## 错误码

`DataErrorCode` 里没有 `not-found`，按任务单取最接近的现有码：

| 情况 | code | error |
|---|---|---|
| `wiki/` 外 / `..` 逃逸 / 符号链接指出 / 非普通文件 / 非 `.md` | `invalid-request` | 只能打开知识库 wiki 里的页面。 |
| 文件不存在（含 wiki 根缺失、悬空符号链接） | `invalid-request` | 这一页不在了。 |
| 超过 512 KB | `invalid-request` | 页面太大，请在 Obsidian 里打开。 |
| 守卫通过后读文件仍失败（如权限） | `unknown` | 这一页读不出来：<原始错误> |
| 未配置库 | `vault-missing` | （复用 `requireVault` 的现有文案） |

## 偏离规格之处

- 「不存在 / 太大」两档用了 `invalid-request`（`DataErrorCode` 无 `not-found`，三档靠 `error` 文案区分）。
- frontmatter 正则允许收尾 `---` 直接落在 EOF（不要求后面还有换行），比规格的 `---\n…\n---\n` 略宽。
- `title` 取整页第一个非空 `# ` 行（不是只看第一行）；`# ` 后文字为空时跳过继续找。
- 测试比规格多两条：`*.md` 目录拒绝、`parseWikiPage` 的 EOF 收尾 frontmatter。
- 规格外顺带说明：`handler.ts`、`data-protocol.ts`、`data-protocol.test.ts`、`handler.test.ts` 在 HEAD 上本就不符合 `prettier --check`（仓库 prettier 非 lint 强制项，`format` 是手动脚本），未做范围外重排；新写的两个文件是 prettier 干净的。

## 未完成项

- 渲染进程接线（`client.data({kind:"wiki.read"})` 的调用与页面渲染）属 Claude 的界面批次，本批不涉及。
- `main/data/README.md` 的职责清单与 `shared/README.md` 的 kind 例举未整体梳理，只按任务单补了 `wiki.read` 一行。

## 验收输出（末几行）

```text
$ cd apps/desktop && npx tsc -p tsconfig.node.json --noEmit && npx vitest run src/main src/shared
 ✓ src/main/data/wiki-page.test.ts (11 tests) 16ms
 ✓ src/main/data/handler.test.ts (17 tests) 1102ms
 Test Files  15 passed (15)
      Tests  123 passed (123)

$ cd apps/desktop && npm run typecheck        # node + web 均通过
$ cd apps/desktop && npm run lint             # eslint . 零错误零警告
$ cd apps/desktop && npm run build            # ✓ built in 6.50s

$ cd .. && npm test
# tests 661
# pass 661
# fail 0
lint-wording: 0 处
```
