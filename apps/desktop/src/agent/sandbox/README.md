# sandbox — bash 命令的系统沙盒（阶段 4a-1）

每个角色一份 `SandboxRuntimeConfig`，由 `config.ts` 按 guard 的同一份 `rulePaths` / `deniedReadPaths` 生成（不另写一套规则）。`runner.ts` 在第一次 `wrap` 时初始化 `SandboxManager`，每条命令用 `wrapWithSandbox` 的 per-command 配置按角色覆盖文件系统清单，被沙盒拦下的 stderr 经 `annotate` 补上原因。

- `config.ts`：纯函数 `sandboxConfigFor(role, roots, canon)`。`allowWrite` 照 `guard/roles.ts` 的 `writeAllowed`（改一处要改两处）；`denyWrite` 再加版本目录、repo、home、`raw/`、库规则与专用工具独占的位置（课程页与看板、周期、日历）；`denyRead` 即 `deniedReadPaths`；网络只放 `127.0.0.1:8765`（本机 AnkiConnect），不设 `allowLocalBinding`。
- `runner.ts`：`createSandboxRunner(roots, canon)` → `{ wrap, annotate, reset }`。仅 macOS 生效（学根目前只在 macOS 发布）；其它平台 `wrap` 原样返回命令。

尚未接入：`session.ts` / guard 的 bash 路径在阶段 3 验收之后才接进本模块。专用工具（`course_close`、`calendar_write`、`cycle_write`）在 agent 进程里跑、不进沙盒。
