# batch-stage2-guard（Devin 写基础代码）：会话角色、路径规范化、写死的权限清单、工具层拦截

路线 `docs/platform/ROUTE-1109.md` 阶段 2；设计见 `docs/platform/ARCH-DISCUSSION-1109.md` 第 7.1、7.2、10.2 节。**不做任何界面**（用户 11-09：界面暂停）——不改 `renderer/skins/**`；被拦下时只把原因返回给模型并写审计，不弹框（弹框批准等界面讨论后再做）。

## 硬约束（压缩后也要记得）

- 先读 `AGENTS.md`、`apps/desktop/AGENTS.md`、`apps/desktop/src/agent/README.md`、`docs/platform/PRINCIPLES.md`、`docs/platform/ARCH-DISCUSSION-1109.md` 第 7、10 节，以及 Pi 的扩展文档 `node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`（`tool_call` 处理器可以返回 `{ block: true, reason }`；嵌套调用也经过它）。
- 决策逻辑全是纯函数并有同名测试位置（测试由 DeepSeek 补，你只保证现有测试通过）；Pi 的值导入保持动态（见 `agent/session.ts` 文件头）。
- 不读写真实 `~/.xuegen/`、不碰真实库 `~/学根/库`、不启动 Electron、不 commit/push、不加依赖、不放宽 eslint、不加 `eslint-disable`/`@ts-ignore`。`App.tsx` 不加行。

## 1. 路径规范化（纯函数）`apps/desktop/src/agent/guard/path.ts`

```ts
export interface PathFacts {
  realpath(p: string): string;          // 抛 ENOENT 表示不存在
  caseInsensitive(dir: string): boolean; // 这个卷是否不区分大小写
}
/** 规范化一个工具给的路径：相对路径按 cwd 解析；不存在的部分拼回最深一层已存在的上级的 realpath；转 NFC；卷不区分大小写时转小写。 */
export function canonical(path: string, cwd: string, facts: PathFacts): string
/** child 是否在 parent 里面（按路径分段比较，`/a/bc` 不在 `/a/b` 里；相等也算在里面）。两者都必须是 canonical 的结果。 */
export function within(child: string, parent: string): boolean
```
- `canonical` 的步骤固定为：`resolve(cwd, path)` → 从完整路径往上找第一个 `realpath` 成功的祖先，把剩余段拼回去 → `normalize("NFC")` → `caseInsensitive(那个祖先)` 为真时 `toLowerCase()`。
- 真实的 `PathFacts` 放在 `guard/facts.ts`：`realpath` 用 `fs.realpathSync.native`；`caseInsensitive(dir)` 用「对 `dir` 的大小写翻转版本做 `fs.statSync`，`ino` 相同即不区分」，结果按卷（`statSync(dir).dev`）缓存。
- **检查与执行用同一个规范化结果**：拦截器放行时，把 `event.input.path` 改写成规范化前已解析的绝对路径（`resolve` 后、未转小写的那一份），让工具写的就是检查过的那个路径（Pi 允许 `tool_call` 修改 input）。

## 2. 角色与清单（写死，纯数据 + 纯函数）`apps/desktop/src/agent/guard/roles.ts`

```ts
export type SessionRole =
  | { kind: "control" }
  | { kind: "course"; slug: string }
  | { kind: "free" };
export interface Roots { vault: string; workspace: string; home: string; repo: string }  // 都已 canonical
export interface Decision { allow: boolean; reason: string }
export function decide(role: SessionRole, tool: string, input: Record<string, unknown>, roots: Roots, canon: (p: string) => string): Decision
```
规则（`V` = 库根，`W` = 工作区，`H` = XUEGEN_HOME，`R` = 仓库根或 `H/app`）：

| 工具 | 所有角色都适用 |
|---|---|
| read / grep / find / ls | 允许 `V`、`W`、`R`、`/private/tmp`；**拒绝** `H/auth.json`、`H/mcp-auth.json`、`H/models-store.json`、`~/.ssh`、`~/.aws`、`~/Library/Keychains`；其余位置拒绝 |
| write / edit | 永远拒绝：`V/.git/**`、`V/.jj/**`、`R/**`、`H/**`、`V/raw/**`（原料只读，准则第 1 条）；`V`、`W`、`/private/tmp` 以外一律拒绝 |

按角色再限定 write / edit（在上面基础上）：

| 角色 | 允许写 |
|---|---|
| control | `W/**`、`V/wiki/log.md`、`V/wiki/cycles/**`、`V/wiki/courses/*.md`（改计划）、`V/wiki/courses.md` |
| course(slug) | `W/**`、`V/wiki/知识/**`、`V/wiki/subjects/**`（讲解偏好）、`V/wiki/courses/<slug>.md`、`V/wiki/courses/<slug>/**`、`V/wiki/courses/<slug>-*.png`、`V/wiki/log.md`、`V/wiki/index.md`；**不能写别的课程页** |
| free | `W/**`、`V/wiki/知识/**`、`V/Clippings/**`、`V/wiki/log.md`、`V/wiki/index.md` |

bash（本阶段只做能确定的部分，完整限制靠阶段 4 的系统沙盒）：
- 命令里出现被拒绝读取的路径（上面的凭证路径）→ 拒绝。
- 命令匹配 `/\brm\s+-[a-z]*r[a-z]*f?\b/` 且目标不在 `W` 或 `/private/tmp` 里 → 拒绝。
- 命令里有 `chmod` / `chflags` 且目标在 `V/wiki/courses` 下、又不是经 `course-state.mjs` 调用 → 拒绝（课程页的锁只由脚本动）。
- 其余放行，但**全部写审计**。

`reason` 用中文写清楚「哪个角色、为什么不行、该怎么做」，例如「课程会话（discrete-math-epp）不能改 ctm 的课程页；要改计划请回总控」。

## 3. 拦截扩展 `apps/desktop/src/agent/guard/extension.ts`

- 一个 Pi extension factory：`pi.on("tool_call", (event) => …)` 调 `decide`；`allow: false` → `return { block: true, reason }`；`allow: true` → 按第 1 节改写 `input.path` 后放行。
- 每次判定都追加一行审计到 `H/guard.log`（JSONL：时间、会话 id、角色、工具、规范化路径或命令前 200 字、allow、reason），文件超过 5 MB 时轮转成 `guard.log.1`。
- 在 `agent/session.ts` 的 `extensionFactories` 里加上它（排在现有扩展之前）。

## 4. 角色从哪里来

- `shared/protocol.ts`：主进程 → agent 的 `new-session` / `open-session` 消息加可选字段 `role?: SessionRole`（类型放 `shared/`，`guard/roles.ts` 从那里引）；接收端运行时校验（`kind` 合法、`course` 的 `slug` 匹配 `/^[a-z0-9-]+$/`），非法或缺省按 `free`。
- 发送端（`renderer/core/**`，**不改皮肤**）：总控会话发 `{kind:"control"}`；课程会话（开课、回到这节课、打开某门课的会话）发 `{kind:"course", slug}`；其余 `free`。找到现在发这两种消息的地方逐个补上。
- agent 进程启动时自动恢复的最近会话：从会话文件开头的开课标记 `⟦xuegen:open|<slug>|…⟧` 或现有判断课程的逻辑推出角色，推不出就 `free`。
- `ready` / `state` 消息里带上当前 `role`，界面暂不显示（界面讨论后再用）。

## 5. 文档

`agent/README.md` 补 `guard/` 一节；`docs/platform/ARCH-DISCUSSION-1109.md` 不改（Claude 改）。

## 完成标准（可观察）

- typecheck / lint / vitest / build 全过；`App.tsx` ≤ 450 行。
- `decide` 对下面每个例子给出预期结果（写在报告里，用一个临时脚本跑出来）：course(discrete-math-epp) 写 `V/wiki/courses/ctm.md` → 拒；写 `V/wiki/courses/discrete-math-epp.md` → 允；任何角色 read `H/auth.json` → 拒；任何角色 write `V/raw/x.md` → 拒；free 写 `V/wiki/courses/ctm.md` → 拒；路径 `V/WIKI/Courses/CTM.md`（大小写不同）→ 与原路径同判定；`V/wiki/../wiki/courses/ctm.md` → 同判定；NFD 写法的中文路径 → 同判定。

## 验收命令（贴出最后几行输出）

```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -6 && npm run build 2>&1 | tail -2
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | tail -4 && wc -l apps/desktop/src/renderer/App.tsx && git status --short
```

## 结束报告（中文）

改了哪些文件、每节是否照做、偏离之处及原因、未完成项，附验收输出与「完成标准」里每个例子的实际判定。

## 注意

另一个审核正在同时改 `skills/wiki-save/anki-sync*`、`bin/xuegen-data-root*`、`shared/data-protocol*`、`main/data/handler*`、`main/data/run-script*`，别碰；它们的测试暂时失败时稍后重跑，不要修。断线重试的返修刚改过 `agent/event-mapper.ts`、`agent/history.ts`、`agent/environment.ts`、`agent/session.ts`、`renderer/core/chat/**`，在它的基础上改，不要回退。
