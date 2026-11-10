# batch-stage4a-i2（Devin）：把 bash 接进沙盒 + Anki 走代理 + `calendar_write`

设计：`docs/platform/STAGE4A-DESIGN.md`（用户 11-09、11-10 定）。4a-1 已写好 `apps/desktop/src/agent/sandbox/{config,runner}.ts`（未接入）；4a-i1 已把总控写课程页改走 `course_plan`、看板改由 `course-close.mjs` 提交时重画。这一批把沙盒真正接上。

## 硬约束
- 只改/新建：`apps/desktop/src/agent/guard/extension.ts`、`apps/desktop/src/agent/guard/roles.ts`、`apps/desktop/src/agent/session.ts`、`apps/desktop/src/agent/sandbox/runner.ts`（只在需要时）、新建 `apps/desktop/src/agent/tools/calendar-write-tool.ts`、`apps/desktop/src/agent/README.md`、`skills/wiki-save/anki-sync.mjs`。别碰 `SKILL.md`（Claude 改）、`renderer/**`、`course-close.mjs`。
- **不写新测试**（DeepSeek 下一单补）；现有测试必须全过（测试里没有 runner 的地方 guard 必须照旧工作）。不 commit/push、不加依赖（**不许引 undici 等新包**）、不放宽 eslint。新函数 < 50 行。

## 一、guard 接沙盒（`guard/extension.ts`）
1. `GuardOptions` 加可选 `sandbox?: SandboxRunner`（`../sandbox/runner.js` 的接口）。不传时行为与现在完全一样（测试走这条）。
2. `tool_call` 处理器改成 `async`。`bash` 被放行（`decision.allow`）且 `options.sandbox` 存在时：`input.command = await options.sandbox.wrap(String(input.command), event.toolCallId, role);`。`wrap` 抛错 → **fail closed**：`return { block: true, reason: "沙盒启动失败（<原因>），这次 bash 没有运行；请告诉用户。" }`，并在审计里记一行 `allow:false`。
3. 新增 `pi.on("tool_result", …)`：`event.toolName === "bash"`、`options.sandbox` 存在且 `event.isError` 时，把 `content` 里第一段 text 换成 `options.sandbox.annotate(event.toolCallId, <原文本>)`，原样返回其余字段（`{ content: [...] }`）。不是 bash 或没出错就不返回（undefined）。
4. 审计：bash 记 `target` 仍是**原始命令**（改写前），不要记包装后的长命令。

## 二、`session.ts` 创建 runner
5. 在创建 guard 之前：`const sandbox = process.platform === "darwin" ? await createSandboxRunner(roots, canonFor(facts)) : undefined;`，传给 `createGuardExtension({ …, sandbox })`。`canonFor`：用 guard 现有的 `canonicalParts(expandTilde(p, homedir()), cwd, facts).canonical` 包一层（若 guard 已有同等导出函数就复用，别新写一套规范化）。
6. 会话结束/进程退出时 `await sandbox?.reset()`（找 session 现有的 dispose/close 钩子挂上；没有就在报告里说明挂在哪）。
7. **开关**：环境变量 `XUEGEN_SANDBOX=off` 时不创建 runner（给出问题时临时关掉用），在 `session.ts` 文件头注释写明。

## 三、Anki 走沙盒代理（`skills/wiki-save/anki-sync.mjs`）
8. `invoke(url, …)`：当 `process.env.HTTP_PROXY`（或 `http_proxy`）存在、且 `url` 是 `http://127.0.0.1…` 或 `http://localhost…` 时，**不用 fetch**，改用 `node:http` 经代理发：`http.request({ host: <代理主机>, port: <代理端口>, method: "POST", path: <完整目标 URL>, headers: { Host: "<目标 host:port>", "Content-Type": "application/json", "Content-Length": … } })`（HTTP 正向代理的绝对 URL 请求行；4a-1 自测已证明 `curl -x $HTTP_PROXY http://127.0.0.1:8765/` 能通）。超时、`body.error` 抛错的语义与现在的 fetch 分支一致。没有代理变量时**照旧用 fetch**（沙盒外、测试里不变）。
9. 抽一个小函数 `postViaProxy(proxyUrl, targetUrl, bodyText, signal)`（< 50 行），`invoke` 只做分支。文件头注释加一句为什么（沙盒里直连本机端口被拦，只有经代理才放行）。

## 四、`calendar_write` 工具（`tools/calendar-write-tool.ts`，照 `course-plan-tool.ts` 的结构，用 `run-script.ts`）
10. 参数：`date`（必填，`YYYY-MM-DD`，否则抛中文错）、`text`（必填；空字符串表示删掉那天的笔记）。调用 `skills/calendar/calendar.mjs write <vault> <date> --text <text>`（先看 `calendar.mjs` 的 `write` 实际参数，照它拼）。返回脚本 stdout；失败 `isError: true`。
11. description：「写日历笔记（wiki/calendar/<日期>.md）：用户明确说『记一下 / 记在某天 / 安排某天』时用。正文为空即删除那天的笔记。」
12. guard：`roles.ts` 的 `decide` 加 `if (tool === "calendar_write") return ALLOW;`（任何会话都能记日历，与现在 bash 跑 calendar.mjs 的范围一致）；`extension.ts` 的 `GUARDED_TOOLS` 加它，审计 target 记 `date`。`session.ts` 注册 `{ name: "calendar-write", factory: createCalendarWriteExtension({ repo: repoRoot, home }) }`。
13. `agent/README.md` tools 一节加一行。

## 自测（报告里贴输出；用测试 home，不碰真实 `~/.xuegen` 与真实库）
在 `apps/desktop` 写一个临时脚本（放 `/tmp`，不进仓库）：用 `createSandboxRunner` + course 角色、mkdtemp 造 vault/workspace/home，`wrap` 后用 `/bin/bash -c` 执行：
- `echo x > <vault>/wiki/courses/c.md` → 失败，`annotate` 后 stderr 里有沙盒原因；
- `echo x > <workspace>/a.txt` → 成功；
- 起一个假 AnkiConnect（`node -e` 在 127.0.0.1:8765 回 `{"result":6,"error":null}`），在沙盒里跑 `node skills/wiki-save/anki-sync.mjs` 里 `invoke` 的等价调用（或直接 `node -e` import 它的导出函数，若未导出就临时写一段同样的 postViaProxy 调用）→ 拿到 6；
- `curl -sS -m 5 https://example.com` → 失败。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | grep -E '^# (pass|fail)' && npm run lint:skills 2>&1 | tail -1
cd apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent 2>&1 | tail -4 && npm run build 2>&1 | tail -2
```
## 结束报告（中文，必须输出）
每条编号做了没有、自测 4 条输出、验收输出、第 6 条 reset 挂在哪、偏离规格之处及原因。
