# batch-terms-data 报告（2026-11-14）

总控「术语」块的数据通道：技能脚本 + 协议类型 + 主进程路由 + 测试。未动 `src/renderer/`。

## 改了哪些文件

| 文件 | 改动 |
|---|---|
| `skills/course/course-terms.mjs` | 新增（219 行）：`list <库根> [--json] [--since YYYY-MM-DD]`，只读 |
| `skills/course/course-terms.test.mjs` | 新增（218 行）：`node:test`，临时目录夹具，7 个用例 |
| `apps/desktop/src/shared/data-protocol.ts` | 新增 `TermLink` / `TermGroup` 类型；`DataRequest` 加 `{kind:"terms.list"; since?: string}`；`DataResponseMap` 加 `"terms.list": TermGroup[]`；`isDataRequest` 加校验（`since` 可选，给了必须是合法 `YYYY-MM-DD`） |
| `apps/desktop/src/shared/data-protocol.test.ts` | 合法 2 例（无 since / 带 since）+ 非法 3 例（格式错、非法日期、非字符串） |
| `apps/desktop/src/main/data/handler.ts` | `handleScriptRequest` 加 `case "terms.list"`，照规格调 `course/course-terms.mjs list <vault> --json [--since …]` |
| `apps/desktop/src/main/data/handler.test.ts` | 2 个用例：端到端跑通（含 `--since` 过滤证明参数传到脚本）、未配置库返回 `vault-missing` |
| `apps/desktop/src/main/data/README.md` | 列表补一行 `terms.list → skills/course/course-terms.mjs list（只读）` |

`skills/course/SKILL.md` 按任务说明未改（界面用只读脚本）。

## 对真实样例的结果

`node skills/course/course-terms.mjs list /tmp/xg-e2e/vault/GJY --json`：**2 组**（已用 `rg '存库'` 全库核对，没有遗漏的存库行）：

- `discrete-math-epp` 2026-11-11 D3：**1 个术语**（复合命题逻辑，`exists:true`；该页用 `## 定义` 而非 `## Definition`，definition 按规格为 `null`）
- `discrete-math-epp` 2026-11-07 D1：**5 个术语**（变量与三类陈述 / 集合、元素与子集 / 幂集、有序对与笛卡尔积 / 关系与函数 / 图、术语与度数），definition 与规格示例逐字一致

## 偏离规格之处及原因

1. **存库行同时认 `- **存库**：`（加粗）写法**。规格写「以 `- 存库` 开头的行」，但真实库里 D3 记录是 `- **存库**：…`，只认纯文本会漏掉 D3 那组。两种都收。
2. **records/ 只收 `YYYY-MM.md` 命名的文件**（`/^\d{4}-\d{2}\.md$/`）。规格写的就是这个文件名；过滤掉避免同目录其他 md 被当整份记录。
3. **链接目标含 `#` 锚点时取 `#` 前部分**解析文件路径与缺页回退名。规格未提，防御性处理，不改变正常链接行为。
4. **`terms.list` 不注入 `--today`**：脚本无此参数，照规格拼参；`since` 校验在主进程协议层与脚本内各做一次（脚本侧只查 `YYYY-MM-DD` 形状，与 `course-state.mjs --date` 的校验强度一致；协议层查完整日期合法性）。

## 未完成项 / 需要人执行

**全仓验证目前被范围外的进行中文件阻断**（不是本批代码的问题）：另一批（界面）正在改的 `apps/desktop/src/renderer/skins/bear/control-panel.tsx` 第 17–18 行处于写坏状态（`import {` 内嵌 `import { TermsBlock } …`），`typecheck`/`lint`/`vitest`/`build` 全卡在这一处。等界面批修好后需重跑：

```sh
cd apps/desktop && npm run typecheck && npm run lint && npm test && npm run build
```

本批范围内已验证（见下）。`lint:skills` 另有一条**预存警告** `course/render-snapshot.mjs 缺同名测试`，与本批无关，未动。

## 验收输出（实际命令）

```text
$ node --test skills/course/course-terms.test.mjs
# tests 7 / pass 7 / fail 0

$ cd apps/desktop && npx tsc --noEmit -p tsconfig.node.json
NODE TSC: PASS        # main+shared+agent 全过（web 配置仅 control-panel.tsx 5 个语法错）

$ npx eslint src/shared/data-protocol.ts src/shared/data-protocol.test.ts \
    src/main/data/handler.ts src/main/data/handler.test.ts
（0 错误 0 警告）

$ npm test            # vitest run
✓ src/main/data/handler.test.ts (16 tests)
Test Files  1 failed | 142 passed (143)
Tests  9 failed | 1355 passed | 1 skipped (1365)
# 9 个失败全部是 bear 皮肤契约测试，esbuild 在 control-panel.tsx:18 转换报错

$ npm run build       # 同样只在 control-panel.tsx:18 失败（esbuild Expected "as" but found "{"）

$ XUEGEN_HOME=/tmp/xg-e2e/home npm run smoke
smoke: PASS

$ cd <仓库根> && npm test
# tests 661 / pass 661 / fail 0
lint-wording: 0 处

$ npm run lint:skills
lint:skills: 9 个 skill，0 个错误，1 个警告（render-snapshot.mjs 缺测试，预存）

$ node skills/course/course-terms.mjs list /tmp/xg-e2e/vault/GJY --json | head -40
[ discrete-math-epp 2026-11-11 D3（1 个术语）, discrete-math-epp 2026-11-07 D1（5 个术语） ]
```
