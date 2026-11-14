# batch-wiki-read（Devin）：在学根里读一页 wiki（术语点开不再依赖 Obsidian）

## 硬约束（先读，压缩后也照做）
- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`。
- 只做数据：协议类型 + 主进程读取 + 测试。**`src/renderer/` 一行都不动**（Claude 正在改界面）。
- **只读**：不写库里任何文件。不读写 `~/.xuegen/`、不碰真实 Obsidian 库、不启动 Electron、不 commit / push、不加依赖。
- 每个文件 ≤ 300 行，每个函数 ≤ 50 行。

## 背景
总控「术语」块现在用 `obsidian://open?path=…` 打开概念页，但用户的 Obsidian 登记的库路径和学根的库路径不一样（一个是符号链接），Obsidian 报「Unable to find a vault」。改成在学根里直接显示这一页：渲染进程拿到页面的 Markdown 原文，自己渲染。`terms.list` 返回的 `path` 是绝对路径（`<库根>/wiki/…/*.md`），就用它来读。

## 要做

### 1. 协议 `apps/desktop/src/shared/data-protocol.ts`
- 新类型：
```ts
/** One wiki page read for display: its H1 (or file name) and the Markdown without frontmatter. */
export interface WikiPage { path: string; title: string; markdown: string }
```
- `DataRequest` 加 `| { kind: "wiki.read"; path: string }`；响应表加 `"wiki.read": WikiPage`。
- `isDataRequest`：`path` 必须是非空字符串、以 `.md` 结尾、是绝对路径（`/` 开头）；`data-protocol.test.ts` 补用例（合法 / 非字符串 / 相对路径 / 非 .md）。

### 2. 新模块 `apps/desktop/src/main/data/wiki-page.ts`（+ `wiki-page.test.ts`）
```ts
export function readWikiPage(vault: string, path: string): DataResponse  // 同步即可
```
- **目录守卫**（照 `src/agent/session-file.ts` 的写法）：`realpathSync(join(vault, "wiki"))` 与 `realpathSync(path)` 比较，目标必须在 `wiki/` 目录**里面**（前缀 + 路径分隔符），且是普通文件、以 `.md` 结尾。符号链接指到 `wiki/` 外面的拒绝。不满足：`{ ok: false, code: "invalid-request", error: "只能打开知识库 wiki 里的页面。" }`。
- 文件不存在：`{ ok: false, code: "not-found", error: "这一页不在了。" }`——先看 `DataErrorCode` 里有没有 `not-found`，没有就用已有最接近的码，在报告里写明用了哪个。
- 超过 512 KB 的拒绝（`code` 同上一条最接近的码，`error: "页面太大，请在 Obsidian 里打开。"`）。
- 内容：去掉开头的 YAML frontmatter（`---\n…\n---\n`），其余原样返回。`title` = 第一行 `# ` 标题的文字，没有就用文件名去掉 `.md`。
- 测试（临时目录造库）：正常读、去 frontmatter、没 H1 用文件名、`wiki/` 外的文件拒绝、`../` 逃逸拒绝、符号链接指到外面拒绝、不存在、不是 .md、太大。

### 3. 路由 `apps/desktop/src/main/data/handler.ts`
- `wiki.read` 需要库：放进 `handleScriptRequest` 的 switch（那里已经拿到 `vault`），`case "wiki.read": return readWikiPage(vault.vault, request.path);`。
- `handler.test.ts` 补一条：没配置库时返回库未配置。
- `main/data/README.md` 补一行：`wiki.read → wiki-page.ts（只读，限 wiki/ 内的 .md）`。

## 验收（贴最后几行输出）
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx tsc -p tsconfig.node.json --noEmit && npx vitest run src/main src/shared
cd /Users/gjy/pi-learning/xuegen && npm test
```
（渲染进程正在被 Claude 改，`npm run typecheck` / 全量 `npm test` 若因 `src/renderer/` 报错，在报告里写明、不要去改。）

## 结束报告
写在 `docs/desktop/batch-wiki-read.report.md`：改了哪些文件；用了哪些错误码；偏离规格之处；未完成项。
