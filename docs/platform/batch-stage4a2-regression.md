# batch-stage4a2-regression（DeepSeek，约 15 分钟）：沙盒接入的回归测试

4a-i2 已交（报告 `/Users/gjy/pi-learning/devin-stage4a-i2.log`，本地提交「阶段 4a-i2」）：guard 放行 bash 后改写进沙盒（`guard/extension.ts` 的 `sandboxWrap`，失败即拒）、`tool_result` 给出错的 bash 结果补违规原因、`session.ts` 在 macOS 上建 runner（`XUEGEN_SANDBOX=off` 关闭）、`skills/wiki-save/anki-sync.mjs` 的 `postViaProxy`、新工具 `tools/calendar-write-tool.ts`。**先写测试；测试暴露的真问题再改。**

## 硬约束
- 新建 `apps/desktop/src/agent/sandbox/sandbox.e2e.test.ts`、`apps/desktop/src/agent/tools/calendar-write-tool.test.ts`；改 `guard/extension.test.ts`、`guard/roles.test.ts`、`skills/wiki-save/anki-sync.test.mjs`。有真 bug 才改对应源文件。别碰 `SKILL.md`、`renderer/**`。不 commit/push、不加依赖。
- 真沙盒用例只在 `process.platform === "darwin"` 时跑（其余 `skip`）；全部在 `mkdtemp` 里造 vault/workspace/home，**不碰真实库、真实 `~/.xuegen`**。

## 测试
`sandbox.e2e.test.ts`（真 seatbelt：`createSandboxRunner` + `wrap` 后用 `/bin/bash -c` 跑，course 角色；每条断言退出码和文件是否存在）：
1. 写工作区成功；写 `<vault>/wiki/courses/x.md` 失败；写 `<vault>/wiki/知识/concepts/x.md` 失败（course 角色）、free 角色成功。
2. **mv 绕过**（issue #8）：预先放一个 `<vault>/wiki/courses/c.md`，`mv` 到工作区失败、`mv` 整个 `wiki/courses` 目录失败，原文件还在。
3. 读凭据失败：`cat <home>/auth.json`。
4. 外网失败：`curl -sS -m 5 https://example.com` 非 0。
5. Anki 端口：测试里起一个假 AnkiConnect（`http.createServer` 监听 127.0.0.1 随机端口不行——沙盒只放 8765；端口被占就 `skip` 并说明），在沙盒里用 `node` 跑 `anki-sync.mjs push <vault>`（vault 里放一张卡）→ 返回 `added: 1`。
6. `annotate`：第 1 条失败的 stderr 经 `annotate` 后含 `sandbox_violations` 或 `file-write`。

`extension.test.ts`（假 `SandboxRunner`，不跑真沙盒）：
7. 放行的 bash：`input.command` 被换成 `wrap` 的返回值；审计 `target` 是**原始**命令。
8. 被 guard 拒的 bash：`wrap` 不被调用。
9. `wrap` 抛错：返回 `{ block: true }`，原因含「沙盒启动失败」，审计多一行 `allow: false`。
10. `tool_result`：bash 出错 → 第一段 text 被 `annotate` 替换，其余 content 不变；bash 成功或非 bash → 不改。
11. 没传 `sandbox` 时 bash 行为与之前完全一样（命令不变、同步返回）。

`calendar-write-tool.test.ts`：argv 逐字（含空 text = 删除）、date 格式错抛中文错、`execute` 退出码 0 / 非 0（注入假 execFile）。`roles.test.ts`：三个角色调 `calendar_write` 都放行。

`anki-sync.test.mjs`：起一个本地假 HTTP 正向代理（收绝对 URL 请求行、检查 `Proxy-Authorization`、转发给假 AnkiConnect），设 `HTTP_PROXY=http://user:pass@127.0.0.1:<port>`，`invoke` 走代理拿到 result；代理 URL 不带凭据时不发该头；没有 `HTTP_PROXY` 时走 fetch（原有用例不变）。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen && npm test 2>&1 | grep -E '^# (pass|fail)'
cd apps/desktop && npm run typecheck && npm run lint && npx vitest run --testTimeout=60000 src/agent 2>&1 | tail -4
```
## 结束报告（中文，必须输出）
新增测试数（真沙盒几条、是否全部真跑）、发现的问题及修改、验收输出。
