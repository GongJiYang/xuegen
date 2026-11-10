# batch-stage4a1-review（DeepSeek，小单约 15 分钟）：沙盒配置的单元测试 + 与 guard 的一致性测试

Devin 写的 4a-1（报告 `/Users/gjy/pi-learning/devin-stage4a1-sandbox.log` 末尾）：`apps/desktop/src/agent/sandbox/{config.ts,runner.ts}`，**还没接入**会话。`config.ts` 的写清单是手抄 `guard/roles.ts` 的 `writeAllowed`（注释「改一处要改两处」），设计要求「由同一份规则生成，不另写一套」——这一单先用**一致性测试**把两边钉住，不重构。**先写测试并跑通，测试暴露的问题再改 `config.ts`。**

## 硬约束
- 只新建 `apps/desktop/src/agent/sandbox/config.test.ts`；只在测试暴露真问题时改 `sandbox/config.ts`。别碰 `guard/**`、`tools/**`、`skills/**`（另一批 Devin 正在改 `skills/course/course-close.mjs` 和 `tools/course-close-tool.ts`）。不 commit/push、不加依赖、不放宽 eslint。
- 不真的启动 seatbelt（真沙盒回归是接入后的 4a-2）；`runner.ts` 这单不测。

## 测试（`config.test.ts`，fixture 照 `guard/roles.test.ts` 第 29–40 行：`/vault`、`/home/learning`、`/home/.xuegen`、`/repo`、`temp`，`canon` 恒等）
1. **形状**：三个角色（control、course `slug=discrete-math-epp`、free）各调一次 `sandboxConfigFor`：
   - `network.allowedDomains` 恰好 `["127.0.0.1:8765"]`；配置里没有 `allowLocalBinding`（用户 11-10 定：不开，Anki 走代理）。
   - `filesystem` 三个清单里每一项都是 `{ path, literal: true }`，`path` 是绝对路径。
   - `denyRead` 的 path 集合 === `deniedReadPaths(roots, canon)`。
   - `denyWrite` 含 `/repo`、`/home/.xuegen`、库的 `.git`/`.jj`、`raw`、`wiki/prompts`、库根 `AGENTS.md`、`wiki/courses`、`wiki/courses.md`、`wiki/_generated/courses.md`、周期目录、日历（具体路径从 `rulePaths(roots, canon)` 取，不手写）。
   - `allowWrite` 含 `/home/learning` 和 `rulePaths(...).tmp` 的每一项。
2. **与 guard 一致（核心）**：定义「沙盒放行写 p」= p 在某个 allowWrite 项之内（`within`）且不在任何 denyWrite 项之内。对三个角色，取样本路径：`rulePaths` 每个键下每个目录/文件各取一个代表路径（目录取 `<dir>/x.md`，文件取它本身），再加库内几个不属于任何规则的路径（`/vault/wiki/x.md`、`/vault/notes/y.md`）。对每个样本断言：**沙盒放行 ⇒ `decide(role, "write", { path }, roots, canon, () => false).allow === true`**（沙盒绝不比 guard 宽）。反方向不要求（guard 放行、沙盒拦的是受保护位置，属设计）——但把「guard 放行而沙盒拦」的样本收集起来，断言它们全都落在 `courses`/`coursesBoard`/`cycles`/`calendar` 四个键里（多出别的就是漏抄）。
3. **课程会话不能经 bash 写课程页与概念页**：course 角色下 `/vault/wiki/courses/discrete-math-epp.md`、`/vault/wiki/knowledge/concepts/x.md`、`/vault/wiki/知识/concepts/x.md` 沙盒都不放行。free 角色写概念页沙盒放行。
4. **路径里有 glob 字符**：roots 换成 `vault: "/v[1]/库*"`，所有条目仍 `literal: true`、path 原样含 `[1]`、`*`。

## 发现问题时
测试 2 若发现沙盒比 guard 宽：改 `config.ts` 的清单让测试过，报告里写明是哪个键。不要为了让测试过而改 guard。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
新增测试数；测试 2 收集到的「guard 放行、沙盒拦」样本清单；发现并改了什么。
