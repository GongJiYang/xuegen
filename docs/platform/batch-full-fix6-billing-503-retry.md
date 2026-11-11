# batch-full-fix6-billing-503-retry（DeepSeek 返修，约 15 分钟，TDD）：OpenDesign 临时 503 不自动重试

用户 11-11 同意在学根这层补重试。

## 现象与根因（Claude 已查清）
- 现象：测试窗口开离散 D3 时中转返回
  `503: {"code":"database_unavailable","message":"[code=database_unavailable] resolve Billing Scope: status 503: database_unavailable","type":"database_unavailable"}`，
  学根没有显示「正在自动重试」，直接「模型出错了」。11-09/11-10 的 `workspace_billing_scope_unavailable` 同类。
- 根因：Pi 的 `AgentSession._isRetryableError`（`node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` 约 3010 行）调 pi-ai 的 `isRetryableAssistantError`；后者先查「不可重试」表，表里有 `billing`（本意是额度/账单用完）。OpenDesign 的临时 503 文字里有「Billing Scope」→ 被当成额度错误，不重试。

## 改法（先写失败测试，再改）
只新建 / 改这些文件：`apps/desktop/src/agent/transient-error.ts`（新）、`apps/desktop/src/agent/transient-error.test.ts`（新）、`apps/desktop/src/agent/session.ts`。不改 `node_modules`、别的文件。不 commit/push、不加依赖。
- **自己做完，不要再调用 `pi`、`devin` 或任何别的 agent。**

1. 先写 `transient-error.test.ts`，确认失败（模块还不存在）：
   - `isTransientProviderError(text)`：
     - true：上面那条原文；`503 ... workspace_billing_scope_unavailable ...`；`status 503: database_unavailable`。
     - false：`402 Insufficient Balance`；`insufficient_quota`；`billing hard limit reached`（没有 503）；`503` 但文字是 `quota exceeded`；空串。
     规则：文字含独立的 `503`，并且含 `billing[\s_-]*scope` 或 `database_unavailable`（不分大小写），并且**不含** `insufficient|quota|balance|limit reached`。
   - `withTransientRetry(session)`：给一个假对象 `{ _isRetryableError: (m) => false }` 包一层后，`stopReason: "error"` + 上面原文 → true；`stopReason: "error"` + `402 Insufficient Balance` → false；`stopReason: "stop"` → false；原函数返回 true 的照旧 true。对象上没有 `_isRetryableError` 函数时原样返回、不抛错。
   - 钉住依赖：`import { AgentSession } from "@earendil-works/pi-coding-agent"`（或包里实际导出 AgentSession 的路径），断言 `typeof AgentSession.prototype._isRetryableError === "function"`——Pi 升级改名时这条测试先红。
2. 实现 `transient-error.ts`（文件头注释照 `agent/` 下其他文件的风格，说明为什么要它：Pi 把含 billing 的错误一律当额度用完，OpenDesign 的临时 503 被误判）。导出上面两个函数；`withTransientRetry` 在实例上包 `_isRetryableError`：`(m) => original(m) || (m?.stopReason === "error" && isTransientProviderError(m.errorMessage ?? ""))`。
3. `session.ts`：`createAgentSession` 之后、`bindExtensions` 之前调 `withTransientRetry(session)`，加一句注释。

## 验收命令
```sh
cd /Users/gjy/pi-learning/xuegen/apps/desktop && npx vitest run src/agent/transient-error.test.ts 2>&1 | tail -3 && npm run -s typecheck && npm run -s lint && npm test 2>&1 | grep -E "Tests|Test Files"
```

## 结束报告（中文）
第 1 步失败输出、改动、验收输出。
