# batch-stage4a1-sandbox（Devin 写基础代码）：沙盒配置生成 + bash 包装（新目录，先不接进程序）

设计定稿：`docs/platform/STAGE4A-DESIGN.md`（先读）。本批**只建新模块**，不改 `agent/guard/**`、`agent/session.ts`（另一批审核在改 guard），接入留到阶段 3 验收之后。不做界面。

## 硬约束（压缩后也要记得）
- 先读 `apps/desktop/AGENTS.md`、`apps/desktop/src/agent/guard/README.md`、`agent/guard/vault-paths.ts`（`rulePaths`、`deniedReadPaths`、`isDeniedReadPath`）、`agent/guard/roles.ts`（`writeAllowed` 的角色规则）。
- 依赖：在 `apps/desktop/package.json` 加 `"@anthropic-ai/sandbox-runtime": "0.0.81"`（**精确版本，不带 ^**，用户 11-09 同意），`npm install` 更新锁文件。读它的类型：`node_modules/@anthropic-ai/sandbox-runtime/dist/index.d.ts`、`dist/sandbox/sandbox-config.d.ts`、`README.md` 的「As a library」与「Configuration」两节。
- Pi/沙盒的值导入保持动态（`await import(...)`），模块顶层只 `import type`（理由同 `agent/session.ts` 文件头）。
- 新文件只在 `apps/desktop/src/agent/sandbox/`。单文件 ≤ 300 行、单函数 ≤ 50 行。不写新测试（DeepSeek 补），现有测试必须通过。不读写真实 `~/.xuegen/`、真实库；不启动 Electron；不 commit/push；不放宽 eslint。

## 1. `agent/sandbox/config.ts`（纯函数）
```ts
export function sandboxConfigFor(role: SessionRole, roots: Roots, canon: CanonFn): SandboxRuntimeConfig
```
- `filesystem.denyRead`：`deniedReadPaths(roots, canon)` 全部 + `<home>` 下凭据命名规则覆盖不到的就不加（沙盒按路径匹配，命名规则留在 guard）。
- `filesystem.allowWrite`：`roots.workspace`、`/private/tmp`、`roots.temp`（有就加）；加上**该角色在 guard 里本来就能直接写的库内位置**——照 `roles.ts` `writeAllowed` 的「任何会话都能写」那组（书房、阅读页、摘录、卡片、来源、分析、实体，新旧库名都列）与 `log.md`、`index.md` 两个文件；`control` 另加周期、科目、`profile.md`、课程看板之外的**不加**（课程页、周期页等受保护文件以后只经专用工具写）；`course` 另加科目目录；`free` 另加知识目录。**把这份清单写成一个从 `rulePaths` 取值的小表**，并在注释里写明「与 roles.ts writeAllowed 对应，改一处要改两处」，在报告里列出最终清单。
- `filesystem.denyWrite`：库的版本目录（`.jj`、`.git`）、`roots.repo`、`roots.home`、`raw/`、库规则（`wiki/prompts/`、库根 `AGENTS.md`）、`wiki/courses/`（含旧位置）、周期目录、日历目录。
- `network.allowedDomains: ["127.0.0.1:8765"]`，`deniedDomains: []`，`allowLocalBinding` **不设**（见第 3 节实测）。
- 所有路径用 `canon` 后的真实路径（`/private/tmp` 不写成 `/tmp`）。

## 2. `agent/sandbox/runner.ts`
```ts
export interface SandboxRunner { wrap(command: string, commandId: string, role: SessionRole): Promise<string>; annotate(commandId: string, stderr: string): string; reset(): Promise<void> }
export async function createSandboxRunner(roots: Roots, canon: CanonFn): Promise<SandboxRunner>
```
- 第一次 `wrap` 时 `SandboxManager.initialize(...)`；角色变化时用**单条命令的配置**（读类型确认 `wrapWithSandbox` 第 2/3 个参数能否传每条命令的配置；能就按角色传，不能就 `reset()` 后按新角色重新 initialize，在报告里说明用的哪种）。
- `wrap` 传 `{ commandId, commandText: command }`；`annotate` 调 `annotateStderrWithSandboxFailures(commandId, stderr)`。
- 平台不是 darwin 时 `wrap` 原样返回命令（并在注释说明：学根目前只在 macOS 上发布）。

## 3. 自测（写在 `/tmp` 的一次性脚本里，不进仓库；输出贴进报告）
用临时目录造 `roots`（库、工作区、home），对 `course` 角色 wrap 后用 `spawn(…, { shell: true })` 跑，逐条记结果：
1. `echo x > <工作区>/a.txt` → 成功；
2. `echo x > <库>/wiki/courses/c.md` → 失败（EPERM）；
3. `echo x > <库>/wiki/知识/extracts/e.md` → 成功；
4. `cat <home>/auth.json`（临时造一个假文件）→ 失败；
5. `mv <库>/wiki/courses/c.md <工作区>/` → 失败（issue #8）；
6. `curl -sS -m 5 https://example.com` → 被拦；
7. `node -e "fetch('http://127.0.0.1:8765').then(()=>console.log('ok'),e=>console.log(e.cause?.code||e.message))"` → 记录结果：`ECONNREFUSED`（没开 Anki，说明网络通到了本机端口）还是被沙盒拦（`EPERM`/代理拒绝）。**如果被拦，不要自己设 `allowLocalBinding`**，在报告里写清楚现象和两个可选办法（`allowLocalBinding: true` 放开全部本机端口 / 让 anki-sync 走代理环境变量），交给人定。
8. 每条命令额外开销：wrap + 跑 `true` 10 次的平均耗时。

## 验收命令（贴出最后几行）
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 2>&1 | tail -4 && npm run build 2>&1 | tail -2
git -C /Users/gjy/pi-learning/xuegen diff --stat -- apps/desktop/package.json apps/desktop/package-lock.json
```
## 结束报告（中文）
每节是否照做；allowWrite/denyWrite 最终清单；自测 8 条结果；单命令配置还是 reset 的选择；未完成项与要人定的事。
