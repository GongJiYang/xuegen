# sandbox — bash 命令的系统沙盒（阶段 4a）

每个角色一份 `SandboxRuntimeConfig`，由 `config.ts` 按 guard 的同一份 `rulePaths` / `deniedReadPaths` 生成（不另写一套规则）。`runner.ts` 在第一次 `wrap` 时初始化 `SandboxManager`，每条命令用 `wrapWithSandbox` 的 per-command 配置按角色覆盖文件系统清单，被沙盒拦下的 stderr 经 `annotate` 补上原因。

- `config.ts`：纯函数 `sandboxConfigFor(role, roots, canon)`。`allowWrite` 照 `guard/roles.ts` 的 `writeAllowed`（改一处要改两处）；`denyWrite` 再加版本目录、repo、home、`raw/`、库规则与专用工具独占的位置（课程页与看板、周期、日历）；`denyRead` 即 `deniedReadPaths`；网络只放 `127.0.0.1:8765`（本机 AnkiConnect），不设 `allowLocalBinding`。
- `runner.ts`：`createSandboxRunner(roots, canon)` → `{ wrap, annotate, reset }`。仅 macOS 生效（学根目前只在 macOS 发布）；其它平台 `wrap` 原样返回命令。

已接入（4a-i2）：`session.ts` 在 macOS 上创建 runner 传给 guard；guard 放行 bash 后改写命令进沙盒，`wrap` 失败即拒（fail closed），出错结果经 `annotate` 补上违规原因；`XUEGEN_SANDBOX=off` 关闭（救急用）。会话 `dispose` 时 `reset`。专用工具 `course_close`、`course_plan`、`calendar_write` 在 agent 进程里跑、不进沙盒（`cycle_write` 用户 11-10 定不做：`cycle.mjs` 只读，周期页由编辑工具写、guard 管）。**库优先**（4a-2 回归发现并修）：包含整个库的写清单项（例如库放在临时目录下时的 `/private/tmp`）不收，否则角色清单失效；代价是这种布局下 bash 不能在那个临时目录写草稿（写到工作区或 `os.tmpdir()`）。本机 AnkiConnect 只能经沙盒代理连（`skills/wiki-save/anki-sync.mjs` 的 `postViaProxy`，带代理凭据头）。
