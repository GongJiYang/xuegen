# batch-terms-data（Devin）：总控「术语」块的数据——每节课存进 wiki 的概念页

## 硬约束（先读，压缩后也照做）
- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`docs/desktop/UI-ARCHITECTURE.md`、`docs/skills/AUTHORING.md`。
- 只做数据：技能脚本 + 协议类型 + 主进程路由 + 测试。**不写界面**（`src/renderer/` 一行都不动，界面由 Claude 写）。
- 脚本零依赖（只用 `node:` 内置模块），**只读**库，不写任何文件。
- 不读写 `~/.xuegen/`、不碰真实 Obsidian 库、不启动 Electron、不 commit / push、不加依赖。
- 每个文件 ≤ 300 行，每个函数 ≤ 50 行。

## 背景
用户 11-14 定：总控面板加一块「术语」，列出最近上过的课存进 wiki 的概念页，只给 wiki 链接（用户先背熟术语再刷 Anki）。概念页在收课时写；每次收课在学习记录里留一行「存库：新建 N 个概念页 [[…|…]]、[[…|…]]」。这一批把这些行读出来，按课次分组返回。

## 数据从哪来（照这个格式解析，不要猜）
学习记录在两处，格式相同：
1. 课程页 `wiki/courses/<slug>.md` 里 `## Learning Record` 一节（到下一个 `## ` 为止）。
2. 已归档的 `wiki/courses/<slug>/records/YYYY-MM.md`（整份文件）。

每条记录是一个三级标题开头的块，到下一个 `### ` 或 `## ` 为止：
```
### 2026-11-07-01（收课：D1 · Ch1 §1.1–1.4）

完成：D1

- 课次：D1（计划表 id），……
- 存库：新建 5 个概念页 [[knowledge/concepts/discrete-math/010-variables-and-statements|变量与三类陈述]]、[[knowledge/concepts/discrete-math/020-sets-elements-subsets|集合、元素与子集]]……
```
- 日期：标题开头的 `YYYY-MM-DD`（后面的 `-NN` 是当天第几条）。
- 课次：块里 `完成：` 后的第一个词（如 `D1`、`R1-D3`）；没有 `完成：` 行时，取标题括号里「收课：」后到 ` · ` 之前的部分；都没有就是 `null`。
- 术语：块里以 `- 存库` 开头的行中，所有 `[[knowledge/concepts/…]]` 链接（可能带 `|别名`）。不是 `knowledge/concepts/` 开头的链接忽略。一个块里没有这种链接就跳过这个块。

真实样例：测试窗口库副本 `/tmp/xg-e2e/vault/GJY/wiki/courses/discrete-math-epp.md`（`## Learning Record` 136 行起）和 `/tmp/xg-e2e/vault/GJY/wiki/courses/discrete-math-epp/records/2026-11.md`——**只读，拿来看格式和手动跑脚本**，测试里不要引用这个路径，用临时目录造夹具。

## 要做

### 1. 新脚本 `skills/course/course-terms.mjs`（+ 同名测试 `course-terms.test.mjs`）
命令：`node course-terms.mjs list <库根> --json [--since YYYY-MM-DD]`
- 遍历 `<库根>/wiki/courses/*.md`（slug = 文件名去掉 `.md`），读上面两处记录。
- 课程名：课程页第一个 `# ` 标题（H1）文字。
- 每个术语链接：
  - `path`：`<库根>/wiki/<链接目标>.md` 的绝对路径。
  - `title`：链接有别名用别名，否则用那个页面的 H1，页面不存在时用链接目标的最后一段。
  - `definition`：页面 `## Definition` 下第一个非空段落的第一句（到第一个 `。` 或换行为止），去掉 `**`、`` ` ``、`$`，超过 60 个字截断并加 `…`；页面不存在或没有这一节时为 `null`。
  - `exists`：页面文件是否存在。
- 同一门课、同一天、同一课次的多个块合并成一组（术语按 `path` 去重，保持出现顺序）。
- `--since` 给了就只要日期 ≥ since 的组。
- 输出 JSON 数组，按日期倒序（同一天按课程 slug 升序）：
```json
[
  {
    "course": "discrete-math-epp",
    "courseTitle": "离散数学（Epp, 5th ed）",
    "date": "2026-11-07",
    "lesson": "D1",
    "terms": [
      { "title": "变量与三类陈述", "path": "/abs/wiki/knowledge/concepts/discrete-math/010-variables-and-statements.md", "definition": "变量 (variable) 是一个占位符，用来给「我现在还说不清、但想反复提到的东西」临时取个名字", "exists": true }
    ]
  }
]
```
- 参数错误、库根不存在：退出码非 0，stderr 一句中文说明（照 `course-state.mjs` 的写法）。
- 测试（`node --test`）至少覆盖：课程页 + records 两处都读；`完成：` 缺失时从标题取课次；别名 / H1 / 页面缺失三种 title；definition 截断与去标记；同课同日合并去重；`--since` 过滤；没有存库行的块被跳过；非 concepts 链接被忽略；排序。

### 2. 协议 `apps/desktop/src/shared/data-protocol.ts`
- 新类型：
```ts
export interface TermLink { title: string; path: string; definition: string | null; exists: boolean }
export interface TermGroup { course: string; courseTitle: string; date: string; lesson: string | null; terms: TermLink[] }
```
- `DataRequest` 加 `| { kind: "terms.list"; since?: string }`；响应表加 `"terms.list": TermGroup[]`。
- `isDataRequest` 加这一种（`since` 可选，给了必须是 `YYYY-MM-DD`）；照现有写法补 `data-protocol.test.ts` 用例（合法 / since 格式错 / since 非字符串）。

### 3. 主进程 `apps/desktop/src/main/data/handler.ts`
- 在 `handleScriptRequest` 的 switch 里加 `case "terms.list"`：`runScript("course/course-terms.mjs", ["list", vault.vault, "--json", ...(request.since ? ["--since", request.since] : [])])`。
- 照 `handler.test.ts` 的写法加用例：参数正确传给脚本；没配置库时返回库未配置的失败响应。
- `main/data/README.md` 列表补一行：`terms.list → skills/course/course-terms.mjs list（只读）`。

### 4. 技能文档
`skills/course/SKILL.md` 不用改（这是界面用的只读脚本）；但 `npm run lint:skills` 要求新脚本有同名测试，确认通过。

## 验收（贴最后几行输出）
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npm test
cd /Users/gjy/pi-learning/xuegen && npm test && npm run lint:skills
node skills/course/course-terms.mjs list /tmp/xg-e2e/vault/GJY --json | head -40   # 只读，能看到离散 D1 的 5 个概念页
```

## 结束报告
写在 `docs/desktop/batch-terms-data.report.md`：改了哪些文件；对真实样例跑出来的组数和每组术语数；偏离规格之处及原因；未完成项。
